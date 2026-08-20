/**
 * Vendor request routes.
 *
 *   POST /api/vendor-requests              — public
 *   GET  /api/admin/vendor-requests        — admin only
 *   PUT  /api/admin/vendor-requests/:id    — admin only
 */
const express = require('express');
const { body, param } = require('express-validator');

const {
  createVendorRequest,
  listVendorRequests,
  reviewVendorRequest,
} = require('../controllers/vendorRequestController');
const { protect, adminOnly } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

/* Validation chains */
const createRules = [
  body('email').trim().isEmail().withMessage('A valid email address is required').normalizeEmail(),
  body('restaurantName')
    .trim()
    .notEmpty().withMessage('Restaurant name is required')
    .isLength({ max: 150 }).withMessage('Restaurant name is too long'),
  body('phone').optional({ values: 'falsy' }).isLength({ max: 20 }).withMessage('Phone number is too long'),
];

const reviewRules = [
  param('id').isInt({ min: 1 }).withMessage('Invalid request id'),
  body('action').isIn(['approve', 'reject']).withMessage("action must be 'approve' or 'reject'"),
  body('admin_comment').optional({ values: 'falsy' }).isLength({ max: 2000 }).withMessage('Comment too long'),
];

/* Public */
router.post('/vendor-requests', createRules, validate, createVendorRequest);

/* Admin only */
router.get('/admin/vendor-requests', protect, adminOnly, listVendorRequests);
router.put('/admin/vendor-requests/:id', protect, adminOnly, reviewRules, validate, reviewVendorRequest);

module.exports = router;