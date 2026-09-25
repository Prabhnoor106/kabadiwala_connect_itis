/**
 * Sync Routes
 */
const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { syncBatch } = require('../controllers/sync.controller');

const router = Router();

// POST /sync/batch — apply offline-queued writes
router.post(
  '/batch',
  authenticate,
  validate({
    body: z.object({
      entries: z.array(
        z.object({
          idempotency_key: z.string().min(1).max(64),
          operation: z.enum([
            'create_lot',
            'update_lot_status',
            'create_transaction',
            'update_transaction_status',
            'create_handover',
          ]),
          payload: z.record(z.any()),
          client_timestamp: z.string().datetime(),
        })
      ).min(1),
    }),
  }),
  syncBatch
);

module.exports = router;
