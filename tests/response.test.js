/**
 * API response envelope.
 *
 * The frontend api.js unwraps exactly this shape: it reads `data`, and treats a
 * response as paginated only when a top-level `pagination` key is present. If
 * these helpers drift, every screen breaks at once — so pin the contract here.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { success, created, error, parsePagination } = require('../utils/response');

/** Minimal Express res double capturing status + json. */
function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('success wraps data in { success, message, data } at 200', () => {
  const res = mockRes();
  success(res, { data: { id: 1 }, message: 'ok' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: 'ok', data: { id: 1 } });
});

test('success omits pagination unless provided', () => {
  const res = mockRes();
  success(res, { data: [] });
  assert.equal('pagination' in res.body, false);
});

test('success includes pagination at the top level when provided', () => {
  const res = mockRes();
  const pagination = { page: 2, limit: 20, totalCount: 41, totalPages: 3 };
  success(res, { data: [1, 2], pagination });
  assert.deepEqual(res.body.pagination, pagination);
  // api.js keys the { items, pagination } branch off this top-level presence.
  assert.deepEqual(res.body.data, [1, 2]);
});

test('created responds 201', () => {
  const res = mockRes();
  created(res, { data: { id: 'x' } });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
});

test('error sets success:false and defaults to 500', () => {
  const res = mockRes();
  error(res, { message: 'boom' });
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { success: false, message: 'boom' });
});

test('error carries field errors when supplied', () => {
  const res = mockRes();
  const errors = [{ field: 'phone', message: 'required' }];
  error(res, { message: 'invalid', statusCode: 422, errors });
  assert.equal(res.statusCode, 422);
  assert.deepEqual(res.body.errors, errors);
});

test('parsePagination clamps and derives skip/totalPages', () => {
  assert.deepEqual(parsePagination({ page: '2', limit: '10' }, 25), {
    page: 2,
    limit: 10,
    totalCount: 25,
    totalPages: 3,
    skip: 10,
  });

  // Defaults when absent.
  const def = parsePagination({}, 0);
  assert.equal(def.page, 1);
  assert.equal(def.limit, 20);
  assert.equal(def.totalPages, 1); // never zero
  assert.equal(def.skip, 0);

  // Over-max limit is capped at 100; negative page floored to 1.
  const capped = parsePagination({ page: '-3', limit: '9999' }, 100);
  assert.equal(capped.page, 1);
  assert.equal(capped.limit, 100);
  assert.equal(capped.skip, 0);
});
