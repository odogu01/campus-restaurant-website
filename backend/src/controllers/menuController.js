/**
 * Menu item controller.
 *
 * Public: GET /api/restaurants/:restaurantId/menu — list a restaurant's menu
 *         GET /api/menu-items — every available item across restaurants
 * Vendor: POST create, PUT update, DELETE remove (owner of the restaurant)
 *
 * STRICT RULES:
 *   - every menu item must have AT LEAST 2 uploaded images
 *   - the item NAME comes from the restaurant's FOODS list (food_id);
 *     the name is denormalized into menu_items.name as a snapshot
 *   - the vendor picks which PROTEINS are available with the item
 *     (menu_item_proteins); customers see exactly those, with the
 *     restaurant's PRIMARY protein preselected by default
 *   - there is NO category anymore (product decision)
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
/* attachProteins — attach the proteins available with each item.      */
/* Returns [{ id, name, price, is_primary }] per item.                 */
/* Exported so restaurantController can reuse it.                      */
/* ------------------------------------------------------------------ */
async function attachProteins(items) {
  if (!items || items.length === 0) return items;
  const ids = items.map((i) => i.id);
  const [rows] = await db.query(
    `SELECT mip.menu_item_id, p.id, p.name, p.price, p.is_primary
     FROM menu_item_proteins mip
     JOIN proteins p ON p.id = mip.protein_id
     WHERE mip.menu_item_id IN (?)
     ORDER BY mip.menu_item_id, p.is_primary DESC, p.name`,
    [ids]
  );
  const byItem = new Map();
  for (const row of rows) {
    if (!byItem.has(row.menu_item_id)) byItem.set(row.menu_item_id, []);
    byItem.get(row.menu_item_id).push({
      id: row.id,
      name: row.name,
      price: Number(row.price),
      is_primary: row.is_primary === 1,
    });
  }
  return items.map((item) => ({ ...item, proteins: byItem.get(item.id) || [] }));
}

