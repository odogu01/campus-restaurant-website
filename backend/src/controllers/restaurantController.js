/**
 * Restaurant controller.
 *
 * Public: GET list (active only, cuisine/search filters), GET detail (+ menu)
 * Vendor: POST create, PUT update, DELETE soft-delete, GET my restaurants
 * Ownership is enforced by middleware/ownership.js.
 */
const db = require('../config/db');
const { attachImages, attachProteins } = require('./menuController');

/* ------------------------------------------------------------------ */
/* GET /api/restaurants  (public)                                      */
/* Query: ?cuisine=Italian  ?search=grill                             */
/* Returns minimal fields + available menu item count.                 */
/* ------------------------------------------------------------------ */
async function listRestaurants(req, res, next) {
  try {
    // Accept either ?cuisine= or ?cuisine_type= (alias).
    const cuisine = req.query.cuisine || req.query.cuisine_type;
    const search = req.query.search;
    const params = [];
    let sql = `
      SELECT r.id, r.name, r.description, r.cuisine_type, r.address, r.phone,
             r.logo_url, r.created_at,
             (SELECT COUNT(*) FROM menu_items mi
              WHERE mi.restaurant_id = r.id AND mi.is_available = 1) AS menu_items_count
      FROM restaurants r
      WHERE r.is_active = 1`;

    if (cuisine) {
      sql += ' AND r.cuisine_type = ?';
      params.push(cuisine);
    }
    if (search) {
      // Escape LIKE wildcards so user input can't break the pattern.
      const escaped = search.replace(/[\\%_]/g, '\\$&');
      sql += ' AND r.name LIKE ?';
      params.push(`%${escaped}%`);
    }

    sql += ' ORDER BY r.created_at DESC';

    const [rows] = await db.query(sql, params);
    return res.json({ restaurants: rows });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/restaurants/:id  (public)                                  */
/* Returns full details + menu items. Inactive restaurants 404 unless  */
/* the caller is the owner or an admin.                                */
/* ------------------------------------------------------------------ */
async function getRestaurant(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid restaurant id.' });
    }

    const [rows] = await db.query(
      `SELECT r.*, u.full_name AS owner_name
       FROM restaurants r
       JOIN users u ON u.id = r.owner_id
       WHERE r.id = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Restaurant not found.' });
    }

    const restaurant = rows[0];

    // Soft-deleted restaurants are hidden from the public.
    if (!restaurant.is_active) {
      const isAuthorized = req.user && (req.user.role === 'admin' || req.user.id === restaurant.owner_id);
      if (!isAuthorized) {
        return res.status(404).json({ error: 'Restaurant not found.' });
      }
    }

    const [menu] = await db.query(
      `SELECT id, food_id, name, description, price, image_url, is_available, created_at
       FROM menu_items
       WHERE restaurant_id = ?
       ORDER BY name`,
      [id]
    );

    const withImages = await attachImages(menu);
    return res.json({ restaurant, menu: await attachProteins(withImages) });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* POST /api/restaurants  (vendor/admin)                               */
/* Body: name (req), description, cuisine_type, address, phone, logo_url */
/* ------------------------------------------------------------------ */
async function createRestaurant(req, res, next) {
  try {
    // Vendor-only: restaurant owners (and admins) may create restaurants.
    if (!['restaurant_owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only restaurant owners can create restaurants.' });
    }

    const { name, description = null, cuisine_type = null, address = null, phone = null, logo_url = null } = req.body;

    // STRICT RULE: a vendor may own exactly ONE restaurant.
    // Enforced here (friendly message) AND at the DB layer (UNIQUE on
    // owner_id) so it holds even under race conditions or direct SQL.
    if (req.user.role === 'restaurant_owner') {
      const [existing] = await db.query(
        'SELECT id FROM restaurants WHERE owner_id = ? LIMIT 1',
        [req.user.id]
      );
      if (existing.length > 0) {
        return res.status(409).json({
          error: 'You can only have one restaurant. Edit or reactivate your existing restaurant instead.',
        });
      }
    }

    const [result] = await db.query(
      `INSERT INTO restaurants (owner_id, name, description, cuisine_type, address, phone, logo_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [req.user.id, name, description, cuisine_type, address, phone, logo_url]
    );

    const [rows] = await db.query('SELECT * FROM restaurants WHERE id = ?', [result.insertId]);
    return res.status(201).json({ message: 'Restaurant created.', restaurant: rows[0] });
  } catch (err) {
    // Backstop: the UNIQUE constraint on restaurants.owner_id catches any
    // race between the check above and the INSERT.
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'You can only have one restaurant.' });
    }
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* PUT /api/restaurants/:id  (owner/admin)                             */
/* Partial update of editable fields.                                  */
/* ------------------------------------------------------------------ */
async function updateRestaurant(req, res, next) {
  try {
    const { name, description, cuisine_type, address, phone, logo_url } = req.body;

    await db.query(
      `UPDATE restaurants
       SET name = ?, description = ?, cuisine_type = ?, address = ?, phone = ?, logo_url = ?
       WHERE id = ?`,
      [name, description, cuisine_type, address, phone, logo_url, req.restaurant.id]
    );

    const [rows] = await db.query('SELECT * FROM restaurants WHERE id = ?', [req.restaurant.id]);
    return res.json({ message: 'Restaurant updated.', restaurant: rows[0] });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* DELETE /api/restaurants/:id  (owner/admin) — soft delete            */
/* ------------------------------------------------------------------ */
async function softDeleteRestaurant(req, res, next) {
  try {
    await db.query('UPDATE restaurants SET is_active = 0 WHERE id = ?', [req.restaurant.id]);
    return res.json({ message: 'Restaurant deactivated (soft delete).', restaurant: { id: req.restaurant.id, is_active: 0 } });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/vendor/restaurants  (vendor) — the vendor's own restaurants */
/* (includes inactive ones so the dashboard can show everything)       */
/* ------------------------------------------------------------------ */
async function getMyRestaurants(req, res, next) {
  try {
    const [rows] = await db.query(
      `SELECT r.id, r.name, r.description, r.cuisine_type, r.address, r.phone,
              r.logo_url, r.is_active, r.created_at,
              (SELECT COUNT(*) FROM menu_items mi
               WHERE mi.restaurant_id = r.id AND mi.is_available = 1) AS menu_items_count
       FROM restaurants r
       WHERE r.owner_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    return res.json({ restaurants: rows });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* FOODS — the foods a restaurant sells (owner/admin)                  */
/*   GET    /api/restaurants/:restaurantId/foods                       */
/*   POST   /api/restaurants/:restaurantId/foods   { name }            */
/*   DELETE /api/foods/:id                                             */
/* ------------------------------------------------------------------ */
async function listFoods(req, res, next) {
  try {
    const [rows] = await db.query(
      'SELECT id, restaurant_id, name, created_at FROM foods WHERE restaurant_id = ? ORDER BY name',
      [req.restaurant.id]
    );
    return res.json({ foods: rows });
  } catch (err) {
    return next(err);
  }
}

async function createFood(req, res, next) {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(422).json({ error: 'Food name is required.' });
    }
    const [result] = await db.query(
      'INSERT INTO foods (restaurant_id, name) VALUES (?, ?)',
      [req.restaurant.id, name]
    );
    const [rows] = await db.query('SELECT * FROM foods WHERE id = ?', [result.insertId]);
    return res.status(201).json({ message: 'Food added.', food: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This food is already on your list.' });
    }
    return next(err);
  }
}

async function deleteFood(req, res, next) {
  try {
    await db.query('DELETE FROM foods WHERE id = ?', [req.food.id]);
    return res.json({ message: 'Food removed.', food: { id: req.food.id } });
  } catch (err) {
    // FK violation (menu_items.food_id RESTRICT)
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({
        error: 'This food is used by menu items. Delete those items first (or set them unavailable).',
      });
    }
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* PROTEINS — owner/admin                                              */
/*   GET    /api/restaurants/:restaurantId/proteins                    */
/*   POST   /api/restaurants/:restaurantId/proteins                    */
/*          body: { name, price, is_primary? }                         */
/*   PUT    /api/proteins/:id   body: { name?, price?, is_primary? }   */
/*   DELETE /api/proteins/:id                                          */
/*                                                                     */
/* PRIMARY RULE (exactly one primary per restaurant):                  */
/*   - the first protein added is forced to be the primary             */
/*   - marking a new primary clears the previous one (transaction)     */
/*   - unsetting the current primary is rejected (400)                 */
/*   - deleting the primary auto-promotes the oldest remaining         */
/* ------------------------------------------------------------------ */
async function listProteins(req, res, next) {
  try {
    const [rows] = await db.query(
      `SELECT id, restaurant_id, name, price, is_primary, created_at
       FROM proteins
       WHERE restaurant_id = ?
       ORDER BY is_primary DESC, name`,
      [req.restaurant.id]
    );
    return res.json({ proteins: rows });
  } catch (err) {
    return next(err);
  }
}

async function createProtein(req, res, next) {
  try {
    const name = String(req.body.name || '').trim();
    const price = Number(req.body.price);
    let isPrimary = req.body.is_primary === true || req.body.is_primary === 'true';

    if (!name) {
      return res.status(422).json({ error: 'Protein name is required.' });
    }
    if (!Number.isFinite(price) || price < 0) {
      return res.status(422).json({ error: 'Protein price must be a positive number.' });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[countRow]] = await conn.query(
        'SELECT COUNT(*) AS n FROM proteins WHERE restaurant_id = ?',
        [req.restaurant.id]
      );
      if (countRow.n === 0) isPrimary = true; // the very first protein is the primary
      if (isPrimary) {
        await conn.query('UPDATE proteins SET is_primary = 0 WHERE restaurant_id = ?', [req.restaurant.id]);
      }
      const [result] = await conn.query(
        'INSERT INTO proteins (restaurant_id, name, price, is_primary) VALUES (?, ?, ?, ?)',
        [req.restaurant.id, name, price, isPrimary ? 1 : 0]
      );
      await conn.commit();
      conn.release();
      const [rows] = await db.query('SELECT * FROM proteins WHERE id = ?', [result.insertId]);
      return res.status(201).json({ message: 'Protein added.', protein: rows[0] });
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This protein is already on your list.' });
    }
    return next(err);
  }
}

async function updateProtein(req, res, next) {
  try {
    const { name, price, is_primary } = req.body;
    if (name !== undefined && !String(name).trim()) {
      return res.status(422).json({ error: 'Protein name cannot be empty.' });
    }
    if (price !== undefined && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
      return res.status(422).json({ error: 'Protein price must be a positive number.' });
    }

    const sets = [];
    const params = [];
    if (name !== undefined) { sets.push('name = ?'); params.push(String(name).trim()); }
    if (price !== undefined) { sets.push('price = ?'); params.push(Number(price)); }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[row]] = await conn.query(
        'SELECT id, restaurant_id, is_primary FROM proteins WHERE id = ? FOR UPDATE',
        [req.protein.id]
      );

      const wantPrimary = is_primary === true || is_primary === 'true';
      if (wantPrimary) {
        // New primary: clear the old one first.
        await conn.query('UPDATE proteins SET is_primary = 0 WHERE restaurant_id = ?', [row.restaurant_id]);
        sets.push('is_primary = 1');
      } else if (is_primary !== undefined && row.is_primary === 1) {
        // Trying to UNSET the current primary — the invariant requires exactly one.
        await conn.rollback();
        conn.release();
        return res.status(400).json({
          error: 'You must keep a primary protein. Mark another protein as primary instead — it will replace this one.',
        });
      }

      if (sets.length === 0) {
        await conn.rollback();
        conn.release();
        return res.status(422).json({ error: 'Nothing to update.' });
      }

      await conn.query(`UPDATE proteins SET ${sets.join(', ')} WHERE id = ?`, [...params, row.id]);
      await conn.commit();
      conn.release();
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }

    const [rows] = await db.query('SELECT * FROM proteins WHERE id = ?', [req.protein.id]);
    return res.json({ message: 'Protein updated.', protein: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This protein is already on your list.' });
    }
    return next(err);
  }
}

async function deleteProtein(req, res, next) {
  try {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[row]] = await conn.query(
        'SELECT id, restaurant_id, is_primary FROM proteins WHERE id = ? FOR UPDATE',
        [req.protein.id]
      );
      // Deleting the primary auto-promotes the oldest remaining protein.
      if (row.is_primary === 1) {
        const [[nextP]] = await conn.query(
          'SELECT id FROM proteins WHERE restaurant_id = ? AND id <> ? ORDER BY id LIMIT 1',
          [row.restaurant_id, row.id]
        );
        if (nextP) {
          await conn.query('UPDATE proteins SET is_primary = 1 WHERE id = ?', [nextP.id]);
        }
      }
      await conn.query('DELETE FROM proteins WHERE id = ?', [row.id]);
      await conn.commit();
      conn.release();
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
    return res.json({ message: 'Protein removed.', protein: { id: req.protein.id } });
  } catch (err) {
    // FK violation (menu_item_proteins CASCADE, order_item_proteins RESTRICT)
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({
        error: 'This protein is used by past orders and cannot be removed.',
      });
    }
    return next(err);
  }
}

module.exports = {
  listRestaurants,
  getRestaurant,
  createRestaurant,
  updateRestaurant,
  softDeleteRestaurant,
  getMyRestaurants,
  listFoods,
  createFood,
  deleteFood,
  listProteins,
  createProtein,
  updateProtein,
  deleteProtein,
};