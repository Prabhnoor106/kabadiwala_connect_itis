/**
 * Handover Reference Number Generator
 * Generates unique HRN-xxxx format reference numbers for traceability records.
 */
const { v4: uuidv4 } = require('uuid');

/**
 * Generate a unique handover reference number.
 * Format: HRN-YYYYMMDD-XXXX where XXXX is a random alphanumeric suffix.
 *
 * @returns {string} Unique reference number (e.g. "HRN-20260904-A3F7")
 */
function generateReference() {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  // Take 4 hex chars from a UUID for the random suffix
  const randomSuffix = uuidv4().replace(/-/g, '').substring(0, 4).toUpperCase();

  return `HRN-${datePart}-${randomSuffix}`;
}

/**
 * Validate that a string matches the HRN format.
 *
 * @param {string} ref
 * @returns {boolean}
 */
function isValidReference(ref) {
  return /^HRN-\d{8}-[A-Z0-9]{4}$/.test(ref);
}

module.exports = {
  generateReference,
  isValidReference,
};
