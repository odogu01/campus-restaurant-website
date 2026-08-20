/**
 * Phase 2 smoke test — exercises every auth endpoint (uses Node's built-in fetch).
 * Requires the server to be running on PORT 5000.
 *
 * Run with: node scripts/auth-smoke-test.js
 */
const BASE = 'http://localhost:5000';

let passed = 0;
let failed = 0;

async function check(name, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}  ${extra}`);
  }
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
  console.log('=== 1. REGISTER ===');

  // 1a. Valid registration
  let r = await api('POST', '/api/auth/register', {
    body: { full_name: 'Test Customer', email: 'customer@test.com', password: 'password123', phone: '08012345678' },
  });
  await check('register: 201 + token + user', r.status === 201 && r.data.token && r.data.user);
  await check('register: role defaults to customer', r.data.user && r.data.user.role === 'customer');
  await check('register: password_hash NOT exposed', r.data.user && !('password_hash' in r.data.user));
  const token = r.data.token;

  // 1b. Duplicate email
  r = await api('POST', '/api/auth/register', {
    body: { full_name: 'Test Customer 2', email: 'customer@test.com', password: 'password123' },
  });
  await check('register duplicate: 409', r.status === 409);

  // 1c. Invalid email
  r = await api('POST', '/api/auth/register', {
    body: { full_name: 'Bad Email', email: 'not-an-email', password: 'password123' },
  });
  await check('register bad email: 422', r.status === 422);

  // 1d. Short password
  r = await api('POST', '/api/auth/register', {
    body: { full_name: 'Short Pass', email: 'short@test.com', password: '123' },
  });
  await check('register short password: 422', r.status === 422);

  console.log('=== 2. LOGIN ===');

  // 2a. Correct credentials
  r = await api('POST', '/api/auth/login', {
    body: { email: 'customer@test.com', password: 'password123' },
  });
  await check('login: 200 + token', r.status === 200 && r.data.token);
  await check('login: returns user without hash', r.data.user && !('password_hash' in r.data.user));

  // 2b. Wrong password
  r = await api('POST', '/api/auth/login', {
    body: { email: 'customer@test.com', password: 'wrongpass' },
  });
  await check('login wrong password: 401', r.status === 401);

  // 2c. Unknown email
  r = await api('POST', '/api/auth/login', {
    body: { email: 'nobody@test.com', password: 'whatever1' },
  });
  await check('login unknown email: 401', r.status === 401);

  console.log('=== 3. /ME (protected) ===');

  // 3a. With valid token
  r = await api('GET', '/api/auth/me', { token });
  await check('me: 200 + user', r.status === 200 && r.data.user && r.data.user.email === 'customer@test.com');

  // 3b. Without token
  r = await api('GET', '/api/auth/me');
  await check('me without token: 401', r.status === 401);

  // 3c. Garbage token
  r = await api('GET', '/api/auth/me', { token: 'not.a.jwt' });
  await check('me bad token: 401', r.status === 401);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Test runner error:', e.message);
  process.exit(1);
});