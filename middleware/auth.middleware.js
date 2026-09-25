/**
 * Auth Middleware
 * JWT verification and role-based access control.
 */
const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Verify JWT token from Authorization header.
 * Attaches decoded user to req.user.
 */
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res, {
        message: 'Authentication required. Provide a Bearer token.',
        statusCode: 401,
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: decoded.id,
      phone: decoded.phone,
      role: decoded.role,
    };

    next();
  } catch (err) {
    logger.warn('Auth failed', { error: err.message });

    if (err.name === 'TokenExpiredError') {
      return error(res, { message: 'Token expired. Please log in again.', statusCode: 401 });
    }
    if (err.name === 'JsonWebTokenError') {
      return error(res, { message: 'Invalid token.', statusCode: 401 });
    }

    return error(res, { message: 'Authentication failed.', statusCode: 401 });
  }
}

/**
 * Role-based authorization middleware factory.
 * Usage: authorize('admin') or authorize('collector', 'admin')
 *
 * @param  {...string} roles - Allowed roles
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, { message: 'Authentication required.', statusCode: 401 });
    }

    if (!roles.includes(req.user.role)) {
      return error(res, {
        message: 'Insufficient permissions.',
        statusCode: 403,
      });
    }

    next();
  };
}

/**
 * Require an authorized (CPCB-verified) recycler.
 *
 * Gates every action that puts a recycler in front of collectors: quoting,
 * accepting lots, confirming handovers. Pending/suspended recyclers keep
 * profile access but cannot transact — this is the platform's core promise
 * that material only ever flows to authorized facilities.
 *
 * Admins pass through so ops staff can act on a recycler's behalf.
 */
async function requireAuthorizedRecycler(req, res, next) {
  try {
    if (!req.user) {
      return error(res, { message: 'Authentication required.', statusCode: 401 });
    }

    if (req.user.role === 'admin') return next();

    if (req.user.role !== 'recycler') {
      return error(res, { message: 'This action is for recycler accounts only.', statusCode: 403 });
    }

    const prisma = require('../config/db');
    const recycler = await prisma.recyclers.findUnique({
      where: { id: req.user.id },
      select: { authorization_status: true },
    });

    if (!recycler) {
      return error(res, { message: 'Recycler account not found.', statusCode: 404 });
    }

    if (recycler.authorization_status !== 'authorized') {
      return error(res, {
        message:
          `Your account is '${recycler.authorization_status}'. ` +
          'An admin must verify your CPCB authorization before you can transact.',
        statusCode: 403,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional authentication — parses token if present, continues without if not.
 */
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = {
        id: decoded.id,
        phone: decoded.phone,
        role: decoded.role,
      };
    }
  } catch {
    // Token invalid or expired — continue without auth
    req.user = null;
  }

  next();
}

/**
 * Generate a JWT for a user.
 *
 * @param {Object} payload - { id, phone, role }
 * @returns {string} JWT token
 */
function generateToken(payload) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured. Set it in .env before issuing tokens.');
  }
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

module.exports = {
  authenticate,
  authorize,
  requireAuthorizedRecycler,
  optionalAuth,
  generateToken,
};
