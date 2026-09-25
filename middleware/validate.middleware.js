/**
 * Validation Middleware
 * Zod-based request validation middleware factory.
 */
const { ZodError } = require('zod');

/**
 * Creates a validation middleware for a given Zod schema.
 * Validates req.body, req.query, and/or req.params based on the schema shape.
 *
 * @param {Object} schemas
 * @param {import('zod').ZodSchema} [schemas.body] - Schema for request body
 * @param {import('zod').ZodSchema} [schemas.query] - Schema for query parameters
 * @param {import('zod').ZodSchema} [schemas.params] - Schema for route parameters
 * @returns {import('express').RequestHandler}
 */
function validate(schemas) {
  return (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }

      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const formattedErrors = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));

        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: formattedErrors,
        });
      }

      next(err);
    }
  };
}

module.exports = validate;
