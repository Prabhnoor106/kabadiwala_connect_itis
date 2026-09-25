/**
 * Material & Lot Routes
 *
 * Mounted at /api, so paths here are /api/categories and /api/lots/...
 * Static segments (`/lots/estimate`) precede parameterised ones (`/lots/:id`).
 */
const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { uploadSingle } = require('../middleware/upload.middleware');
const {
  listCategories,
  createLot,
  getLot,
  listLots,
  updateLotStatus,
  updateLot,
  deleteLot,
  estimateOnly,
} = require('../controllers/material.controller');
const { getLotTraceability } = require('../controllers/traceability.controller');

const router = Router();

const uuid = z.string().uuid();
const lotCondition = z.enum(['working', 'non_working', 'damaged', 'mixed']);
const sourceType = z.enum(['household', 'commercial', 'industrial', 'institutional']);

// GET /categories — public catalogue with current rates
router.get('/categories', listCategories);

// POST /lots/estimate — live valuation without saving
router.post(
  '/lots/estimate',
  authenticate,
  validate({
    body: z.object({
      category_id: uuid,
      sub_category_id: uuid.optional(),
      approximate_weight: z.coerce.number().positive().max(100_000),
      condition: lotCondition.optional(),
      location: z.string().trim().max(200).optional(),
    }),
  }),
  estimateOnly
);

// POST /lots — create a lot (multipart: field `image`)
router.post(
  '/lots',
  authenticate,
  uploadSingle,
  validate({
    body: z.object({
      category_id: uuid,
      sub_category_id: uuid.optional(),
      approximate_weight: z.coerce.number().positive().max(100_000),
      condition: lotCondition.optional(),
      source_type: sourceType.optional(),
      collection_location_lat: z.coerce.number().min(-90).max(90).optional(),
      collection_location_lng: z.coerce.number().min(-180).max(180).optional(),
      collection_address: z.string().trim().max(500).optional(),
      notes: z.string().trim().max(1000).optional(),
      image_url: z.string().trim().max(255).optional(),
      status: z.enum(['draft', 'active']).optional(),
    }),
  }),
  createLot
);

// GET /lots — caller-scoped list
router.get('/lots', authenticate, listLots);

// GET /lots/:id
router.get('/lots/:id', authenticate, validate({ params: z.object({ id: uuid }) }), getLot);

// GET /lots/:id/traceability — full timeline
router.get(
  '/lots/:id/traceability',
  authenticate,
  validate({ params: z.object({ id: uuid }) }),
  getLotTraceability
);

// PATCH /lots/:id — edit a pre-transaction lot
router.patch(
  '/lots/:id',
  authenticate,
  uploadSingle,
  validate({
    params: z.object({ id: uuid }),
    body: z.object({
      category_id: uuid.optional(),
      sub_category_id: uuid.optional(),
      approximate_weight: z.coerce.number().positive().max(100_000).optional(),
      condition: lotCondition.optional(),
      source_type: sourceType.optional(),
      collection_location_lat: z.coerce.number().min(-90).max(90).optional(),
      collection_location_lng: z.coerce.number().min(-180).max(180).optional(),
      collection_address: z.string().trim().max(500).optional(),
      notes: z.string().trim().max(1000).optional(),
    }),
  }),
  updateLot
);

// PATCH /lots/:id/status
router.patch(
  '/lots/:id/status',
  authenticate,
  validate({
    params: z.object({ id: uuid }),
    body: z.object({
      status: z.enum(['draft', 'active', 'matched', 'in_transaction', 'completed', 'expired']),
    }),
  }),
  updateLotStatus
);

// DELETE /lots/:id — drafts with no transaction history only
router.delete('/lots/:id', authenticate, validate({ params: z.object({ id: uuid }) }), deleteLot);

module.exports = router;
