-- ============================================================
-- Campus Restaurant Website — Database Schema (Phase 1)
-- Compatible with MySQL 5.7+ / 8.x and TiDB (Serverless & Dedicated)
-- TiDB notes: ENUM, STORED generated columns and FK constraints
-- are all supported by TiDB.
-- ============================================================

-- Create the database (skip if your DB_URL already points to an existing one)
CREATE DATABASE IF NOT EXISTS campus_restaurant
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE campus_restaurant;

-- ------------------------------------------------------------
-- 1. users
-- Holds customers, restaurant owners and admins.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,               -- bcrypt hash, never plain text
  full_name     VARCHAR(100)  NOT NULL,
  phone         VARCHAR(20)   DEFAULT NULL,
  role          ENUM('customer', 'restaurant_owner', 'admin')
                NOT NULL DEFAULT 'customer',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- 2. restaurants
-- STRICT RULE: one vendor = exactly one restaurant.
-- The UNIQUE constraint on owner_id makes this unbreakable even
-- if the app-layer check is bypassed (races, direct SQL, etc.).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurants (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id      BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(150)  NOT NULL,
  description   TEXT,
  cuisine_type  VARCHAR(50)   DEFAULT NULL,
  address       VARCHAR(255)  DEFAULT NULL,
  phone         VARCHAR(20)   DEFAULT NULL,
  logo_url      VARCHAR(500)  DEFAULT NULL,
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,     -- soft delete flag
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_restaurants_owner FOREIGN KEY (owner_id)
    REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE KEY uq_restaurants_owner (owner_id),
  INDEX idx_restaurants_cuisine (cuisine_type),
  INDEX idx_restaurants_active (is_active)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- 3. menu_items
-- Items belong to exactly one restaurant.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_items (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(150)  NOT NULL,
  description   TEXT,
  price         DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  category      VARCHAR(50)   DEFAULT NULL,           -- e.g. 'Main', 'Drinks', 'Dessert'
  image_url     VARCHAR(500)  DEFAULT NULL,
  is_available  TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_menu_items_restaurant FOREIGN KEY (restaurant_id)
    REFERENCES restaurants (id) ON DELETE CASCADE,
  INDEX idx_menu_items_restaurant (restaurant_id),
  INDEX idx_menu_items_category (category),
  INDEX idx_menu_items_available (is_available)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- 3b. menu_item_images
-- STRICT RULE: every menu item must have AT LEAST 2 images.
-- Images live here (1-N) so items can carry multiple photos;
-- menu_items.image_url mirrors the first image (position 0).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_item_images (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  menu_item_id  BIGINT UNSIGNED NOT NULL,
  image_url     VARCHAR(500)   NOT NULL,
  position      INT            NOT NULL DEFAULT 0,   -- display order (0 = cover)
  created_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mii_menu_item FOREIGN KEY (menu_item_id)
    REFERENCES menu_items (id) ON DELETE CASCADE,
  UNIQUE KEY uq_mii_item_position (menu_item_id, position)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- 4. orders
-- An order targets one restaurant; order items live in order_items.
-- NO delivery fee is ever applied (total = sum of item subtotals).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             BIGINT UNSIGNED NOT NULL,       -- who placed the order
  restaurant_id       BIGINT UNSIGNED NOT NULL,       -- which restaurant receives it
  total_amount        DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  status              ENUM('pending', 'confirmed', 'preparing', 'ready_for_pickup',
                           'delivered', 'cancelled')
                      NOT NULL DEFAULT 'pending',
  order_type          ENUM('pickup', 'delivery') NOT NULL DEFAULT 'pickup',
  delivery_address    VARCHAR(255) DEFAULT NULL,      -- required when order_type='delivery'
  special_instructions TEXT,
  payment_method      ENUM('cash', 'paystack') NOT NULL DEFAULT 'paystack',
  payment_status      ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending',
  vendor_paid         TINYINT(1) NOT NULL DEFAULT 0,  -- credited to vendor only when order is 'delivered'
  paystack_reference  VARCHAR(100) DEFAULT NULL,      -- kept for future real Paystack integration
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_restaurant FOREIGN KEY (restaurant_id)
    REFERENCES restaurants (id) ON DELETE RESTRICT,
  INDEX idx_orders_user (user_id),
  INDEX idx_orders_restaurant (restaurant_id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_payment_status (payment_status)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- 5. order_items
-- Line items of an order. subtotal is computed automatically:
-- quantity * unit_price (unit_price snapshots the menu price at order time).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id      BIGINT UNSIGNED NOT NULL,
  menu_item_id  BIGINT UNSIGNED NOT NULL,
  quantity      INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price    DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  subtotal      DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_menu_item FOREIGN KEY (menu_item_id)
    REFERENCES menu_items (id) ON DELETE RESTRICT,
  INDEX idx_order_items_order (order_id),
  INDEX idx_order_items_menu_item (menu_item_id)
) ENGINE = InnoDB;

-- ------------------------------------------------------------
-- 6. vendor_requests
-- Public registration request for restaurant owners, approved
-- or rejected by an admin. Rejection requires admin_comment.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_requests (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(255)  NOT NULL,
  restaurant_name VARCHAR(150)  NOT NULL,
  description     TEXT,
  phone           VARCHAR(20)   DEFAULT NULL,
  status          ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  admin_comment   TEXT,                               -- set when rejected (or as note on approve)
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vendor_requests_email (email),
  INDEX idx_vendor_requests_status (status)
) ENGINE = InnoDB;
