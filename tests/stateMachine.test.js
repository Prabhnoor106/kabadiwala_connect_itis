/**
 * Transaction state machine.
 *
 * TRANSACTION_TRANSITIONS and TRANSITION_ACTORS are the single source of truth
 * the transaction service enforces every write against. These tests lock the
 * contract so an accidental edit to the table can't silently open an illegal
 * path (e.g. skipping the handover) or let the wrong role drive a transition.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  TRANSACTION_STATUS,
  TRANSACTION_TRANSITIONS,
  TRANSITION_ACTORS,
} = require('../config/constants');

const S = TRANSACTION_STATUS;
const legal = (from, to) => (TRANSACTION_TRANSITIONS[from] || []).includes(to);

test('the documented happy path is legal end to end', () => {
  const path = [S.QUOTED, S.ACCEPTED, S.IN_TRANSIT, S.HANDED_OVER, S.CONFIRMED, S.COMPLETED];
  for (let i = 0; i < path.length - 1; i++) {
    assert.ok(legal(path[i], path[i + 1]), `expected ${path[i]} → ${path[i + 1]} to be legal`);
  }
});

test('completed and cancelled are terminal', () => {
  assert.deepEqual(TRANSACTION_TRANSITIONS[S.COMPLETED], []);
  assert.deepEqual(TRANSACTION_TRANSITIONS[S.CANCELLED], []);
});

test('the money-skipping shortcuts are illegal', () => {
  // Cannot complete without going through handover + confirmation.
  assert.equal(legal(S.QUOTED, S.COMPLETED), false);
  assert.equal(legal(S.ACCEPTED, S.COMPLETED), false);
  assert.equal(legal(S.QUOTED, S.CONFIRMED), false);
  assert.equal(legal(S.IN_TRANSIT, S.COMPLETED), false);
});

test('every in-flight state can be cancelled or disputed, terminal states cannot', () => {
  for (const s of [S.ACCEPTED, S.IN_TRANSIT, S.HANDED_OVER]) {
    assert.ok(legal(s, S.CANCELLED), `${s} should be cancellable`);
    assert.ok(legal(s, S.DISPUTED), `${s} should be disputable`);
  }
  assert.equal(legal(S.COMPLETED, S.CANCELLED), false);
  assert.equal(legal(S.COMPLETED, S.DISPUTED), false);
});

test('a dispute can be resolved forward or written off', () => {
  const fromDisputed = TRANSACTION_TRANSITIONS[S.DISPUTED];
  assert.ok(fromDisputed.includes(S.CANCELLED));
  assert.ok(fromDisputed.includes(S.COMPLETED));
});

test('only recyclers/admins may accept, confirm and complete', () => {
  for (const target of [S.ACCEPTED, S.CONFIRMED, S.COMPLETED]) {
    const actors = TRANSITION_ACTORS[target];
    assert.ok(actors.includes('recycler'), `recycler should drive ${target}`);
    assert.ok(actors.includes('admin'), `admin should drive ${target}`);
    assert.equal(actors.includes('collector'), false, `collector must not drive ${target}`);
  }
});

test('a collector may cancel, dispute and record transit/handover', () => {
  for (const target of [S.CANCELLED, S.DISPUTED, S.IN_TRANSIT, S.HANDED_OVER]) {
    assert.ok(TRANSITION_ACTORS[target].includes('collector'), `collector should drive ${target}`);
  }
});

test('the transition table only references known statuses', () => {
  const known = new Set(Object.values(S));
  for (const [from, tos] of Object.entries(TRANSACTION_TRANSITIONS)) {
    assert.ok(known.has(from), `unknown source status: ${from}`);
    for (const to of tos) assert.ok(known.has(to), `unknown target status: ${to}`);
  }
  for (const [target, actors] of Object.entries(TRANSITION_ACTORS)) {
    assert.ok(known.has(target), `unknown actor-rule status: ${target}`);
    assert.ok(Array.isArray(actors) && actors.length > 0, `${target} needs at least one actor`);
  }
});
