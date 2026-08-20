/**
 * Order routes.
 *
 *   POST /api/orders              — customer (place order)
 *   GET  /api/orders              — customer (own orders)
 *   GET  /api/orders/:id          — customer/vendor/admin (detail)
 *   PUT  /api/orders/:id/status   — vendor (own restaurant) / admin
 *   PUT  /api/orders/:id/cancel   — customer (own, pending/confirmed)
 *   GET  /api/vendor/orders       — vendor (their restaurant's orders)
 */
const express = require('express');
const { body, param } = require('express-validator');

const {
  placeOrder,
  listMyOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  getVendorOrders,
} = require('../controllers/orderController');

const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

/* Validation chains */
const placeOrderRules = [
  body('restaurantId').isInt({ min: 1 }).withMessage('restaurantId is required'),
  body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
  body('items.*.menuItemId').isInt({ min: 1 }).withMessage('each item needs a valid menuItemId'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('each item needs a quantity of at least 1'),
  body('orderType').isIn(['pickup', 'delivery']).withMessage("orderType must be 'pickup' or 'delivery'"),
  body('deliveryAddress').optional({ values: 'falsy' }).isLength({ max: 255 }).withMessage('deliveryAddress too long'),
  body('specialInstructions').optional({ values: 'falsy' }).isLength({ max: 2000 }).withMessage('specialInstructions too long'),
  body('paymentMethod').isIn(['cash', 'paystack']).withMessage("paymentMethod must be 'cash' or 'paystack'"),
];

const statusRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid order id'),
  body('status').isIn(['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'delivered', 'cancelled'])
    .withMessage('Invalid order status'),
];

const idRules = [param('id').isInt({ min: 1 }).withMessage('Invalid order id')];

router.post('/orders', protect, placeOrderRules, validate, placeOrder);
router.get('/orders', protect, listMyOrders);
router.get('/orders/:id', protect, idRules, validate, getOrderById);
router.put('/orders/:id/status', protect, statusRules, validate, updateOrderStatus);
router.put('/orders/:id/cancel', protect, idRules, validate, cancelOrder);
router.get('/vendor/orders', protect, getVendorOrders);

module.exports = router;