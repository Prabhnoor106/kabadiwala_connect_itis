/**
 * Price Routes
 */
const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const {
  getPrices,
  getPriceBoardAll,
  getTrend,
  recordPrice,
  getSpokenPrice,
} = require('../controllers/price.controller');

const router = Router();

const uuid = z.string().uuid();

// GET /prices/board — whole board (public; the collector home screen)
router.get('/board', getPriceBoardAll);

// GET /prices/trend — chart series
router.get(
  '/trend',
  validate({
    query: z.object({
      category_id: uuid,
      days: z.coerce.number().int().positive().max(365).optional(),
      location: z.string().trim().max(100).optional(),
    }),
  }),
  getTrend
);

// GET /prices/speak — spoken price text for device TTS
router.get(
  '/speak',
  validate({
    query: z.object({
      category_id: uuid,
      lang: z.enum(['hi', 'mr', 'en']).optional(),
      location: z.string().trim().max(100).optional(),
    }),
  }),
  getSpokenPrice
);

// GET /prices?category_id= — single category
router.get(
  '/',
  validate({
    query: z.object({
      category_id: uuid,
      location: z.string().trim().max(100).optional(),
    }),
  }),
  getPrices
);

// POST /prices — admin only (append-only history)
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate({
    body: z.object({
      category_id: uuid,
      location: z.string().trim().max(100).optional(),
      buying_price: z.coerce.number().positive().max(100_000),
      selling_price: z.coerce.number().positive().max(100_000).optional(),
      source: z.string().trim().max(100).optional(),
    }),
  }),
  recordPrice
);

module.exports = router;
