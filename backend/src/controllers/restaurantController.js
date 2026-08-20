/**
 * Restaurant controller.
 *
 * Public: GET list (active only, cuisine/search filters), GET detail (+ menu)
 * Vendor: POST create, PUT update, DELETE soft-delete, GET my restaurants
 * Ownership is enforced by middleware/ownership.js.
 */
const db = require('../config/db');
const { attachImages } = require('./menuController');

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
      `SELECT id, name, description, price, category, image_url, is_available, created_at
       FROM menu_items
       WHERE restaurant_id = ?
       ORDER BY category, name`,
      [id]
    );

    return res.json({ restaurant, menu: await attachImages(menu) });
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

module.exports = { listRestaurants, getRestaurant, createRestaurant, updateRestaurant, softDeleteRestaurant, getMyRestaurants };