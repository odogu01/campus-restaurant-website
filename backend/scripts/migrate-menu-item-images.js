/**
 * Migration: menu item images (multi-image support).
 *
 * Creates the menu_item_images table in the live database and backfills
 * any existing menu_items.image_url into it (position 0).
 *
 * Idempotent: safe to run multiple times.
 * Run from the backend/ directory:  node scripts/migrate-menu-item-images.js
 */
const db = require('../src/config/db');

(async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS menu_item_images (
        id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        menu_item_id  BIGINT UNSIGNED NOT NULL,
        image_url     VARCHAR(500)   NOT NULL,
        position      INT            NOT NULL DEFAULT 0,
        created_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_mii_menu_item FOREIGN KEY (menu_item_id)
          REFERENCES menu_items (id) ON DELETE CASCADE,
        UNIQUE KEY uq_mii_item_position (menu_item_id, position)
      ) ENGINE = InnoDB
    `);
    console.log('Table menu_item_images ready.');

    // Backfill legacy single images (items that already have image_url).
    const [legacy] = await db.query(
      `SELECT mi.id, mi.image_url
       FROM menu_items mi
       WHERE mi.image_url IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM menu_item_images i WHERE i.menu_item_id = mi.id)`
    );
    for (const row of legacy) {
      await db.query(
        `INSERT INTO menu_item_images (menu_item_id, image_url, position) VALUES (?, ?, 0)`,
        [row.id, row.image_url]
      );
    }
    if (legacy.length > 0) console.log(`Backfilled ${legacy.length} legacy image(s) into menu_item_images.`);
    else console.log('No legacy images to backfill.');

    const [count] = await db.query('SELECT COUNT(*) AS n FROM menu_item_images');
    console.log(`menu_item_images rows: ${count[0].n}`);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();