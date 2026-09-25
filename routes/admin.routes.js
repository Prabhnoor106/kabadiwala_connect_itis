/**
 * Admin Routes
 * Every route here requires an admin token.
 */
const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const {
  getStats,
  getAnalytics,
  getAttention,
  listCollectors,
  getCollectorDetail,
  setCollectorVerification,
  listAllLots,
  listAdmins,
  recordPrice,
  getDatasetHealth,
} = require('../controllers/admin.controller');

const router = Router();

const uuid = z.string().uuid();

// Admin-only for everything below.
router.use(authenticate, authorize('admin'));

// GET /admin/stats
router.get('/stats', getStats);

// GET /admin/analytics?days=30
router.get('/analytics', getAnalytics);

// GET /admin/attention — disputes, stale quotes, pending verifications
router.get('/attention', getAttention);

// GET /admin/datasets — dataset generation health
router.get('/datasets', getDatasetHealth);

// GET /admin/collectors
router.get('/collectors', listCollectors);

// GET /admin/collectors/:id
router.get(
  '/collectors/:id',
  validate({ params: z.object({ id: uuid }) }),
  getCollectorDetail
);

// PATCH /admin/collectors/:id/verification
router.patch(
  '/collectors/:id/verification',
  validate({
    params: z.object({ id: uuid }),
    body: z.object({ is_verified: z.coerce.boolean() }),
  }),
  setCollectorVerification
);

// GET /admin/lots — platform-wide lot monitoring
router.get('/lots', listAllLots);

// GET /admin/admins
router.get('/admins', listAdmins);

// POST /admin/prices — record a market-survey observation
router.post(
  '/prices',
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
