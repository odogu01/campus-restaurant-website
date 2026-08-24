/**
 * Migration: Restaurant operating hours + restaurant images.
 * 
 * 1. Adds opening_time, closing_time columns to restaurants table.
 * 2. Creates restaurant_images table for gallery/cover photos.
 * 
 * Usage: node scripts/migrate-restaurant-hours-images.js
 */
require('dotenv').config();
const db = require('../src/config/db');

(async () => {
  try {
    // 1. Add opening_time and closing_time to restaurants
    const [hasOpening] = await db.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'restaurants' AND column_name = 'opening_time'
    `);
    if (hasOpening.length === 0) {
      await db.query(`
        ALTER TABLE restaurants
        ADD COLUMN opening_time TIME NULL AFTER phone,
        ADD COLUMN closing_time TIME NULL AFTER opening_time
      `);
      console.log('Added opening_time and closing_time columns to restaurants.');
    } else {
      console.log('restaurants.opening_time/closing_time already exist.');
    }

    // 2. Create restaurant_images table for gallery/cover photos
    const [hasImagesTable] = await db.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'restaurant_images'
    `);
    if (hasImagesTable.length === 0) {
      await db.query(`
        CREATE TABLE restaurant_images (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          restaurant_id BIGINT UNSIGNED NOT NULL,
          image_url VARCHAR(500) NOT NULL,
          is_cover TINYINT(1) NOT NULL DEFAULT 0,
          position INT UNSIGNED NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_restaurant_images_restaurant FOREIGN KEY (restaurant_id)
            REFERENCES restaurants (id) ON DELETE CASCADE,
          INDEX idx_restaurant_images_restaurant (restaurant_id)
        ) ENGINE = InnoDB
      `);
      console.log('Created restaurant_images table.');
    } else {
      console.log('restaurant_images table already exists.');
    }

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
})();