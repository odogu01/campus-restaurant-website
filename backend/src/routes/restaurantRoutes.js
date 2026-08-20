/**
 * Restaurant + menu routes.
 *
 *   GET    /api/restaurants                     — public (list active)
 *   GET    /api/restaurants/:id                 — public (detail + menu)
 *   POST   /api/restaurants                     — vendor/admin
 *   PUT    /api/restaurants/:id                 — owner/admin
 *   DELETE /api/restaurants/:id                 — owner/admin (soft)
 *   GET    /api/vendor/restaurants              — vendor (own list)
 *
 *   GET    /api/restaurants/:restaurantId/menu  — public
 *   POST   /api/restaurants/:restaurantId/menu  — owner/admin
 *   PUT    /api/menu/:itemId                    — owner/admin
 *   DELETE /api/menu/:itemId                    — owner/admin
 */
const express = require('express');
const { body, param } = require('express-validator');

const {
  listRestaurants,
  getRestaurant,
  createRestaurant,
  updateRestaurant,
  softDeleteRestaurant,
  getMyRestaurants,
} = require('../controllers/restaurantController');

const {
  listMenuItems,
  listAllMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} = require('../controllers/menuController');

const { protect, optionalAuth } = require('../middleware/auth');
const { requireRestaurantOwner, requireItemRestaurantOwner } = require('../middleware/ownership');
const { validate } = require('../middleware/validate');
const { upload } = require('../config/uploads');

const router = express.Router();

/* Validation chains */
const restaurantRules = [
  body('name').trim().notEmpty().withMessage('Restaurant name is required').isLength({ max: 150 }),
  body('cuisine_type').optional({ values: 'falsy' }).trim().isLength({ max: 50 }),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 255 }),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 20 }),
  body('logo_url').optional({ values: 'falsy' }).trim().isURL().withMessage('logo_url must be a valid URL').isLength({ max: 500 }),
];

const menuItemRules = [
  body('name').trim().notEmpty().withMessage('Item name is required').isLength({ max: 150 }),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('category').optional({ values: 'falsy' }).trim().isLength({ max: 50 }),
  body('is_available').optional({ values: 'falsy' }).isBoolean().withMessage('is_available must be true or false'),
];

const idParam = (name) => param(name).isInt({ min: 1 }).withMessage(`Invalid ${name}`);

/* ---- Public restaurant routes ---- */
router.get('/restaurants', listRestaurants);
router.get('/restaurants/:id', optionalAuth, [idParam('id')], validate, getRestaurant);

/* ---- Public all-foods route (every available item across restaurants) ---- */
router.get('/menu-items', listAllMenuItems);

/* ---- Vendor restaurant routes ---- */
router.post('/restaurants', protect, restaurantRules, validate, createRestaurant);
router.put('/restaurants/:id', protect, [idParam('id')], restaurantRules, validate, requireRestaurantOwner, updateRestaurant);
router.delete('/restaurants/:id', protect, [idParam('id')], validate, requireRestaurantOwner, softDeleteRestaurant);
router.get('/vendor/restaurants', protect, getMyRestaurants);

/* ---- Menu routes ---- */
router.get('/restaurants/:restaurantId/menu', [idParam('restaurantId')], validate, listMenuItems);
router.post(
  '/restaurants/:restaurantId/menu',
  protect,
  [idParam('restaurantId')],
  requireRestaurantOwner, // auth/ownership BEFORE upload → no orphan files
  upload.array('images', 5), // multipart: images[] — STRICT minimum 2 enforced in controller
  menuItemRules,
  validate,
  createMenuItem
);
router.put(
  '/menu/:itemId',
  protect,
  [idParam('itemId')],
  requireItemRestaurantOwner,
  upload.array('images', 5),
  menuItemRules,
  validate,
  updateMenuItem
);
router.delete('/menu/:itemId', protect, [idParam('itemId')], validate, requireItemRestaurantOwner, deleteMenuItem);

module.exports = router;