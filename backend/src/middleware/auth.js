/**
 * Authentication middleware.
 *
 * protect   — requires a valid `Authorization: Bearer <token>` header;
 *             attaches the decoded payload to `req.user`.
 * adminOnly — must be used AFTER protect; rejects non-admin roles.
 */
const { verifyToken } = require('../utils/jwt');

/**
 * Extract the Bearer token from the request headers.
 */
function extractToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

/**
 * Protect a route: 401 if no/invalid token, otherwise req.user is set.
 */
function protect(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Missing token.' });
  }

  try {
    // payload: { id, email, role, iat, exp }
    req.user = verifyToken(token);
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * Admin-only guard (must be chained after protect).
 */
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  return next();
}

/**
 * Optional auth — attaches req.user when a valid token is present,
 * but never rejects. Used by public routes that show extra data to
 * owners (e.g. restaurant detail for the vendor who owns it).
 */
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return next();
  }
  try {
    req.user = verifyToken(token);
  } catch {
    // invalid token — treat as anonymous
  }
  return next();
}

module.exports = { protect, adminOnly, optionalAuth, extractToken };