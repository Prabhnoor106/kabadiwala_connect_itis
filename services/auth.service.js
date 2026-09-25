/**
 * Auth Service
 * All three identity flows in one place:
 *   - collector: phone + OTP (primary), optional PIN
 *   - recycler:  email + password
 *   - admin:     email + password
 *
 * Controllers stay thin; every credential check happens here.
 */
const Collector = require('../models/Collector');
const Recycler = require('../models/Recycler');
const Admin = require('../models/Admin');
const { generateToken } = require('../middleware/auth.middleware');
const { hashPassword, verifyPassword, validatePasswordStrength, validatePin } = require('./password.service');
const { sendOTP } = require('./notification.service');
const { ROLES } = require('../config/constants');
const logger = require('../utils/logger');

/** Throw a typed HTTP error the central error handler understands. */
function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

const OTP_TTL_MS = 10 * 60 * 1000;

// ============================================================
// COLLECTOR — phone + OTP
// ============================================================

/**
 * Issue an OTP for a phone number, registering the collector on first contact.
 * Returns the OTP itself only outside production so the flow is testable.
 */
async function requestCollectorOtp(phone) {
  let collector = await Collector.findByPhone(phone);
  let isNew = false;

  if (!collector) {
    collector = await Collector.create({ phone });
    isNew = true;
    logger.info('New collector registered', { collector_id: collector.id });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await Collector.setOtp(collector.id, { otp_secret: otp, otp_expires_at: expiresAt });
  await sendOTP(phone, otp);

  return {
    phone,
    is_new_collector: isNew,
    expires_in_seconds: OTP_TTL_MS / 1000,
    // Dev/demo convenience: no SMS gateway is wired up, so surface the code.
    ...(process.env.NODE_ENV !== 'production' && { otp }),
  };
}

/**
 * Verify an OTP and issue a collector JWT.
 */
async function verifyCollectorOtp(phone, otp) {
  const collector = await Collector.findByPhone(phone);
  if (!collector) {
    throw httpError('Phone number not found. Request an OTP first.', 404);
  }
  if (!collector.otp_secret || collector.otp_secret !== otp) {
    throw httpError('Invalid OTP.', 401);
  }
  if (!collector.otp_expires_at || new Date() > collector.otp_expires_at) {
    throw httpError('OTP expired. Request a new one.', 401);
  }

  await Collector.verify(collector.id);

  return {
    token: generateToken({ id: collector.id, phone: collector.phone, role: ROLES.COLLECTOR }),
    role: ROLES.COLLECTOR,
    user: {
      id: collector.id,
      phone: collector.phone,
      preferred_language: collector.preferred_language,
      is_verified: true,
      has_pin: Boolean(collector.pin_hash),
    },
  };
}

/**
 * Optional fast path: phone + PIN, for collectors who set one.
 */
async function loginCollectorWithPin(phone, pin) {
  const collector = await Collector.findByPhone(phone);

  // Uniform failure message — never reveal whether the phone exists or
  // whether a PIN was configured for it.
  const ok = collector && (await verifyPassword(pin, collector.pin_hash));
  if (!ok) {
    throw httpError('Invalid phone number or PIN.', 401);
  }
  if (!collector.is_verified) {
    throw httpError('Verify your phone with an OTP before using a PIN.', 403);
  }

  return {
    token: generateToken({ id: collector.id, phone: collector.phone, role: ROLES.COLLECTOR }),
    role: ROLES.COLLECTOR,
    user: {
      id: collector.id,
      phone: collector.phone,
      preferred_language: collector.preferred_language,
      is_verified: collector.is_verified,
      has_pin: true,
    },
  };
}

/**
 * Set or replace a collector's optional PIN.
 */
async function setCollectorPin(collector_id, pin) {
  const check = validatePin(pin);
  if (!check.valid) throw httpError(check.message, 400);

  await Collector.setPinHash(collector_id, await hashPassword(pin));
  return { has_pin: true };
}

// ============================================================
// RECYCLER — email + password
// ============================================================

/**
 * Register a recycler business account.
 *
 * Self-registered recyclers always start at authorization_status 'pending'.
 * Only an admin can move them to 'authorized', and only authorized recyclers
 * appear in collector-facing matching — that gate is the whole point of the
 * platform, so it is never bypassable from this path.
 */
async function registerRecycler({
  business_name,
  contact_email,
  password,
  registration_number,
  contact_phone,
  address,
  location_lat,
  location_lng,
  pickup_available,
  max_pickup_distance_km,
  operating_hours,
}) {
  const strength = validatePasswordStrength(password);
  if (!strength.valid) throw httpError(strength.message, 400);

  const email = String(contact_email).toLowerCase().trim();

  const existing = await Recycler.findByEmailWithSecret(email);
  if (existing) {
    throw httpError('An account with this email already exists.', 409);
  }

  const recycler = await Recycler.create({
    business_name,
    contact_email: email,
    password_hash: await hashPassword(password),
    registration_number: registration_number || null,
    contact_phone: contact_phone || null,
    address: address || null,
    location_lat: location_lat ?? null,
    location_lng: location_lng ?? null,
    pickup_available: pickup_available ?? false,
    max_pickup_distance_km: max_pickup_distance_km ?? 50,
    operating_hours: operating_hours || null,
    authorization_status: 'pending',
  });

  logger.info('New recycler registered (pending verification)', { recycler_id: recycler.id });

  return {
    token: generateToken({ id: recycler.id, email, role: ROLES.RECYCLER }),
    role: ROLES.RECYCLER,
    user: recycler,
  };
}

/**
 * Log a recycler in.
 *
 * Pending/suspended recyclers can still sign in — they need to see their own
 * verification status and manage their profile — but authorization gating is
 * enforced per-endpoint by requireAuthorizedRecycler.
 */
async function loginRecycler(contact_email, password) {
  const recycler = await Recycler.findByEmailWithSecret(contact_email);

  const ok = recycler && (await verifyPassword(password, recycler.password_hash));
  if (!ok) {
    throw httpError('Invalid email or password.', 401);
  }
  if (recycler.authorization_status === 'revoked') {
    throw httpError('This account has been revoked. Contact platform support.', 403);
  }

  const { password_hash, ...safe } = recycler;

  return {
    token: generateToken({
      id: recycler.id,
      email: recycler.contact_email,
      role: ROLES.RECYCLER,
    }),
    role: ROLES.RECYCLER,
    user: safe,
  };
}

// ============================================================
// ADMIN — email + password
// ============================================================

/**
 * Register an admin.
 *
 * The first admin can bootstrap itself (empty table). After that, creating an
 * admin requires an existing admin caller — enforced by `requesterIsAdmin`.
 */
async function registerAdmin({ email, password, full_name }, { requesterIsAdmin = false } = {}) {
  const strength = validatePasswordStrength(password);
  if (!strength.valid) throw httpError(strength.message, 400);

  const existingCount = await Admin.count();
  if (existingCount > 0 && !requesterIsAdmin) {
    throw httpError('Only an existing admin can create admin accounts.', 403);
  }

  const normalized = String(email).toLowerCase().trim();
  if (await Admin.findByEmailWithSecret(normalized)) {
    throw httpError('An admin with this email already exists.', 409);
  }

  const admin = await Admin.create({
    email: normalized,
    password_hash: await hashPassword(password),
    full_name: full_name || null,
  });

  logger.info('New admin created', { admin_id: admin.id, bootstrap: existingCount === 0 });

  return {
    token: generateToken({ id: admin.id, email: admin.email, role: ROLES.ADMIN }),
    role: ROLES.ADMIN,
    user: admin,
  };
}

/**
 * Log an admin in.
 */
async function loginAdmin(email, password) {
  const admin = await Admin.findByEmailWithSecret(email);

  const ok = admin && (await verifyPassword(password, admin.password_hash));
  if (!ok) {
    throw httpError('Invalid email or password.', 401);
  }

  const { password_hash, ...safe } = admin;

  return {
    token: generateToken({ id: admin.id, email: admin.email, role: ROLES.ADMIN }),
    role: ROLES.ADMIN,
    user: safe,
  };
}

// ============================================================
// SHARED
// ============================================================

/**
 * Resolve the authenticated principal behind a JWT, per role.
 * Used by GET /auth/me so every role has one identity endpoint.
 */
async function getCurrentUser({ id, role }) {
  if (role === ROLES.COLLECTOR) {
    const c = await Collector.findById(id);
    if (!c) throw httpError('Account not found.', 404);
    return {
      role,
      user: {
        id: c.id,
        phone: c.phone,
        preferred_language: c.preferred_language,
        is_verified: c.is_verified,
        location_lat: c.location_lat,
        location_lng: c.location_lng,
        has_pin: Boolean(c.pin_hash),
        created_at: c.created_at,
      },
    };
  }

  if (role === ROLES.RECYCLER) {
    const r = await Recycler.findById(id);
    if (!r) throw httpError('Account not found.', 404);
    return { role, user: r };
  }

  if (role === ROLES.ADMIN) {
    const a = await Admin.findById(id);
    if (!a) throw httpError('Account not found.', 404);
    return { role, user: a };
  }

  throw httpError('Unknown role on token.', 401);
}

module.exports = {
  requestCollectorOtp,
  verifyCollectorOtp,
  loginCollectorWithPin,
  setCollectorPin,
  registerRecycler,
  loginRecycler,
  registerAdmin,
  loginAdmin,
  getCurrentUser,
};
