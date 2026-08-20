/**
 * Menu item controller.
 *
 * Public: GET /api/restaurants/:restaurantId/menu — list a restaurant's menu
 * Vendor: POST create, PUT update, DELETE remove (owner of the restaurant)
 *
 * STRICT RULE: every menu item must have AT LEAST 2 uploaded images.
 *   - create: multipart form with >= 2 files in the "images" field
 *   - update: if new files are provided they must be >= 2 and REPLACE the
 *             existing set; if no files are provided the existing images
 *             are kept (the invariant is never allowed to drop below 2).
 */
const db = require('../config/db');
const { publicUrl, cleanupFiles } = require('../config/uploads');

/* ------------------------------------------------------------------ */
/* attachImages — attach the ordered image URLs to menu item rows.     */
/* Exported so restaurantController can reuse it for /restaurants/:id. */
/* ------------------------------------------------------------------ */
async function attachImages(items) {
  if (!items || items.length === 0) return items;
  const ids = items.map((i) => i.id);
  const [imgs] = await db.query(
    `SELECT menu_item_id, image_url, position
     FROM menu_item_images
     WHERE menu_item_id IN (?)
     ORDER BY menu_item_id, position`,
    [ids]
  );
  const byItem = new Map();
  for (const img of imgs) {
    if (!byItem.has(img.menu_item_id)) byItem.set(img.menu_item_id, []);
    byItem.get(img.menu_item_id).push(img.image_url);
  }
  return items.map((item) => ({ ...item, images: byItem.get(item.id) || [] }));
}

