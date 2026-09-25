/**
 * Auth Routes
 * Collector (phone/OTP + optional PIN), recycler (email/password),
 * admin (email/password).
 */
const { Router } = require('express');
const { z } = require('zod');
const validate = require('../middleware/validate.middleware');
const { authenticate, optionalAuth } = require('../middleware/auth.middleware');
const {
  sendOtpHandler,
  verifyOtpHandler,
  collectorPinLoginHandler,
  setPinHandler,
  clearPinHandler,
  recyclerRegisterHandler,
  recyclerLoginHandler,
  adminRegisterHandler,
  adminLoginHandler,
  meHandler,
  updateLanguageHandler,
  updateLocationHandler,
} = require('../controllers/auth.controller');

const router = Router();

/** Indian mobile numbers, tolerating +91 / 0 prefixes. */
const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+91|0)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
  .transform((v) => v.replace(/^(\+91|0)/, ''));

const emailSchema = z.string().trim().toLowerCase().email().max(100);
const passwordSchema = z.string().min(8).max(128);

// ==================== COLLECTOR ====================

// POST /auth/send-otp
router.post(
  '/send-otp',
  validate({ body: z.object({ phone: phoneSchema }) }),
  sendOtpHandler
);

// POST /auth/verify-otp
router.post(
  '/verify-otp',
  validate({
    body: z.object({
      phone: phoneSchema,
      otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
    }),
  }),
  verifyOtpHandler
);

// POST /auth/collector/login-pin — optional PIN fast path
router.post(
  '/collector/login-pin',
  validate({
    body: z.object({
      phone: phoneSchema,
      pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4 to 6 digits'),
    }),
  }),
  collectorPinLoginHandler
);

// PUT /auth/collector/pin
router.put(
  '/collector/pin',
  authenticate,
  validate({
    body: z.object({
      pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4 to 6 digits'),
    }),
  }),
  setPinHandler
);

// DELETE /auth/collector/pin
router.delete('/collector/pin', authenticate, clearPinHandler);

// ==================== RECYCLER ====================

// POST /auth/recycler/register
router.post(
  '/recycler/register',
  validate({
    body: z.object({
      business_name: z.string().trim().min(2).max(200),
      contact_email: emailSchema,
      password: passwordSchema,
      registration_number: z.string().trim().max(100).optional(),
      contact_phone: phoneSchema.optional(),
      address: z.string().trim().max(500).optional(),
      location_lat: z.coerce.number().min(-90).max(90).optional(),
      location_lng: z.coerce.number().min(-180).max(180).optional(),
      pickup_available: z.coerce.boolean().optional(),
      max_pickup_distance_km: z.coerce.number().int().positive().max(2000).optional(),
      operating_hours: z.string().trim().max(100).optional(),
    }),
  }),
  recyclerRegisterHandler
);

// POST /auth/recycler/login
router.post(
  '/recycler/login',
  validate({
    body: z.object({
      contact_email: emailSchema,
      password: z.string().min(1).max(128),
    }),
  }),
  recyclerLoginHandler
);

// ==================== ADMIN ====================

// POST /auth/admin/register — first admin bootstraps; later ones need an admin token
router.post(
  '/admin/register',
  optionalAuth,
  validate({
    body: z.object({
      email: emailSchema.max(150),
      password: passwordSchema,
      full_name: z.string().trim().max(150).optional(),
    }),
  }),
  adminRegisterHandler
);

// POST /auth/admin/login
router.post(
  '/admin/login',
  validate({
    body: z.object({
      email: emailSchema.max(150),
      password: z.string().min(1).max(128),
    }),
  }),
  adminLoginHandler
);

// ==================== SHARED ====================

// GET /auth/me — works for every role
router.get('/me', authenticate, meHandler);

// PATCH /auth/language — collector preference
router.patch(
  '/language',
  authenticate,
  validate({ body: z.object({ preferred_language: z.enum(['hi', 'mr', 'en']) }) }),
  updateLanguageHandler
);

// PATCH /auth/location — collector operating location
router.patch(
  '/location',
  authenticate,
  validate({
    body: z.object({
      location_lat: z.coerce.number().min(-90).max(90),
      location_lng: z.coerce.number().min(-180).max(180),
    }),
  }),
  updateLocationHandler
);

module.exports = router;
