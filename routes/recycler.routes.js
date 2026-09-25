/**
 * Recycler Routes
 *
 * Route order matters: `/me/...` is declared before `/:id` so the literal
 * segment is never captured as a UUID param.
 */
const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const {
  authenticate,
  authorize,
  optionalAuth,
  requireAuthorizedRecycler,
} = require('../middleware/auth.middleware');
const {
  listRecyclers,
  getRecycler,
  getRates,
  createRecycler,
  updateRecycler,
  setAuthorization,
  deleteRecycler,
  getOwnProfile,
  updateAvailability,
  getOwnRates,
  upsertOwnRate,
  deleteOwnRate,
  upsertRate,
  getIncoming,
  getDashboard,
} = require('../controllers/recycler.controller');

const router = Router();

const uuid = z.string().uuid();

const rateBody = z.object({
  category_id: uuid,
  buying_price: z.coerce.number().positive().max(100_000),
  unit: z.string().trim().max(20).optional(),
  min_quantity: z.coerce.number().min(0).max(100_000).optional(),
});

// ==================== RECYCLER SELF-SERVICE (/me) ====================

// GET /recyclers/me/dashboard
router.get('/me/dashboard', authenticate, authorize('recycler', 'admin'), getDashboard);

// GET /recyclers/me/profile
router.get('/me/profile', authenticate, authorize('recycler', 'admin'), getOwnProfile);

// PATCH /recyclers/me/profile
router.patch(
  '/me/profile',
  authenticate,
  authorize('recycler'),
  validate({
    body: z.object({
      business_name: z.string().trim().min(2).max(200).optional(),
      registration_number: z.string().trim().max(100).optional(),
      contact_phone: z.string().trim().max(15).optional(),
      address: z.string().trim().max(500).optional(),
      location_lat: z.coerce.number().min(-90).max(90).optional(),
      location_lng: z.coerce.number().min(-180).max(180).optional(),
      operating_hours: z.string().trim().max(100).optional(),
    }),
  }),
  (req, _res, next) => {
    // resolveTargetId reads req.params.id; a recycler editing itself has none.
    req.params.id = req.user.id;
    next();
  },
  updateRecycler
);

// PATCH /recyclers/me/availability — pickup toggle + service radius
router.patch(
  '/me/availability',
  authenticate,
  authorize('recycler'),
  validate({
    body: z
      .object({
        pickup_available: z.coerce.boolean().optional(),
        max_pickup_distance_km: z.coerce.number().int().positive().max(2000).optional(),
        operating_hours: z.string().trim().max(100).optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update.' }),
  }),
  updateAvailability
);

// GET /recyclers/me/rates
router.get('/me/rates', authenticate, authorize('recycler'), getOwnRates);

// PUT /recyclers/me/rates — offered rate per material (authorized only)
router.put(
  '/me/rates',
  authenticate,
  authorize('recycler'),
  requireAuthorizedRecycler,
  validate({ body: rateBody }),
  upsertOwnRate
);

// DELETE /recyclers/me/rates/:category_id
router.delete(
  '/me/rates/:category_id',
  authenticate,
  authorize('recycler'),
  validate({ params: z.object({ category_id: uuid }) }),
  deleteOwnRate
);

// GET /recyclers/me/incoming — pickup requests + in-flight transactions
router.get('/me/incoming', authenticate, authorize('recycler', 'admin'), getIncoming);

// ==================== PUBLIC DIRECTORY ====================

// GET /recyclers — optionalAuth so admins can see non-authorized facilities
router.get('/', optionalAuth, listRecyclers);

// GET /recyclers/:id
router.get('/:id', optionalAuth, validate({ params: z.object({ id: uuid }) }), getRecycler);

// GET /recyclers/:id/rates
router.get('/:id/rates', validate({ params: z.object({ id: uuid }) }), getRates);

// ==================== ADMIN MANAGEMENT ====================

// POST /recyclers
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate({
    body: z.object({
      business_name: z.string().trim().min(2).max(200),
      registration_number: z.string().trim().max(100).optional(),
      authorization_status: z.enum(['authorized', 'pending', 'suspended', 'revoked']).optional(),
      contact_phone: z.string().trim().max(15).optional(),
      contact_email: z.string().trim().toLowerCase().email().max(100).optional(),
      address: z.string().trim().max(500).optional(),
      location_lat: z.coerce.number().min(-90).max(90).optional(),
      location_lng: z.coerce.number().min(-180).max(180).optional(),
      pickup_available: z.coerce.boolean().optional(),
      max_pickup_distance_km: z.coerce.number().int().positive().max(2000).optional(),
      operating_hours: z.string().trim().max(100).optional(),
    }),
  }),
  createRecycler
);

// PATCH /recyclers/:id
router.patch(
  '/:id',
  authenticate,
  authorize('admin', 'recycler'),
  validate({ params: z.object({ id: uuid }) }),
  updateRecycler
);

// PATCH /recyclers/:id/authorization — CPCB verification outcome
router.patch(
  '/:id/authorization',
  authenticate,
  authorize('admin'),
  validate({
    params: z.object({ id: uuid }),
    body: z.object({
      authorization_status: z.enum(['authorized', 'pending', 'suspended', 'revoked']),
    }),
  }),
  setAuthorization
);

// PUT /recyclers/:id/rates — admin sets a rate on a recycler's behalf
router.put(
  '/:id/rates',
  authenticate,
  authorize('admin'),
  validate({ params: z.object({ id: uuid }), body: rateBody }),
  upsertRate
);

// DELETE /recyclers/:id
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validate({ params: z.object({ id: uuid }) }),
  deleteRecycler
);

// NOTE: GET /api/lots/:id/matches is mounted in app.js straight from the
// controller — it is logically a lot sub-resource. Do NOT reassign
// module.exports below this line; doing so discards every route above.
module.exports = router;
