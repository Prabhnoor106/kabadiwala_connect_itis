/**
 * Traceability Routes
 */
const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { verifyReference } = require('../controllers/traceability.controller');

const router = Router();

// GET /traceability/verify/:reference — public chain-of-custody check
router.get(
  '/verify/:reference',
  validate({
    params: z.object({
      reference: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^HRN-\d{8}-[A-Z0-9]{4}$/, 'Reference must look like HRN-20260905-A3F7'),
    }),
  }),
  verifyReference
);

module.exports = router;
