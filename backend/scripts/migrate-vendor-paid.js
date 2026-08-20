/**
 * Migration: add `vendor_paid` to the orders table.
 *
 * New order lifecycle: the vendor's earnings are credited ONLY when the
 * order reaches 'delivered' (customer confirms). `vendor_paid` records that.
 *
 * Idempotent — safe to run multiple times.
 * Usage: node scripts/migrate-vendor-paid.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../src/config/db');

(async () => {
  try {
    const [[row]] = await db.query(
      `SELECT COUNT(*) AS n
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'orders'
          AND column_name = 'vendor_paid'`
    );

    if (row.n > 0) {
      console.log('vendor_paid already exists — nothing to do.');
    } else {
      await db.query(
        "ALTER TABLE orders ADD COLUMN vendor_paid TINYINT(1) NOT NULL DEFAULT 0 AFTER payment_status"
      );
      console.log('Added orders.vendor_paid TINYINT(1) NOT NULL DEFAULT 0.');
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();