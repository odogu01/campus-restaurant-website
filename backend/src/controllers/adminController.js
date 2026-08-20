/**
 * Admin controller — dashboard endpoints.
 *
 *   GET /api/admin/orders          — all orders (optional ?status= filter)
 *   GET /api/admin/users           — all users (optional ?role= filter)
 *   PUT /api/admin/users/:id/role  — change a user's role
 */
const db = require('../config/db');
const { attachItems } = require('./orderController');

/* ------------------------------------------------------------------ */
/* GET /api/admin/orders — all orders with customer/restaurant info.   */
/* ------------------------------------------------------------------ */
async function getAllOrders(req, res, next) {
  try {
    const { status } = req.query;
    const params = [];
    let sql = `
      SELECT o.id, o.user_id, u.full_name AS customer_name, u.email AS customer_email,
             o.restaurant_id, r.name AS restaurant_name,
             o.total_amount, o.status, o.order_type, o.delivery_address,
             o.special_instructions, o.payment_method, o.payment_status,
             o.vendor_paid, o.created_at, o.updated_at
      FROM orders o
      JOIN restaurants r ON r.id = o.restaurant_id
      JOIN users u ON u.id = o.user_id`;

    if (status) {
      sql += ' WHERE o.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY o.created_at DESC';

    const [orders] = await db.query(sql, params);
    const withItems = await attachItems(orders);
    return res.json({ orders: withItems });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/admin/users — list users (optional ?role= filter).         */
/* ------------------------------------------------------------------ */
async function listUsers(req, res, next) {
  try {
    const { role } = req.query;
    const params = [];
    let sql =
      'SELECT id, email, full_name, phone, role, created_at FROM users';
    if (role) {
      sql += ' WHERE role = ?';
      params.push(role);
    }
    sql += ' ORDER BY created_at DESC';

    const [rows] = await db.query(sql, params);
    return res.json({ users: rows });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* PUT /api/admin/users/:id/role — change a user's role.               */
/* Body: { role } — one of customer | restaurant_owner | admin         */
/* ------------------------------------------------------------------ */
async function updateUserRole(req, res, next) {
  try {
    const { role } = req.body;
    const targetId = Number(req.params.id);

    if (!Number.isInteger(targetId) || targetId < 1) {
      return res.status(400).json({ error: 'Invalid user id.' });
    }
    // Admins cannot demote themselves (avoid locking yourself out).
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role.' });
    }

    const [rows] = await db.query('SELECT id, email, role FROM users WHERE id = ?', [targetId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, targetId]);
    return res.json({ message: `Role updated to '${role}'.`, user: { id: targetId, email: rows[0].email, role } });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getAllOrders, listUsers, updateUserRole };