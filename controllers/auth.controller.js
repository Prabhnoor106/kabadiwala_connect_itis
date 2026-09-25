/**
 * Auth Controller
 * Thin HTTP layer over auth.service. Three identity flows:
 *   - collector: phone + OTP (primary), optional PIN
 *   - recycler:  email + password
 *   - admin:     email + password
 */
const Collector = require('../models/Collector');
const authService = require('../services/auth.service');
const { success, created, error } = require('../utils/response');

// ==================== COLLECTOR ====================

/**
 * POST /auth/send-otp
 * Send an OTP to a phone number. Registers the collector on first contact.
 */
async function sendOtpHandler(req, res, next) {
  try {
    const data = await authService.requestCollectorOtp(req.body.phone);
    return success(res, { message: 'OTP sent successfully', data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/verify-otp
 * Verify an OTP and issue a collector JWT.
 */
async function verifyOtpHandler(req, res, next) {
  try {
    const data = await authService.verifyCollectorOtp(req.body.phone, req.body.otp);
    return success(res, { message: 'Authenticated successfully', data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/collector/login-pin
 * Optional PIN fast-path for collectors who have set one.
 */
async function collectorPinLoginHandler(req, res, next) {
  try {
    const data = await authService.loginCollectorWithPin(req.body.phone, req.body.pin);
    return success(res, { message: 'Authenticated successfully', data });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /auth/collector/pin
 * Set or replace the caller's optional login PIN.
 */
async function setPinHandler(req, res, next) {
  try {
    const data = await authService.setCollectorPin(req.user.id, req.body.pin);
    return success(res, { message: 'PIN set successfully', data });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /auth/collector/pin
 * Remove the caller's PIN, reverting to OTP-only login.
 */
async function clearPinHandler(req, res, next) {
  try {
    await Collector.clearPin(req.user.id);
    return success(res, { message: 'PIN removed', data: { has_pin: false } });
  } catch (err) {
    next(err);
  }
}

// ==================== RECYCLER ====================

/**
 * POST /auth/recycler/register
 * Register a recycler business account. Starts as 'pending' verification.
 */
async function recyclerRegisterHandler(req, res, next) {
  try {
    const data = await authService.registerRecycler(req.body);
    return created(res, {
      message:
        'Account created. An admin must verify your CPCB authorization before you can accept lots.',
      data,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/recycler/login
 */
async function recyclerLoginHandler(req, res, next) {
  try {
    const data = await authService.loginRecycler(req.body.contact_email, req.body.password);
    return success(res, { message: 'Authenticated successfully', data });
  } catch (err) {
    next(err);
  }
}

// ==================== ADMIN ====================

/**
 * POST /auth/admin/register
 * The first admin bootstraps itself; after that an admin token is required.
 */
async function adminRegisterHandler(req, res, next) {
  try {
    const data = await authService.registerAdmin(req.body, {
      requesterIsAdmin: req.user?.role === 'admin',
    });
    return created(res, { message: 'Admin account created', data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/admin/login
 */
async function adminLoginHandler(req, res, next) {
  try {
    const data = await authService.loginAdmin(req.body.email, req.body.password);
    return success(res, { message: 'Authenticated successfully', data });
  } catch (err) {
    next(err);
  }
}

// ==================== SHARED ====================

/**
 * GET /auth/me
 * Resolve the authenticated principal for any role.
 */
async function meHandler(req, res, next) {
  try {
    const data = await authService.getCurrentUser(req.user);
    return success(res, { data });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /auth/language
 * Collector-only preference.
 */
async function updateLanguageHandler(req, res, next) {
  try {
    if (req.user.role !== 'collector') {
      return error(res, { message: 'Language preference applies to collector accounts.', statusCode: 403 });
    }

    const { preferred_language } = req.body;
    await Collector.updateLanguage(req.user.id, preferred_language);
    return success(res, { message: 'Language updated', data: { preferred_language } });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /auth/location
 * Collector-only operating location.
 */
async function updateLocationHandler(req, res, next) {
  try {
    if (req.user.role !== 'collector') {
      return error(res, { message: 'Location applies to collector accounts.', statusCode: 403 });
    }

    const { location_lat, location_lng } = req.body;
    await Collector.updateLocation(req.user.id, { location_lat, location_lng });
    return success(res, { message: 'Location updated', data: { location_lat, location_lng } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
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
};
