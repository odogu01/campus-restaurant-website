/**
 * Ownership middleware — enforces "vendor owns the restaurant" (admins pass).
 *
 *   requireRestaurantOwner(req, res, next)
 *     - reads restaurant id from req.params.id OR req.params.restaurantId
 *     - 404 if restaurant missing, 403 if not owner/admin
 *     - attaches req.restaurant
 *
 *   requireItemRestaurantOwner(req, res, next)
 *     - reads menu item from req.params.itemId, resolves its restaurant
 *     - same checks; attaches req.restaurant + req.menuItem
 *
 *   requireFoodOwner / requireProteinOwner(req, res, next)
 *     - read a food/protein from req.params.id, resolve its restaurant
 *     - same checks; attach req.restaurant (+ req.food / req.protein)
 */
const db = require('../config/db');

function isOwnerOrAdmin(user, restaurant) {
  return user.role === 'admin' || restaurant.owner_id === user.id;
}

async function requireRestaurantOwner(req, res, next) {
  try {
    const id = Number(req.params.id || req.params.restaurantId);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid restaurant id.' });
    }

    const [rows] = await db.query('SELECT * FROM restaurants WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Restaurant not found.' });
    }

    const restaurant = rows[0];
    if (!isOwnerOrAdmin(req.user, restaurant)) {
      return res.status(403).json({ error: 'You do not have permission to modify this restaurant.' });
    }

    req.restaurant = restaurant;
    return next();
  } catch (err) {
    return next(err);
  }
}

async function requireItemRestaurantOwner(req, res, next) {
  try {
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(itemId) || itemId < 1) {
      return res.status(400).json({ error: 'Invalid menu item id.' });
    }

    const [rows] = await db.query(
      `SELECT mi.id, mi.restaurant_id, r.owner_id
       FROM menu_items mi
       JOIN restaurants r ON r.id = mi.restaurant_id
       WHERE mi.id = ?`,
      [itemId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }

    const row = rows[0];
    const restaurant = { id: row.restaurant_id, owner_id: row.owner_id };
    if (!isOwnerOrAdmin(req.user, restaurant)) {
      return res.status(403).json({ error: 'You do not have permission to modify this menu item.' });
    }

    req.restaurant = restaurant;
    req.menuItem = row;
    return next();
  } catch (err) {
    return next(err);
  }
}

async function requireFoodOwner(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid food id.' });
    }
    const [rows] = await db.query(
      `SELECT f.id, f.restaurant_id, r.owner_id
       FROM foods f
       JOIN restaurants r ON r.id = f.restaurant_id
       WHERE f.id = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Food not found.' });
    }
    const row = rows[0];
    const restaurant = { id: row.restaurant_id, owner_id: row.owner_id };
    if (!isOwnerOrAdmin(req.user, restaurant)) {
      return res.status(403).json({ error: 'You do not have permission to modify this food.' });
    }
    req.restaurant = restaurant;
    req.food = row;
    return next();
  } catch (err) {
    return next(err);
  }
}

async function requireProteinOwner(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid protein id.' });
    }
    const [rows] = await db.query(
      `SELECT p.id, p.restaurant_id, r.owner_id
       FROM proteins p
       JOIN restaurants r ON r.id = p.restaurant_id
       WHERE p.id = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Protein not found.' });
    }
    const row = rows[0];
    const restaurant = { id: row.restaurant_id, owner_id: row.owner_id };
    if (!isOwnerOrAdmin(req.user, restaurant)) {
      return res.status(403).json({ error: 'You do not have permission to modify this protein.' });
    }
    req.restaurant = restaurant;
    req.protein = row;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireRestaurantOwner, requireItemRestaurantOwner, requireFoodOwner, requireProteinOwner, isOwnerOrAdmin };