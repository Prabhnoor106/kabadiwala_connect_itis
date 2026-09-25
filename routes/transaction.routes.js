/**
 * Transaction Routes
 */
const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { uploadMultiple } = require('../middleware/upload.middleware');
const {
  createTransaction,
  getTransaction,
  listTransactions,
  updateTransactionStatus,
  createHandover,
  confirmHandover,
  getHandover,
} = require('../controllers/transaction.controller');

const router = Router();

const uuid = z.string().uuid();

// POST /transactions — collector requests pickup at a quoted price
router.post(
  '/',
  authenticate,
  validate({
    body: z.object({
      lot_id: uuid,
      recycler_id: uuid,
      offered_price: z.coerce.number().positive().max(10_000_000),
      pickup_scheduled_at: z.string().datetime().optional(),
    }),
  }),
  createTransaction
);

// GET /transactions — scoped to the caller's role
router.get('/', authenticate, listTransactions);

// GET /transactions/:id
router.get('/:id', authenticate, validate({ params: z.object({ id: uuid }) }), getTransaction);

// PATCH /transactions/:id/status — lifecycle transitions
router.patch(
  '/:id/status',
  authenticate,
  validate({
    params: z.object({ id: uuid }),
    body: z.object({
      status: z.enum([
        'quoted',
        'accepted',
        'in_transit',
        'handed_over',
        'confirmed',
        'completed',
        'cancelled',
        'disputed',
      ]),
      final_price: z.coerce.number().positive().max(10_000_000).optional(),
      final_weight: z.coerce.number().positive().max(100_000).optional(),
      payment_status: z.enum(['pending', 'partial', 'completed', 'refunded']).optional(),
      payment_method: z.enum(['cash', 'upi', 'bank_transfer', 'other']).optional(),
      pickup_scheduled_at: z.string().datetime().optional(),
      cancellation_reason: z.string().trim().max(500).optional(),
      note: z.string().trim().max(500).optional(),
    }),
  }),
  updateTransactionStatus
);

// POST /transactions/:id/handover — verifiable handover record (+ photos)
router.post(
  '/:id/handover',
  authenticate,
  uploadMultiple,
  validate({
    params: z.object({ id: uuid }),
    body: z.object({
      actual_weight: z.coerce.number().positive().max(100_000),
      handover_location_lat: z.coerce.number().min(-90).max(90).optional(),
      handover_location_lng: z.coerce.number().min(-180).max(180).optional(),
      notes: z.string().trim().max(500).optional(),
      photo_urls: z.union([z.string(), z.array(z.string())]).optional(),
    }),
  }),
  createHandover
);

// GET /transactions/:id/handover
router.get(
  '/:id/handover',
  authenticate,
  validate({ params: z.object({ id: uuid }) }),
  getHandover
);

// POST /transactions/traceability/:id/confirm — recycler confirms receipt
router.post(
  '/traceability/:id/confirm',
  authenticate,
  validate({ params: z.object({ id: uuid }) }),
  confirmHandover
);

module.exports = router;
