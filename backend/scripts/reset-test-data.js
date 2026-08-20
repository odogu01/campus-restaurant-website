/**
 * Dev utility — wipes test-generated data, keeps real accounts.
 * Deletes all vendor_requests, test users (*_test.com, grill_, cafe_, smoke_)
 * and any restaurants they own (FK cascade).
 * Run with: node scripts/reset-test-data.js
 */
require('dotenv').config();

const db = require('../src/config/db');

(async () => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Orders first — order_items cascade with them; orders reference users/restaurants with RESTRICT.
    await conn.query('DELETE FROM orders');
    await conn.query('DELETE FROM vendor_requests');

    // Remove any restaurants owned by the demo customer account
    // (customers should never own restaurants — created only by bugs/tests).
    await conn.query(
      `DELETE r FROM restaurants r
       JOIN users u ON u.id = r.owner_id
       WHERE u.email = 'customer@test.com'`
    );

    const [del] = await conn.query(
      `DELETE FROM users
       WHERE email LIKE '%_test.com'
          OR email LIKE 'grill_%'
          OR email LIKE 'cafe_%'
          OR email LIKE 'smoke_%'`
    );
    console.log(`Deleted ${del.affectedRows} test user(s) + their restaurants (cascade).`);

    await conn.commit();

    const [u] = await conn.query('SELECT id, email, role FROM users ORDER BY id');
    console.log('Remaining users:', JSON.stringify(u));
    const [r] = await conn.query('SELECT COUNT(*) AS c FROM restaurants');
    console.log('Restaurants remaining:', r[0].c);
    const [v] = await conn.query('SELECT COUNT(*) AS c FROM vendor_requests');
    console.log('Vendor requests remaining:', v[0].c);

    // Wipe uploaded menu item images that belonged to deleted test data.
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir).filter((f) => f.startsWith('menu-'));
      for (const f of files) fs.unlinkSync(path.join(uploadsDir, f));
      console.log(`Deleted ${files.length} uploaded menu image(s).`);
    }
  } finally {
    conn.release();
  }
  process.exit(0);
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});