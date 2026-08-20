/**
 * Migration: one restaurant per vendor (STRICT).
 *
 * Adds a UNIQUE constraint on restaurants.owner_id in the live database,
 * so a vendor can never own more than one restaurant — even if the
 * app-layer check is bypassed.
 *
 * Idempotent: safe to run multiple times.
 * Run from the backend/ directory:  node scripts/migrate-one-restaurant-per-vendor.js
 */
const db = require('../src/config/db');

async function indexExists(conn, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'restaurants' AND index_name = ?`,
    [indexName]
  );
  return rows[0].n > 0;
}

(async () => {
  const conn = await db.getConnection();
  try {
    const OLD_INDEX = 'idx_restaurants_owner';
    const NEW_UNIQUE = 'uq_restaurants_owner';

    // Fail loudly (before touching anything) if a vendor already has
    // more than one restaurant — the migration would be blocked anyway.
    const [dupes] = await conn.query(
      `SELECT owner_id, COUNT(*) AS n
       FROM restaurants
       GROUP BY owner_id
       HAVING n > 1
       LIMIT 10`
    );
    if (dupes.length > 0) {
      console.error('Migration blocked: duplicate owner_id(s) found:');
      console.error(dupes);
      process.exitCode = 1;
      return;
    }

    // 1. Add the UNIQUE index first (the FK constraint still needs an
    //    index on owner_id, so the new unique key can serve it).
    if (await indexExists(conn, NEW_UNIQUE)) {
      console.log('Unique index already exists.');
    } else {
      await conn.query(`ALTER TABLE restaurants ADD UNIQUE KEY ${NEW_UNIQUE} (owner_id)`);
      console.log(`Added UNIQUE KEY ${NEW_UNIQUE} (owner_id).`);
    }

    // 2. Drop the old non-unique index (now redundant — the FK is served
    //    by the unique key, so this drop is allowed).
    if (await indexExists(conn, OLD_INDEX)) {
      await conn.query(`ALTER TABLE restaurants DROP INDEX ${OLD_INDEX}`);
      console.log(`Dropped old index ${OLD_INDEX}.`);
    } else {
      console.log('Old index already gone.');
    }

    // 3. Verify.
    const [check] = await conn.query(
      `SELECT index_name, non_unique, column_name
       FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = 'restaurants'
       ORDER BY index_name, seq_in_index`
    );
    console.log('Restaurant indexes now:');
    check.forEach((c) => console.log(`  ${c.index_name}  non_unique=${c.non_unique}  (${c.column_name})`));
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await db.end();
  }
})();