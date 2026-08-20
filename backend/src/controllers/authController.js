/**
 * Auth controller — register, login, and current-user endpoints.
 */
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { signToken } = require('../utils/jwt');

const BCRYPT_ROUNDS = 10; // as specified in the plan

/**
 * Strip sensitive fields before sending a user to the client.
 */
function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

/* ------------------------------------------------------------------ */
/* POST /api/auth/register                                             */
/* Body: { full_name, email, password, phone? }                        */
/* ------------------------------------------------------------------ */
async function register(req, res, next) {
  try {
    const { full_name, email, password, phone = null } = req.body;

    // 1. Reject duplicate emails (unique index is the final guard).
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // 2. Hash the password (bcrypt, 10 salt rounds).
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // 3. Insert with default role 'customer'.
    const [result] = await db.query(
      `INSERT INTO users (email, password_hash, full_name, phone, role)
       VALUES (?, ?, ?, ?, 'customer')`,
      [email, password_hash, full_name, phone]
    );

    // 4. Fetch the fresh row and return user + JWT.
    const [rows] = await db.query(
      'SELECT id, email, full_name, phone, role, created_at FROM users WHERE id = ?',
      [result.insertId]
    );
    const user = rows[0];

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    return res.status(201).json({ message: 'Registration successful', token, user });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* POST /api/auth/login                                                */
/* Body: { email, password }                                           */
/* ------------------------------------------------------------------ */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // 1. Find the user (include password_hash for comparison).
    const [rows] = await db.query(
      'SELECT id, email, password_hash, full_name, phone, role, created_at FROM users WHERE email = ?',
      [email]
    );
    if (rows.length === 0) {
      // Same message as wrong password — don't leak which field was wrong.
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = rows[0];

    // 2. Verify the password.
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 3. Sign a token and return user data (hash stripped).
    const token = signToken({ id: user.id, email: user.email, role: user.role });

    return res.json({ message: 'Login successful', token, user: sanitizeUser(user) });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/auth/me  (protected)                                       */
/* Returns fresh user data for the authenticated user.                 */
/* ------------------------------------------------------------------ */
async function me(req, res, next) {
  try {
    const [rows] = await db.query(
      'SELECT id, email, full_name, phone, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      // Token is valid but the user no longer exists.
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json({ user: rows[0] });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, me };