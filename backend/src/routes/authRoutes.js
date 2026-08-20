/**
 * Auth routes.
 *
 *   POST /api/auth/register  — public, creates a customer account
 *   POST /api/auth/login     — public, returns JWT + user
 *   GET  /api/auth/me        — protected, returns current user
 */
const express = require('express');
const { body } = require('express-validator');

const { register, login, me } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

/* Validation chains (express-validator) */
const registerRules = [
  body('full_name')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be 2-100 characters'),
  body('email')
    .trim()
    .isEmail().withMessage('A valid email address is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone')
    .optional({ values: 'falsy' })
    .isLength({ max: 20 }).withMessage('Phone number is too long'),
];

const loginRules = [
  body('email').trim().isEmail().withMessage('A valid email address is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

router.post('/register', registerRules, validate, register);
router.post('/login', loginRules, validate, login);
router.get('/me', protect, me);

module.exports = router;