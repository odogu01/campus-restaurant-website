/**
 * Vendor request controller.
 *
 * Public:  POST /api/vendor-requests            — create a pending request
 * Admin:   GET  /api/admin/vendor-requests      — list requests
 *          PUT  /api/admin/vendor-requests/:id  — approve / reject
 */
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { generatePassword } = require('../utils/passwordGenerator');
const { sendApprovalEmail, sendRejectionEmail, isConfigured } = require('../utils/email');

const BCRYPT_ROUNDS = 10;

/* ------------------------------------------------------------------ */
/* POST /api/vendor-requests (public, no auth)                         */
/* Body: { email, restaurantName, description?, phone? }               */
/* ------------------------------------------------------------------ */
async function createVendorRequest(req, res, next) {
  try {
    const { email, restaurantName, description = null, phone = null } = req.body;

    // Prevent duplicate pending (or already approved) applications per email.
    const [existing] = await db.query(
      `SELECT id, status FROM vendor_requests
       WHERE email = ? AND status IN ('pending', 'approved')
       LIMIT 1`,
      [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        error: 'A request for this email is already pending or approved.',
        existingStatus: existing[0].status,
      });
    }

    const [result] = await db.query(
      `INSERT INTO vendor_requests (email, restaurant_name, description, phone, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [email, restaurantName, description, phone]
    );

    const [rows] = await db.query(
      'SELECT id, email, restaurant_name, description, phone, status, created_at FROM vendor_requests WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json({
      message: 'Vendor request submitted. You will receive an email once an admin reviews it.',
      request: rows[0],
    });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/admin/vendor-requests (admin only)                         */
/* Query: ?status=pending|approved|rejected  (optional filter)         */
/* ------------------------------------------------------------------ */
async function listVendorRequests(req, res, next) {
  try {
    const { status } = req.query;
    const allowed = ['pending', 'approved', 'rejected'];
    const params = [];
    let sql =
      'SELECT id, email, restaurant_name, description, phone, status, admin_comment, created_at FROM vendor_requests';
    if (status && allowed.includes(status)) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';

    const [rows] = await db.query(sql, params);
    return res.json({ requests: rows });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* PUT /api/admin/vendor-requests/:id (admin only)                     */
/* Body: { action: 'approve' | 'reject', admin_comment? }              */
/* ------------------------------------------------------------------ */
async function reviewVendorRequest(req, res, next) {
  const { action } = req.body;
  const adminComment = req.body.admin_comment || null;

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: "action must be 'approve' or 'reject'." });
  }
  if (action === 'reject' && !adminComment) {
    return res.status(400).json({ error: 'admin_comment is required when rejecting.' });
  }

  let conn;
  try {
    // Load the request.
    const [rows] = await db.query(
      'SELECT id, email, restaurant_name, description, phone, status FROM vendor_requests WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Vendor request not found.' });
    }
    const request = rows[0];

    if (request.status !== 'pending') {
      return res.status(400).json({
        error: `This request was already ${request.status}.`,
        currentStatus: request.status,
      });
    }

    /* ------------------------------ REJECT ------------------------------ */
    if (action === 'reject') {
      await db.query(
        'UPDATE vendor_requests SET status = ?, admin_comment = ? WHERE id = ?',
        ['rejected', adminComment, request.id]
      );

      // Email is best-effort: log a warning if it fails, don't break the API.
      await sendRejectionEmail(request.email, adminComment, request.restaurant_name).catch((e) =>
        console.warn('[EMAIL] rejection email failed:', e.message)
      );

      return res.json({
        message: 'Vendor request rejected.',
        request: { ...request, status: 'rejected', admin_comment: adminComment },
      });
    }

    /* ------------------------------ APPROVE ----------------------------- */
    // Generate + hash a fresh password for the new owner account.
    const generatedPassword = generatePassword();
    const password_hash = await bcrypt.hash(generatedPassword, BCRYPT_ROUNDS);

    conn = await db.getConnection();
    await conn.beginTransaction();

    try {
      // 1. Create the restaurant_owner user.
      // NOTE: the request form has no owner-name field, so full_name mirrors
      // the restaurant name (documented limitation of the request schema).
      const [userResult] = await conn.query(
        `INSERT INTO users (email, password_hash, full_name, phone, role)
         VALUES (?, ?, ?, ?, 'restaurant_owner')`,
        [request.email, password_hash, request.restaurant_name, request.phone]
      );

      // 2. Create the restaurant owned by that user.
      const [restaurantResult] = await conn.query(
        `INSERT INTO restaurants (owner_id, name, description, phone, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [userResult.insertId, request.restaurant_name, request.description, request.phone]
      );

      // 3. Mark the request as approved.
      await conn.query(
        'UPDATE vendor_requests SET status = ?, admin_comment = ? WHERE id = ?',
        ['approved', adminComment, request.id]
      );

      await conn.commit();
      conn.release();
      conn = null;
    } catch (err) {
      await conn.rollback();
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          error: 'A user with this email already exists. Use a different email for the vendor.',
        });
      }
      throw err;
    }

    // 4. Send the approval email with the PLAIN-TEXT password.
    await sendApprovalEmail(request.email, generatedPassword, request.restaurant_name).catch((e) =>
      console.warn('[EMAIL] approval email failed:', e.message)
    );

    const response = {
      message: 'Vendor approved. Login credentials sent by email.',
      request: { id: request.id, email: request.email, restaurant_name: request.restaurant_name, status: 'approved' },
    };

    // In dev mode (no SMTP configured) expose the generated password so the
    // flow can be tested end-to-end. NEVER returned when real email is on.
    if (!isConfigured()) {
      response.devPassword = generatedPassword;
      response.emailNote = 'EMAIL_NOT_CONFIGURED — password exposed for testing only.';
    }

    return res.json(response);
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch { /* ignore */ }
      conn.release();
    }
    return next(err);
  }
}

module.exports = { createVendorRequest, listVendorRequests, reviewVendorRequest };