/* ------------------------------------------------------------------ */
/* GET /api/menu-items  (public)                                       */
/* All available foods across ALL active restaurants.                  */
/* Query: ?search=grill  ?restaurantId=3                               */
/* Only is_available items from is_active restaurants are returned.    */
/* ------------------------------------------------------------------ */
async function listAllMenuItems(req, res, next) {
  try {
    const search = req.query.search;
    const restaurantId = req.query.restaurantId ? Number(req.query.restaurantId) : null;
    const params = [];

    let sql = `
      SELECT mi.id, mi.food_id, mi.name, mi.description, mi.price, mi.image_url,
             mi.is_available, mi.restaurant_id, r.name AS restaurant_name
      FROM menu_items mi
      JOIN restaurants r ON r.id = mi.restaurant_id
      WHERE mi.is_available = 1 AND r.is_active = 1`;

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

    sql += ' ORDER BY r.name, mi.name';

    const [rows] = await db.query(sql, params);
    const withImages = await attachImages(rows);
    return res.json({ items: await attachProteins(withImages) });
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
      `SELECT id, food_id, name, description, price, image_url, is_available, created_at
       FROM menu_items
       WHERE restaurant_id = ?
       ORDER BY name`,
      [restaurantId]
    );

    const withImages = await attachImages(rows);
    return res.json({ menu: await attachProteins(withImages) });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* Normalize protein_ids from a multipart or JSON body into an array   */
/* of positive integers. Returns null when the field is absent.        */
/* ------------------------------------------------------------------ */
function normalizeProteinIds(body) {
  if (body.protein_ids === undefined && body.proteinIds === undefined) return null;
  const raw = body.protein_ids !== undefined ? body.protein_ids : body.proteinIds;
  const arr = Array.isArray(raw) ? raw : [raw];
  const ids = arr
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
    .map((v) => Number(v));
  if (ids.some((n) => !Number.isInteger(n) || n < 1)) return 'invalid';
  return [...new Set(ids)];
}

/* ------------------------------------------------------------------ */
/* POST /api/restaurants/:restaurantId/menu  (vendor owns restaurant)  */
/* Multipart fields: food_id (req), price (req), protein_ids[] (opt),  */
/*                   description, is_available                         */
/* Files:            images[] — AT LEAST 2 required (STRICT).          */
/* The item name is taken from the restaurant's foods list.            */
/* ------------------------------------------------------------------ */
async function createMenuItem(req, res, next) {
  try {
    const foodId = Number(req.body.food_id || req.body.foodId);
    const { description = null } = req.body;
    const price = Number(req.body.price);
    const isAvailable = req.body.is_available === undefined ? true : req.body.is_available === 'true' || req.body.is_available === true;
    const files = req.files || [];
    const proteinIds = normalizeProteinIds(req.body);

    // STRICT: at least 2 images.
    if (files.length < 2) {
      cleanupFiles(files); // don't leave orphan files on disk
      return res.status(422).json({
        error: `At least 2 images are required (got ${files.length}).`,
      });
    }
    if (!Number.isInteger(foodId) || foodId < 1) {
      cleanupFiles(files);
      return res.status(422).json({ error: 'A food must be selected for the item.' });
    }
    if (!Number.isFinite(price) || price < 0) {
      cleanupFiles(files);
      return res.status(422).json({ error: 'Price must be a positive number.' });
    }
    if (proteinIds === 'invalid') {
      cleanupFiles(files);
      return res.status(422).json({ error: 'Invalid protein selection.' });
    }

    // The food must belong to this restaurant (its name becomes the item name).
    const [foodRows] = await db.query(
      'SELECT id, name FROM foods WHERE id = ? AND restaurant_id = ?',
      [foodId, req.restaurant.id]
    );
    if (foodRows.length === 0) {
      cleanupFiles(files);
      return res.status(404).json({ error: 'Food not found on this restaurant.' });
    }

    // Every selected protein must belong to this restaurant.
    let proteins = [];
    if (proteinIds && proteinIds.length > 0) {
      const [pRows] = await db.query(
        `SELECT id FROM proteins WHERE restaurant_id = ? AND id IN (?)`,
        [req.restaurant.id, proteinIds]
      );
      if (pRows.length !== proteinIds.length) {
        cleanupFiles(files);
        return res.status(422).json({ error: 'One or more proteins do not belong to this restaurant.' });
      }
      proteins = proteinIds;
    }

    // Cover image = first upload (kept in menu_items.image_url for
    // backward compatibility with code that reads the single column).
    const cover = publicUrl(files[0]);

    const conn = await db.getConnection();
    let itemId;
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        `INSERT INTO menu_items (restaurant_id, food_id, name, description, price, image_url, is_available)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.restaurant.id, foodId, foodRows[0].name, description, price, cover, isAvailable ? 1 : 0]
      );
      itemId = result.insertId;

      for (let i = 0; i < files.length; i++) {
        await conn.query(
          `INSERT INTO menu_item_images (menu_item_id, image_url, position) VALUES (?, ?, ?)`,
          [itemId, publicUrl(files[i]), i]
        );
      }
      for (const pid of proteins) {
        await conn.query(
          'INSERT INTO menu_item_proteins (menu_item_id, protein_id) VALUES (?, ?)',
          [itemId, pid]
        );
      }
      await conn.commit();
      conn.release();
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }

    const [rows] = await db.query('SELECT * FROM menu_items WHERE id = ?', [itemId]);
    const withImages = await attachImages(rows);
    const withProteins = await attachProteins(withImages);
    return res.status(201).json({ message: 'Menu item created.', item: withProteins[0] });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* PUT /api/menu/:itemId  (vendor owns restaurant)                     */
/* Partial update. Multipart fields optional; files optional.          */
/* If files are provided they must be >= 2 and REPLACE the existing    */
/* image set; otherwise existing images are kept.                      */
/* If protein_ids are provided they REPLACE the item's protein set.    */
/* food_id (with a valid food) renames the item to the new food.       */
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

    const { description, price, is_available, food_id } = req.body;
    const proteinIds = normalizeProteinIds(req.body);
    if (proteinIds === 'invalid') {
      cleanupFiles(files);
      return res.status(422).json({ error: 'Invalid protein selection.' });
    }
    const sets = [];
    const params = [];

    if (description !== undefined) { sets.push('description = ?'); params.push(description); }
    if (price !== undefined) { sets.push('price = ?'); params.push(Number(price)); }
    if (is_available !== undefined) {
      sets.push('is_available = ?');
      params.push(is_available === 'true' || is_available === true ? 1 : 0);
    }
    if (files.length > 0) {
      sets.push('image_url = ?');
      params.push(publicUrl(files[0]));
    }

    // food_id change → validate + sync the name snapshot.
    let newFoodId = null;
    if (food_id !== undefined && food_id !== null && String(food_id).trim() !== '') {
      newFoodId = Number(food_id);
      if (!Number.isInteger(newFoodId) || newFoodId < 1) {
        cleanupFiles(files);
        return res.status(422).json({ error: 'Invalid food selection.' });
      }
      const [foodRows] = await db.query(
        'SELECT name FROM foods WHERE id = ? AND restaurant_id = ?',
        [newFoodId, req.restaurant.id]
      );
      if (foodRows.length === 0) {
        cleanupFiles(files);
        return res.status(404).json({ error: 'Food not found on this restaurant.' });
      }
      sets.push('food_id = ?', 'name = ?');
      params.push(newFoodId, foodRows[0].name);
    }

    // Validate the protein set against this restaurant.
    let newProteins = null;
    if (proteinIds !== null) {
      newProteins = proteinIds;
      if (newProteins.length > 0) {
        const [pRows] = await db.query(
          `SELECT id FROM proteins WHERE restaurant_id = ? AND id IN (?)`,
          [req.restaurant.id, newProteins]
        );
        if (pRows.length !== newProteins.length) {
          cleanupFiles(files);
          return res.status(422).json({ error: 'One or more proteins do not belong to this restaurant.' });
        }
      }
    }

    if (sets.length === 0 && files.length === 0 && newProteins === null) {
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

      // Replace the protein set when protein_ids were provided.
      if (newProteins !== null) {
        await conn.query('DELETE FROM menu_item_proteins WHERE menu_item_id = ?', [req.menuItem.id]);
        for (const pid of newProteins) {
          await conn.query(
            'INSERT INTO menu_item_proteins (menu_item_id, protein_id) VALUES (?, ?)',
            [req.menuItem.id, pid]
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
    const withImages = await attachImages(rows);
    const withProteins = await attachProteins(withImages);
    return res.json({ message: 'Menu item updated.', item: withProteins[0] });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* DELETE /api/menu/:itemId  (vendor owns restaurant)                  */
/* Hard delete — blocked gracefully if order history references it.    */
/* Child images/proteins are removed by the FK ON DELETE CASCADE.      */
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

module.exports = {
  listMenuItems,
  listAllMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  attachImages,
  attachProteins,
};