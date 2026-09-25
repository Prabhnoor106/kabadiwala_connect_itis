/**
 * Handover reference number: format, round-trip and uniqueness.
 *
 * The public verification URL (/verify/:reference) and the traceability lookup
 * both reject anything that doesn't match this exact shape, so the generator
 * and the validator must agree.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { generateReference, isValidReference } = require('../utils/generateReference');

test('generateReference produces the documented HRN-YYYYMMDD-XXXX shape', () => {
  const ref = generateReference();
  assert.match(ref, /^HRN-\d{8}-[A-Z0-9]{4}$/, `unexpected shape: ${ref}`);
});

test('generated references validate against isValidReference', () => {
  for (let i = 0; i < 50; i++) {
    assert.ok(isValidReference(generateReference()));
  }
});

test('the date part encodes today', () => {
  const now = new Date();
  const expected = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  assert.equal(generateReference().slice(4, 12), expected);
});

test('isValidReference rejects malformed input', () => {
  const bad = [
    '',
    'HRN-2026-ABCD', // date too short
    'HRN-20260904-abcd', // lowercase suffix
    'HRN-20260904-ABC', // suffix too short
    'XRN-20260904-ABCD', // wrong prefix
    'HRN20260904ABCD', // missing hyphens
    null,
    undefined,
  ];
  for (const value of bad) {
    assert.equal(isValidReference(value), false, `should reject: ${String(value)}`);
  }
});

test('references are effectively unique across a batch', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(generateReference());
  // 4 hex chars = 65 536 possibilities; a 2 000-draw batch collides rarely, but
  // the vast majority must be distinct. Anything near-total collision is a bug.
  assert.ok(seen.size > 1900, `too many collisions: ${seen.size}/2000 unique`);
});
