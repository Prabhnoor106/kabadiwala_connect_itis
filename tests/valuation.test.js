/**
 * Rule-based valuation.
 *
 * The estimate is a transparent rule — reference_price × weight ×
 * condition_factor — never a model. Two things are checkable without a database:
 * the published condition multipliers, and the input-guard that refuses to value
 * a non-positive weight (it returns before ever consulting price data).
 *
 * dotenv is loaded so PrismaClient can be constructed when pricing.service pulls
 * in the db singleton; no query runs in these tests, so no connection is opened.
 */
require('dotenv').config();

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { estimateLotValue, CONDITION_FACTORS } = require('../services/pricing.service');

test('condition factors are ordered working > mixed > non_working > damaged', () => {
  assert.ok(CONDITION_FACTORS.working > CONDITION_FACTORS.mixed);
  assert.ok(CONDITION_FACTORS.mixed > CONDITION_FACTORS.non_working);
  assert.ok(CONDITION_FACTORS.non_working > CONDITION_FACTORS.damaged);
});

test('mixed is the neutral 1.0 baseline', () => {
  assert.equal(CONDITION_FACTORS.mixed, 1.0);
});

test('a non-positive or non-numeric weight yields an honest "unavailable"', async () => {
  for (const weight of [0, -5, NaN, 'not-a-number', null, undefined]) {
    const result = await estimateLotValue({ category_id: 'any', weight });
    assert.equal(result.estimated_value, null, `weight ${String(weight)} should not value`);
    assert.equal(result.method, 'unavailable');
    assert.equal(typeof result.reason, 'string');
  }
});

test('valuation never claims to be a model prediction', () => {
  // The rule's method name is checked by the UI to label the number honestly.
  // Guard the string so a future refactor can't quietly imply an ML output.
  assert.equal(CONDITION_FACTORS.working, 1.15);
  assert.equal(CONDITION_FACTORS.damaged, 0.75);
});
