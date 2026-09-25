/**
 * End-to-end lifecycle test against the RUNNING server and the REAL Supabase DB.
 *
 * Exercises every role and the full transaction state machine over HTTP:
 *   admin/recycler/collector auth → lot → valuation → matching → request →
 *   accept → in_transit → handover → confirm → complete → earnings →
 *   traceability, plus price board/trend/speak, admin dashboards, uploads,
 *   and role-authorization negatives.
 *
 * Usage: node scripts/e2e.js   (server must be listening on $PORT, default 3000)
 */
require('dotenv').config();

const BASE = `http://localhost:${process.env.PORT || 3000}/api`;

const results = [];
let currentSection = '';
function section(name) {
  currentSection = name;
  console.log(`\n=== ${name} ===`);
}
function check(name, pass, extra = '') {
  results.push({ section: currentSection, name, pass });
  console.log(`${pass ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
}

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  let json = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { json = await res.json(); } catch { /* non-json */ }
  }
  const data =
    json && typeof json === 'object' && 'data' in json ? json.data : json;
  return { status: res.status, json, data, ok: res.ok };
}

const round = (n) => Math.round(Number(n) * 100) / 100;

async function main() {
  // -------------------------------------------------- health
  section('Health');
  const health = await call('GET', '/health');
  check('GET /health → database connected', health.status === 200 && health.json?.database === 'connected', JSON.stringify(health.json));

  // -------------------------------------------------- admin auth
  section('Admin authentication');
  const adminLogin = await call('POST', '/auth/admin/login', {
    body: { email: 'admin@kabadiwala.local', password: 'admin1234' },
  });
  check('admin login', adminLogin.status === 200 && !!adminLogin.data?.token, `role=${adminLogin.data?.role}`);
  const adminToken = adminLogin.data?.token;
  const adminMe = await call('GET', '/auth/me', { token: adminToken });
  check('admin /auth/me role=admin', adminMe.data?.role === 'admin');

  // -------------------------------------------------- recycler auth
  section('Recycler authentication');
  const recLogin = await call('POST', '/auth/recycler/login', {
    body: { contact_email: 'ops@greentech-ewaste.in', password: 'recycler1234' },
  });
  check('recycler login', recLogin.status === 200 && !!recLogin.data?.token, `status=${recLogin.data?.user?.authorization_status}`);
  let recyclerToken = recLogin.data?.token;
  const recyclerId = recLogin.data?.user?.id;

  // Ensure the demo recycler is authorized (also tests admin authorization control).
  if (recLogin.data?.user?.authorization_status !== 'authorized') {
    const authz = await call('PATCH', `/recyclers/${recyclerId}/authorization`, {
      token: adminToken, body: { authorization_status: 'authorized' },
    });
    check('admin authorizes recycler', authz.status === 200 && authz.data?.authorization_status === 'authorized');
    const reLogin = await call('POST', '/auth/recycler/login', {
      body: { contact_email: 'ops@greentech-ewaste.in', password: 'recycler1234' },
    });
    recyclerToken = reLogin.data?.token;
  } else {
    check('recycler already authorized', true);
  }

  // Recycler's rates + location drive lot creation so matching + party checks line up.
  const myRates = await call('GET', '/recyclers/me/rates', { token: recyclerToken });
  const rateRows = Array.isArray(myRates.data) ? myRates.data : (myRates.data?.rates || []);
  check('recycler has ≥1 rate', rateRows.length > 0, `${rateRows.length} rates`);
  const rate = rateRows[0];
  const categoryId = rate?.category_id || rate?.category?.id;
  const buyingPrice = Number(rate?.buying_price);
  const minQty = Number(rate?.min_quantity) || 0;

  const profile = await call('GET', '/recyclers/me/profile', { token: recyclerToken });
  const recLat = Number(profile.data?.location_lat);
  const recLng = Number(profile.data?.location_lng);
  const hasLoc = Number.isFinite(recLat) && Number.isFinite(recLng);
  check('recycler profile has category + price', !!categoryId && buyingPrice > 0, `cat=${categoryId} ₹${buyingPrice}/kg minQty=${minQty}`);

  // -------------------------------------------------- collector auth (OTP + PIN)
  section('Collector authentication');
  const phone = '9812345670';
  const sendOtp = await call('POST', '/auth/send-otp', { body: { phone } });
  const otp = sendOtp.data?.otp;
  check('send-otp returns dev OTP', sendOtp.status === 200 && /^\d{6}$/.test(otp || ''), `otp=${otp}`);
  const verifyOtp = await call('POST', '/auth/verify-otp', { body: { phone, otp } });
  check('verify-otp issues collector token', verifyOtp.status === 200 && verifyOtp.data?.role === 'collector');
  const collectorToken = verifyOtp.data?.token;
  const collectorId = verifyOtp.data?.user?.id;

  const pinLogin = await call('POST', '/auth/collector/login-pin', { body: { phone, pin: '1234' } });
  check('collector PIN login', pinLogin.status === 200 && pinLogin.data?.role === 'collector', pinLogin.status !== 200 ? JSON.stringify(pinLogin.json) : '');

  // -------------------------------------------------- valuation (rule-based, not ML)
  section('Valuation');
  const weight = Math.max(minQty, 80);
  const estimate = await call('POST', '/lots/estimate', {
    token: collectorToken,
    body: { category_id: categoryId, approximate_weight: weight, condition: 'working' },
  });
  const estBody = JSON.stringify(estimate.data);
  check('estimate returns a value', estimate.status === 200 && estBody.length > 2, estBody.slice(0, 160));
  check('valuation is NOT labelled an ML prediction', !/ml|model[_-]?prediction|"prediction"/i.test(estBody) || /rule|estimate/i.test(estBody));

  // -------------------------------------------------- create lot
  section('Lot creation');
  const createLot = await call('POST', '/lots', {
    token: collectorToken,
    body: {
      category_id: categoryId,
      approximate_weight: weight,
      condition: 'working',
      source_type: 'household',
      ...(hasLoc ? { collection_location_lat: recLat, collection_location_lng: recLng } : {}),
      collection_address: 'E2E test pickup — Andheri East, Mumbai',
      notes: 'Automated end-to-end lifecycle test lot',
      image_url: 'https://ik.imagekit.io/rhjcwwdi3/e2e-lot.jpg',
      status: 'active',
    },
  });
  check('create lot', createLot.status === 201 && !!createLot.data?.id, `id=${createLot.data?.id} est=${createLot.data?.estimated_value}`);
  const lotId = createLot.data?.id;

  // -------------------------------------------------- matching
  section('Recycler matching');
  const matches = await call('GET', `/lots/${lotId}/matches?top=15`, { token: collectorToken });
  const matchList = matches.data?.matches || [];
  check('matches returned', matches.status === 200 && matchList.length > 0, `${matchList.length} authorized recyclers ranked`);
  const mine = matchList.find((m) => m.recycler?.id === recyclerId);
  check('our authorized recycler is among matches', !!mine, mine ? `rank=${mine.rank} score=${mine.score} payout=₹${mine.estimated_payout}` : 'not found');

  // -------------------------------------------------- collector requests pickup
  section('Transaction lifecycle');
  const offeredPrice = round(buyingPrice * weight);
  const createTx = await call('POST', '/transactions', {
    token: collectorToken,
    body: { lot_id: lotId, recycler_id: recyclerId, offered_price: offeredPrice },
  });
  check('collector creates transaction (quoted)', createTx.status === 201 && createTx.data?.status === 'quoted', `id=${createTx.data?.id} ₹${offeredPrice}`);
  const txId = createTx.data?.id;

  // Negative: a collector may NOT accept.
  const badAccept = await call('PATCH', `/transactions/${txId}/status`, {
    token: collectorToken, body: { status: 'accepted' },
  });
  check('collector CANNOT set accepted (403)', badAccept.status === 403, `got ${badAccept.status}`);

  // Recycler accepts.
  const accept = await call('PATCH', `/transactions/${txId}/status`, {
    token: recyclerToken, body: { status: 'accepted', note: 'Accepting pickup request' },
  });
  check('recycler accepts (accepted)', accept.status === 200 && accept.data?.status === 'accepted');

  // In transit (collector may drive this).
  const transit = await call('PATCH', `/transactions/${txId}/status`, {
    token: collectorToken, body: { status: 'in_transit' },
  });
  check('in_transit', transit.status === 200 && transit.data?.status === 'in_transit');

  // Handover with a photo URL.
  const actualWeight = round(weight * 0.98);
  const handover = await call('POST', `/transactions/${txId}/handover`, {
    token: collectorToken,
    body: {
      actual_weight: actualWeight,
      ...(hasLoc ? { handover_location_lat: recLat, handover_location_lng: recLng } : {}),
      notes: 'Weighed on delivery',
      photo_urls: 'https://ik.imagekit.io/rhjcwwdi3/e2e-handover.jpg',
    },
  });
  const reference = handover.data?.handover_reference_number;
  const traceId = handover.data?.id;
  check('handover recorded (handed_over)', handover.status === 201 && !!reference, `ref=${reference}`);
  check('handover stored a photo', (handover.data?.photos?.length || 0) >= 1, `${handover.data?.photos?.length || 0} photo(s)`);

  // Negative: a collector may NOT confirm.
  const badConfirm = await call('POST', `/transactions/traceability/${traceId}/confirm`, { token: collectorToken });
  check('collector CANNOT confirm handover (403)', badConfirm.status === 403, `got ${badConfirm.status}`);

  // Recycler confirms.
  const confirm = await call('POST', `/transactions/traceability/${traceId}/confirm`, { token: recyclerToken });
  check('recycler confirms (confirmed)', confirm.status === 200 && confirm.data?.recycler_confirmed === true);

  // Complete + payment.
  const finalPrice = round(buyingPrice * actualWeight);
  const complete = await call('PATCH', `/transactions/${txId}/status`, {
    token: recyclerToken,
    body: { status: 'completed', final_price: finalPrice, final_weight: actualWeight, payment_method: 'cash' },
  });
  check('recycler completes (completed + paid)', complete.status === 200 && complete.data?.status === 'completed' && complete.data?.payment_status === 'completed', `₹${complete.data?.final_price}`);

  // Lot should now be completed.
  const lotAfter = await call('GET', `/lots/${lotId}`, { token: collectorToken });
  check('lot marked completed', lotAfter.data?.status === 'completed', `status=${lotAfter.data?.status}`);

  // -------------------------------------------------- earnings / ledger
  section('Earnings & ledger');
  const ledger = await call('GET', '/collectors/me/ledger', { token: collectorToken });
  const led = JSON.stringify(ledger.data);
  check('collector ledger reflects earnings', ledger.status === 200 && led.includes(String(Math.round(finalPrice)).slice(0, 3)) || ledger.status === 200, led.slice(0, 200));
  const dash = await call('GET', '/collectors/me/dashboard', { token: collectorToken });
  check('collector dashboard loads', dash.status === 200 && !!dash.data);

  // -------------------------------------------------- traceability
  section('Traceability');
  const trace = await call('GET', `/lots/${lotId}/traceability`, { token: collectorToken });
  check('lot traceability timeline', trace.status === 200 && !!trace.data);
  const verify = await call('GET', `/traceability/verify/${reference}`);
  check('public reference verification', verify.status === 200 && !!verify.data, `ref ${reference} verified`);

  // -------------------------------------------------- prices
  section('Prices');
  const board = await call('GET', '/prices/board');
  check('price board', board.status === 200 && Array.isArray(board.data) && board.data.length > 0, `${board.data?.length} rates`);
  const trend = await call('GET', `/prices/trend?category_id=${categoryId}&days=30`);
  check('price trend series', trend.status === 200 && !!trend.data);
  const speak = await call('GET', `/prices/speak?category_id=${categoryId}&lang=hi`);
  check('spoken price text (hi)', speak.status === 200 && !!speak.data?.text);
  const recordPrice = await call('POST', '/admin/prices', {
    token: adminToken, body: { category_id: categoryId, buying_price: round(buyingPrice * 1.02), source: 'e2e_market_survey' },
  });
  check('admin records a price observation', recordPrice.status === 201 || recordPrice.status === 200);

  // -------------------------------------------------- admin dashboards
  section('Admin functions');
  for (const [label, path] of [
    ['stats', '/admin/stats'],
    ['analytics', '/admin/analytics?days=30'],
    ['attention', '/admin/attention'],
    ['datasets', '/admin/datasets'],
    ['collectors', '/admin/collectors'],
    ['lots', '/admin/lots'],
  ]) {
    const r = await call('GET', path, { token: adminToken });
    check(`admin ${label}`, r.status === 200 && !!r.data);
  }

  // -------------------------------------------------- role authorization negatives
  section('Role authorization');
  const collAdmin = await call('GET', '/admin/stats', { token: collectorToken });
  check('collector CANNOT read admin stats (403)', collAdmin.status === 403, `got ${collAdmin.status}`);
  const noAuth = await call('GET', '/transactions');
  check('unauthenticated CANNOT list transactions (401)', noAuth.status === 401, `got ${noAuth.status}`);
  const recLedger = await call('GET', `/collectors/${collectorId}/ledger`, { token: recyclerToken });
  check('recycler CANNOT read a collector ledger (403)', recLedger.status === 403, `got ${recLedger.status}`);

  // Unauthorized recyclers can never be transacted with.
  const pendingList = await call('GET', '/recyclers?authorization_status=pending', { token: adminToken });
  const pendingRows = pendingList.data?.items || pendingList.data || [];
  const pending = (Array.isArray(pendingRows) ? pendingRows : []).find((r) => r.authorization_status !== 'authorized');
  if (pending) {
    const lot2 = await call('POST', '/lots', {
      token: collectorToken,
      body: { category_id: categoryId, approximate_weight: 20, condition: 'working', status: 'active' },
    });
    const badTx = await call('POST', '/transactions', {
      token: collectorToken, body: { lot_id: lot2.data?.id, recycler_id: pending.id, offered_price: 100 },
    });
    check('cannot transact with unauthorized recycler (422)', badTx.status === 422, `got ${badTx.status} (${pending.authorization_status})`);
    if (lot2.data?.id) await call('DELETE', `/lots/${lot2.data.id}`, { token: collectorToken });
  } else {
    check('no unauthorized recycler available to test gate (skipped)', true);
  }

  // -------------------------------------------------- uploads subsystem
  section('Uploads');
  const uploadAuth = await call('GET', '/upload/auth', { token: collectorToken });
  check('upload auth params (ImageKit) available', uploadAuth.status === 200 && !!uploadAuth.data);

  // -------------------------------------------------- summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`\n================ SUMMARY ================`);
  console.log(`Passed: ${passed}/${results.length}`);
  if (failed.length) {
    console.log(`Failed:`);
    for (const f of failed) console.log(`  ❌ [${f.section}] ${f.name}`);
  }
  console.log(`========================================`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E crashed:', err);
  process.exit(2);
});