/* ------------------------------------------------------------------ */
/* GET /api/menu-items  (public)                                       */
/* All available foods across ALL active restaurants.                  */
/* Query: ?search=grill  ?category=Mains  ?restaurantId=3              */
/* Only is_available items from is_active restaurants are returned.    */
/* ------------------------------------------------------------------ */
async function listAllMenuItems(req, res, next) {
  try {
    const search = req.query.search;
    const category = req.query.category;
    const restaurantId = req.query.restaurantId ? Number(req.query.restaurantId) : null;
    const params = [];

    let sql = `
      SELECT mi.id, mi.name, mi.description, mi.price, mi.category, mi.image_url,
             mi.is_available, mi.restaurant_id, r.name AS restaurant_name
      FROM menu_items mi
      JOIN restaurants r ON r.id = mi.restaurant_id
      WHERE mi.is_available = 1 AND r.is_active = 1`;

    if (category) {
      sql += ' AND mi.category = ?';
      params.push(category);
    }
    if (restaurantId && Number.isInteger(restaurantId) && restaurantId > 0) {
      sql += ' AND mi.restaurant_id = ?';
      params.push(restaurantId);
    }
    if (search) {
      // Escape LIKE wildcards so user input can't break the pattern.
      const escaped = String(search).replace(/[\\%_]/g, '\\$&');
      sql += ' AND mi.name LIKE ?';
      params.push(`%${escaped}%`);
    }

    sql += ' ORDER BY r.name, mi.category, mi.name';

    const [rows] = await db.query(sql, params);
    return res.json({ items: await attachImages(rows) });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/restaurants/:restaurantId/menu  (public)                   */
/* Lists all items for a restaurant (availability flag included).      */
/* ------------------------------------------------------------------ */
async function listMenuItems(req, res, next) {
  try {
    const restaurantId = Number(req.params.restaurantId);
    if (!Number.isInteger(restaurantId) || restaurantId < 1) {
      return res.status(400).json({ error: 'Invalid restaurant id.' });
    }

    const [rows] = await db.query(
      `SELECT id, name, description, price, category, image_url, is_available, created_at
       FROM menu_items
       WHERE restaurant_id = ?
       ORDER BY category, name`,
      [restaurantId]
    );

    return res.json({ menu: await attachImages(rows) });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* POST /api/restaurants/:restaurantId/menu  (vendor owns restaurant)  */
/* Multipart fields: name (req), price (req), description, category,   */
/*                   is_available                                      */
/* Files:            images[] — AT LEAST 2 required (STRICT).          */
/* ------------------------------------------------------------------ */
async function createMenuItem(req, res, next) {
  try {
    const { name, description = null, category = null } = req.body;
    const price = Number(req.body.price);
    const isAvailable = req.body.is_available === undefined ? true : req.body.is_available === 'true' || req.body.is_available === true;
    const files = req.files || [];

    // STRICT: at least 2 images.
    if (files.length < 2) {
      cleanupFiles(files); // don't leave orphan files on disk
      return res.status(422).json({
        error: `At least 2 images are required (got ${files.length}).`,
      });
    }

    // Cover image = first upload (kept in menu_items.image_url for
    // backward compatibility with code that reads the single column).
    const cover = publicUrl(files[0]);

    const [result] = await db.query(
      `INSERT INTO menu_items (restaurant_id, name, description, price, category, image_url, is_available)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.restaurant.id, name, description, price, category, cover, isAvailable ? 1 : 0]
    );

    // Insert every image into the child table (ordered).
    const itemId = result.insertId;
    for (let i = 0; i < files.length; i++) {
      await db.query(
        `INSERT INTO menu_item_images (menu_item_id, image_url, position) VALUES (?, ?, ?)`,
        [itemId, publicUrl(files[i]), i]
      );
    }

    const [rows] = await db.query('SELECT * FROM menu_items WHERE id = ?', [itemId]);
    const [withImages] = await attachImages(rows);
    return res.status(201).json({ message: 'Menu item created.', item: withImages });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* PUT /api/menu/:itemId  (vendor owns restaurant)                     */
/* Partial update. Multipart fields optional; files optional.          */
/* If files are provided they must be >= 2 and REPLACE the existing    */
/* image set; otherwise existing images are kept.                      */
/* ------------------------------------------------------------------ */
async function updateMenuItem(req, res, next) {
  try {
    const files = req.files || [];

    // If the caller sends images, they replace the whole set (>= 2).
    if (files.length > 0 && files.length < 2) {
      cleanupFiles(files);
      return res.status(422).json({
        error: `At least 2 images are required when replacing photos (got ${files.length}).`,
      });
    }

    const { name, description, price, category, is_available } = req.body;
    const sets = [];
    const params = [];

    if (name !== undefined) { sets.push('name = ?'); params.push(name); }
    if (description !== undefined) { sets.push('description = ?'); params.push(description); }
    if (price !== undefined) { sets.push('price = ?'); params.push(Number(price)); }
    if (category !== undefined) { sets.push('category = ?'); params.push(category); }
    if (is_available !== undefined) {
      sets.push('is_available = ?');
      params.push(is_available === 'true' || is_available === true ? 1 : 0);
    }
    if (files.length > 0) {
      sets.push('image_url = ?');
      params.push(publicUrl(files[0]));
    }

    if (sets.length === 0 && files.length === 0) {
      return res.status(422).json({ error: 'Nothing to update.' });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Replace the image set when new files were uploaded.
      if (files.length > 0) {
        await conn.query('DELETE FROM menu_item_images WHERE menu_item_id = ?', [req.menuItem.id]);
        for (let i = 0; i < files.length; i++) {
          await conn.query(
            `INSERT INTO menu_item_images (menu_item_id, image_url, position) VALUES (?, ?, ?)`,
            [req.menuItem.id, publicUrl(files[i]), i]
          );
        }
      }

      await conn.query(
        `UPDATE menu_items SET ${sets.join(', ')} WHERE id = ?`,
        [...params, req.menuItem.id]
      );

      await conn.commit();
      conn.release();
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }

    const [rows] = await db.query('SELECT * FROM menu_items WHERE id = ?', [req.menuItem.id]);
    const [withImages] = await attachImages(rows);
    return res.json({ message: 'Menu item updated.', item: withImages });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* DELETE /api/menu/:itemId  (vendor owns restaurant)                  */
/* Hard delete — blocked gracefully if order history references it.    */
/* Child images are removed by the FK ON DELETE CASCADE.               */
/* ------------------------------------------------------------------ */
async function deleteMenuItem(req, res, next) {
  try {
    await db.query('DELETE FROM menu_items WHERE id = ?', [req.menuItem.id]);
    return res.json({ message: 'Menu item deleted.', item: { id: req.menuItem.id } });
  } catch (err) {
    // FK violation (order_items.menu_item_id RESTRICT)
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({
        error: 'This menu item is referenced by past orders and cannot be deleted. Set is_available=false instead.',
      });
    }
    return next(err);
  }
}

module.exports = { listMenuItems, listAllMenuItems, createMenuItem, updateMenuItem, deleteMenuItem, attachImages };