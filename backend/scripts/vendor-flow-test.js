/**
 * Phase 3 flow test — vendor request → admin approve → vendor login, and reject path.
 * Requires server running on :5000.
 * Run with: node scripts/vendor-flow-test.js
 */
const BASE = 'http://localhost:5000';

let passed = 0;
let failed = 0;

function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}  ${extra}`); }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

(async () => {
  const stamp = Date.now();
  const vendorEmail = `grill_${stamp}@test.com`;
  const rejectEmail = `cafe_${stamp}@test.com`;

  console.log('=== 1. PUBLIC: CREATE REQUESTS ===');

  let r = await api('POST', '/api/vendor-requests', {
    body: { email: vendorEmail, restaurantName: 'Campus Grill House', description: 'Burgers and shawarma near the science block', phone: '08099999999' },
  });
  check('create request: 201 + pending', r.status === 201 && r.data.request && r.data.request.status === 'pending');
  const req1 = r.data.request;
  const req1Id = req1.id;

  r = await api('POST', '/api/vendor-requests', {
    body: { email: rejectEmail, restaurantName: 'Campus Café', description: 'Coffee and pastries' },
  });
  check('create 2nd request: 201', r.status === 201);
  const req2Id = r.data.request.id;

  r = await api('POST', '/api/vendor-requests', {
    body: { email: vendorEmail, restaurantName: 'Duplicate' },
  });
  check('duplicate request: 409', r.status === 409);

  r = await api('POST', '/api/vendor-requests', {
    body: { email: 'bad-email', restaurantName: 'X' },
  });
  check('invalid request body: 422', r.status === 422);

  console.log('=== 2. ADMIN GUARDS ===');

  r = await api('GET', '/api/admin/vendor-requests');
  check('list without token: 401', r.status === 401);

  const cust = await api('POST', '/api/auth/login', { body: { email: 'customer@test.com', password: 'password123' } });
  r = await api('GET', '/api/admin/vendor-requests', { token: cust.data.token });
  check('list as customer: 403', r.status === 403);

  const admin = await api('POST', '/api/auth/login', { body: { email: 'admin@campus.com', password: 'admin123' } });
  check('admin login: 200', admin.status === 200 && admin.data.token);
  const adminToken = admin.data.token;

  r = await api('GET', '/api/admin/vendor-requests', { token: adminToken });
  check('list as admin: 200 with requests', r.status === 200 && Array.isArray(r.data.requests) && r.data.requests.length >= 2);

  r = await api('GET', `/api/admin/vendor-requests?status=pending`, { token: adminToken });
  check('filter by status=pending: all pending', r.status === 200 && r.data.requests.every((x) => x.status === 'pending'));

  console.log('=== 3. APPROVE ===');

  r = await api('PUT', `/api/admin/vendor-requests/${req1Id}`, {
    token: adminToken,
    body: { action: 'approve', admin_comment: 'Welcome aboard!' },
  });
  check('approve: 200 + message', r.status === 200 && /approved/i.test(r.data.message));
  check('approve: devPassword returned (email unconfigured)', Boolean(r.data.devPassword));
  const vendorPassword = r.data.devPassword;

  r = await api('PUT', `/api/admin/vendor-requests/${req1Id}`, {
    token: adminToken,
    body: { action: 'approve' },
  });
  check('re-approve already approved: 400', r.status === 400);

  console.log('=== 4. VENDOR LOGIN WITH EMAILED PASSWORD ===');

  r = await api('POST', '/api/auth/login', { body: { email: vendorEmail, password: vendorPassword } });
  check('vendor login with generated password: 200', r.status === 200 && r.data.token);
  check('vendor role = restaurant_owner', r.data.user && r.data.user.role === 'restaurant_owner');
  const vendorToken = r.data.token;

  r = await api('GET', '/api/auth/me', { token: vendorToken });
  check('vendor /me works', r.status === 200 && r.data.user.email === vendorEmail);

  console.log('=== 5. REJECT ===');

  r = await api('PUT', `/api/admin/vendor-requests/${req2Id}`, {
    token: adminToken,
    body: { action: 'reject' },
  });
  check('reject without comment: 400', r.status === 400);

  r = await api('PUT', `/api/admin/vendor-requests/${req2Id}`, {
    token: adminToken,
    body: { action: 'reject', admin_comment: 'Insufficient documentation.' },
  });
  check('reject with comment: 200', r.status === 200 && r.data.request.status === 'rejected');
  check('rejected admin_comment stored', r.data.request.admin_comment === 'Insufficient documentation.');

  r = await api('PUT', `/api/admin/vendor-requests/999999`, {
    token: adminToken,
    body: { action: 'approve' },
  });
  check('approve nonexistent request: 404', r.status === 404);

  r = await api('PUT', `/api/admin/vendor-requests/${req1Id}`, {
    token: adminToken,
    body: { action: 'hack' },
  });
  check('bad action value rejected (400 or 422)', r.status === 400 || r.status === 422);

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`\nVendor account created for testing: ${vendorEmail} / ${vendorPassword}`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Test runner error:', e.message);
  process.exit(1);
});