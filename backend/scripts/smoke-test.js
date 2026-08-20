/**
 * Dev utility — one-time smoke test.
 * Verifies the pool connects to the database and that the STORED generated
 * column (order_items.subtotal) computes correctly.
 * All test data is rolled back — nothing persists.
 *
 * Run with: node scripts/smoke-test.js
 */
require('dotenv').config();

const db = require('../src/config/db.js');

(async () => {
  const ok = await db.testConnection();
  console.log('Pool testConnection:', ok ? 'OK' : 'FAILED');
  if (!ok) process.exit(1);

  // Verify the generated column exists on order_items
  const [cols] = await db.query("SHOW COLUMNS FROM order_items LIKE 'subtotal'");
  console.log('subtotal column:', JSON.stringify(cols[0] || null));

  // Functional test: insert a user -> restaurant -> order -> items, check subtotal
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [u] = await conn.query(
      "INSERT INTO users (email, password_hash, full_name, role) VALUES ('smoke_test@test.com', 'x', 'Smoke Test', 'customer')"
    );
    const [r] = await conn.query(
      'INSERT INTO restaurants (owner_id, name, cuisine_type) VALUES (?, ?, ?)',
      [u.insertId, 'Smoke Restaurant', 'Test']
    );
    const [m] = await conn.query(
      'INSERT INTO menu_items (restaurant_id, name, price) VALUES (?, ?, ?)',
      [r.insertId, 'Smoke Burger', 12.5]
    );
    const [o] = await conn.query(
      `INSERT INTO orders (user_id, restaurant_id, total_amount, status, order_type, payment_method, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [u.insertId, r.insertId, 25.0, 'pending', 'pickup', 'paystack', 'pending']
    );
    await conn.query(
      'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, ?, 2, 12.5)',
      [o.insertId, m.insertId]
    );

    const [items] = await conn.query(
      'SELECT quantity, unit_price, subtotal FROM order_items WHERE order_id = ?',
      [o.insertId]
    );
    console.log('order_items row:', JSON.stringify(items[0]));
    const subtotal = items[0].subtotal;
    console.log('Generated subtotal (2 x 12.50) =', subtotal, '=>', subtotal === '25.00' ? 'PASS' : 'FAIL');

    await conn.rollback(); // clean up smoke test data
    console.log('Smoke test rolled back cleanly.');
  } finally {
    conn.release();
  }
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});