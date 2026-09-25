/**
 * Consistent API Response Formatter
 * All controller responses should use these helpers for uniformity.
 */

/**
 * Send a success response.
 *
 * @param {import('express').Response} res
 * @param {Object} options
 * @param {*} options.data - Response payload
 * @param {string} [options.message] - Human-readable message
 * @param {number} [options.statusCode=200] - HTTP status code
 * @param {Object} [options.pagination] - Pagination metadata
 */
function success(res, { data = null, message = 'Success', statusCode = 200, pagination = null } = {}) {
  const body = {
    success: true,
    message,
    data,
  };

  if (pagination) {
    body.pagination = pagination;
  }

  return res.status(statusCode).json(body);
}

/**
 * Send a created (201) response.
 */
function created(res, { data = null, message = 'Created successfully' } = {}) {
  return success(res, { data, message, statusCode: 201 });
}

/**
 * Send an error response.
 *
 * @param {import('express').Response} res
 * @param {Object} options
 * @param {string} options.message - Error message
 * @param {number} [options.statusCode=500] - HTTP status code
 * @param {*} [options.errors] - Validation errors or additional detail
 */
function error(res, { message = 'Internal server error', statusCode = 500, errors = null } = {}) {
  const body = {
    success: false,
    message,
  };

  if (errors) {
    body.errors = errors;
  }

  return res.status(statusCode).json(body);
}

/**
 * Build pagination metadata from query params.
 *
 * @param {Object} query - Express query object
 * @param {number} totalCount - Total number of records
 * @returns {{ page: number, limit: number, totalCount: number, totalPages: number, skip: number }}
 */
function parsePagination(query, totalCount = 0) {
  const { PAGINATION } = require('../config/constants');

  let page = parseInt(query.page, 10) || PAGINATION.DEFAULT_PAGE;
  let limit = parseInt(query.limit, 10) || PAGINATION.DEFAULT_LIMIT;

  if (page < 1) page = 1;
  if (limit < 1) limit = PAGINATION.DEFAULT_LIMIT;
  if (limit > PAGINATION.MAX_LIMIT) limit = PAGINATION.MAX_LIMIT;

  const totalPages = Math.ceil(totalCount / limit) || 1;
  const skip = (page - 1) * limit;

  return { page, limit, totalCount, totalPages, skip };
}

module.exports = {
  success,
  created,
  error,
  parsePagination,
};
