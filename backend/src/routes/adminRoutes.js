/**
 * Admin dashboard routes (all admin-only).
 *
 *   GET /api/admin/orders          — all orders (?status= filter)
 *   GET /api/admin/users           — all users (?role= filter)
 *   PUT /api/admin/users/:id/role  — change role
 */
const express = require('express');
const { body, param } = require('express-validator');

const { getAllOrders, listUsers, updateUserRole } = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

const roleRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid user id'),
  body('role').isIn(['customer', 'restaurant_owner', 'admin']).withMessage('Invalid role'),
];

router.get('/admin/orders', protect, adminOnly, getAllOrders);
router.get('/admin/users', protect, adminOnly, listUsers);
router.put('/admin/users/:id/role', protect, adminOnly, roleRules, validate, updateUserRole);

module.exports = router;