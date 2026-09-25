/**
 * Centralized Error Handler Middleware
 * Catches all thrown errors and formats consistent API responses.
 * Must be registered LAST in the middleware chain.
 */
const logger = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  // Log the full error in development, summary in production
  if (process.env.NODE_ENV === 'production') {
    logger.error(err.message, {
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
    });
  } else {
    logger.error(err.message, {
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      stack: err.stack,
    });
  }

  // Prisma-specific errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'A record with this value already exists.',
      errors: err.meta?.target ? [{ field: err.meta.target, message: 'Duplicate value' }] : undefined,
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Record not found.',
    });
  }

  if (err.code === 'P2003') {
    return res.status(400).json({
      success: false,
      message: 'Referenced record does not exist (foreign key constraint).',
    });
  }

  // Custom application errors (with statusCode property)
  const statusCode = err.statusCode || 500;
  const message =
    statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';

  return res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
