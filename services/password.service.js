/**
 * Password Service
 * Single place where password/PIN hashing happens. Nothing else in the
 * codebase should import bcrypt directly.
 */
const bcrypt = require('bcryptjs');

/** Cost factor. 10 is the practical floor for 2026; 12 for production. */
const SALT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;

/**
 * Hash a plaintext password or PIN.
 *
 * @param {string} plaintext
 * @returns {Promise<string>} bcrypt hash
 */
async function hashPassword(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw Object.assign(new Error('Password is required'), { statusCode: 400 });
  }
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a stored hash.
 *
 * Returns false (never throws) when the account has no hash set, so callers
 * can treat "no password configured" and "wrong password" identically and
 * avoid leaking which accounts exist.
 *
 * @param {string} plaintext
 * @param {string|null} hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(plaintext, hash) {
  if (!hash || typeof plaintext !== 'string') return false;
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}

/**
 * Basic password strength check for recycler/admin registration.
 * Deliberately modest: 8+ chars with a letter and a digit. Collector PINs
 * use validatePin instead.
 *
 * @param {string} password
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters.' };
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { valid: false, message: 'Password must contain at least one letter and one number.' };
  }
  return { valid: true };
}

/**
 * Collector PIN validation — 4 to 6 digits.
 * PINs are an optional convenience for repeat logins on low-end devices;
 * OTP remains the primary collector auth path.
 *
 * @param {string} pin
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePin(pin) {
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
    return { valid: false, message: 'PIN must be 4 to 6 digits.' };
  }
  return { valid: true };
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  validatePin,
  SALT_ROUNDS,
};
