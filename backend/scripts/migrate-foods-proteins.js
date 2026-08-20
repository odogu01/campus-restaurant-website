/**
 * Migration: foods & proteins model.
 *
 * 1. Creates foods, proteins, menu_item_proteins, order_item_proteins.
 * 2. Adds menu_items.food_id (nullable) and backfills it from existing
 *    menu item names (each distinct (restaurant, name) becomes a food).
 * 3. Adds the FK and makes food_id NOT NULL (only if every row is linked).
 * 4. Removes the category column + index (category is gone, product decision).
 *
 * Idempotent — safe to run multiple times.
 * Usage: node scripts/migrate-foods-proteins.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../src/config/db');

(async () => {
  try {
    // 1. New tables (IF NOT EXISTS — safe to re-run).
    await db.query(`
      CREATE TABLE IF NOT EXISTS foods (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        restaurant_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_foods_restaurant FOREIGN KEY (restaurant_id)
          REFERENCES restaurants (id) ON DELETE CASCADE,
        UNIQUE KEY uq_foods_restaurant_name (restaurant_id, name),
        INDEX idx_foods_restaurant (restaurant_id)
      ) ENGINE = InnoDB`);
    console.log('foods table ready.');

    await db.query(`
      CREATE TABLE IF NOT EXISTS proteins (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        restaurant_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(100) NOT NULL,
        price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        is_primary TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_proteins_restaurant FOREIGN KEY (restaurant_id)
          REFERENCES restaurants (id) ON DELETE CASCADE,
        UNIQUE KEY uq_proteins_restaurant_name (restaurant_id, name),
        INDEX idx_proteins_restaurant (restaurant_id)
      ) ENGINE = InnoDB`);
    console.log('proteins table ready.');

    await db.query(`
      CREATE TABLE IF NOT EXISTS menu_item_proteins (
        menu_item_id BIGINT UNSIGNED NOT NULL,
        protein_id BIGINT UNSIGNED NOT NULL,
        PRIMARY KEY (menu_item_id, protein_id),
        CONSTRAINT fk_mip_menu_item FOREIGN KEY (menu_item_id)
          REFERENCES menu_items (id) ON DELETE CASCADE,
        CONSTRAINT fk_mip_protein FOREIGN KEY (protein_id)
          REFERENCES proteins (id) ON DELETE CASCADE
      ) ENGINE = InnoDB`);
    console.log('menu_item_proteins table ready.');

    await db.query(`
      CREATE TABLE IF NOT EXISTS order_item_proteins (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        order_item_id BIGINT UNSIGNED NOT NULL,
        protein_id BIGINT UNSIGNED NOT NULL,
        protein_name VARCHAR(100) NOT NULL,
        quantity INT UNSIGNED NOT NULL DEFAULT 1,
        unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        subtotal DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
        CONSTRAINT fk_oip_order_item FOREIGN KEY (order_item_id)
          REFERENCES order_items (id) ON DELETE CASCADE,
        CONSTRAINT fk_oip_protein FOREIGN KEY (protein_id)
          REFERENCES proteins (id) ON DELETE RESTRICT,
        INDEX idx_oip_order_item (order_item_id)
      ) ENGINE = InnoDB`);
    console.log('order_item_proteins table ready.');

    // 2. Add menu_items.food_id if missing.
    const [[mi]] = await db.query(
      `SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'menu_items' AND column_name = 'food_id'`
    );
    if (mi.n === 0) {
      await db.query('ALTER TABLE menu_items ADD COLUMN food_id BIGINT UNSIGNED NULL AFTER restaurant_id');
      console.log('Added menu_items.food_id (nullable).');
    }

    // 3. Backfill foods from existing menu item names, then link food_id.
    await db.query(`
      INSERT IGNORE INTO foods (restaurant_id, name)
      SELECT DISTINCT restaurant_id, name FROM menu_items`);
    const [linked] = await db.query(`
      UPDATE menu_items mi
      JOIN foods f ON f.restaurant_id = mi.restaurant_id AND f.name = mi.name
      SET mi.food_id = f.id`);
    console.log(`Backfilled foods from menu items; linked ${linked.affectedRows} item(s).`);

    // 4. FK + NOT NULL (only when every menu item has a food link).
    const [[orphans]] = await db.query('SELECT COUNT(*) AS n FROM menu_items WHERE food_id IS NULL');
    if (orphans.n === 0) {
      const [[fk]] = await db.query(
        `SELECT COUNT(*) AS n FROM information_schema.table_constraints
          WHERE table_schema = DATABASE() AND table_name = 'menu_items'
            AND constraint_name = 'fk_menu_items_food'`
      );
      if (fk.n === 0) {
        await db.query(
          'ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_food FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE RESTRICT'
        );
        console.log('Added FK menu_items.food_id -> foods.id.');
      }
      await db.query('ALTER TABLE menu_items MODIFY food_id BIGINT UNSIGNED NOT NULL');
      console.log('menu_items.food_id is now NOT NULL.');
    } else {
      console.warn(`WARNING: ${orphans.n} menu item(s) have no food link — food_id stays nullable.`);
    }

    // 5. Drop category (column + index) if present.
    const [[cat]] = await db.query(
      `SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'menu_items' AND column_name = 'category'`
    );
    if (cat.n > 0) {
      const [[idx]] = await db.query(
        `SELECT COUNT(*) AS n FROM information_schema.statistics
          WHERE table_schema = DATABASE() AND table_name = 'menu_items' AND index_name = 'idx_menu_items_category'`
      );
      if (idx.n > 0) await db.query('ALTER TABLE menu_items DROP INDEX idx_menu_items_category');
      await db.query('ALTER TABLE menu_items DROP COLUMN category');
      console.log('Dropped menu_items.category (column + index).');
    } else {
      console.log('menu_items.category already gone.');
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();