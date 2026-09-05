/**
 * JWT helpers — sign and verify tokens.
 *
 * Token payload: { id, email, role }  (expires in 7 days)
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production.');
}
const EXPIRES_IN = '7d';

/**
 * Sign a JWT for the given payload.
 * @param {object} payload - e.g. { id, email, role }
 * @returns {string} signed token
 */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET || 'insecure_dev_secret_change_me', { expiresIn: EXPIRES_IN });
}

/**
 * Verify a JWT. Throws if invalid/expired.
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET || 'insecure_dev_secret_change_me');
}

module.exports = { signToken, verifyToken };
