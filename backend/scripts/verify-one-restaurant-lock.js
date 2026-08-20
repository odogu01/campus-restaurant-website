/**
 * Verify the DB-level strict rule: inserting a second restaurant for the
 * same owner via raw SQL must fail with a duplicate-key error.
 * Run from backend/:  node scripts/verify-one-restaurant-lock.js
 */
const db = require('../src/config/db');

(async () => {
  try {
    const [owners] = await db.query(
      `SELECT r.owner_id, COUNT(*) AS n
       FROM restaurants r
       JOIN users u ON u.id = r.owner_id
       WHERE u.role = 'restaurant_owner'
       GROUP BY r.owner_id
       ORDER BY n DESC
       LIMIT 1`
    );
    if (owners.length === 0) {
      console.log('No vendor with a restaurant found — create one first (approval flow).');
      return;
    }
    const ownerId = owners[0].owner_id;
    console.log(`Attempting raw SQL duplicate insert for owner_id=${ownerId}...`);
    try {
      await db.query(
        `INSERT INTO restaurants (owner_id, name) VALUES (?, 'Raw SQL Dup')`,
        [ownerId]
      );
      console.log('UNEXPECTED: insert succeeded — constraint is NOT enforced!');
      process.exitCode = 1;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        console.log('BLOCKED by unique constraint (ER_DUP_ENTRY). Strict rule holds at DB level. OK');
      } else {
        console.error('Unexpected error:', err.code, err.message);
        process.exitCode = 1;
      }
    }
  } finally {
    await db.end();
  }
})();