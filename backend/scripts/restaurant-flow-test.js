/**
 * Phase 4 flow test — restaurant & menu CRUD with ownership enforcement
 * AND the strict one-restaurant-per-vendor rule.
 * Requires server on :5000. Creates its own vendor via the real approval flow.
 * Run with: node scripts/restaurant-flow-test.js
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

/* Multipart helper for menu item uploads (STRICT: >= 2 images). */
function imgBlob() {
  // Minimal valid 1x1 PNG.
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  return new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' });
}

async function apiMulti(method, path, { token, fields = {}, images = [] } = {}) {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, String(v)));
  images.forEach((img, i) => form.append('images', img, `photo-${i}.png`));
  const res = await fetch(BASE + path, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

(async () => {
  const stamp = Date.now();
  const vendorEmail = `vendor_${stamp}@test.com`;

  /* ---- Create vendor through the real approve flow ---- */
  let r = await api('POST', '/api/vendor-requests', {
    body: { email: vendorEmail, restaurantName: 'Tasty Grill House', description: 'Grilled chicken and rice', phone: '08011112222' },
  });
  check('vendor request created', r.status === 201);
  const reqId = r.data.request.id;

  const admin = await api('POST', '/api/auth/login', { body: { email: 'admin@campus.com', password: 'admin123' } });
  r = await api('PUT', `/api/admin/vendor-requests/${reqId}`, {
    token: admin.data.token,
    body: { action: 'approve' },
  });
  check('admin approved vendor', r.status === 200);
  const vendorPassword = r.data.devPassword;

  const vendor = await api('POST', '/api/auth/login', { body: { email: vendorEmail, password: vendorPassword } });
  check('vendor login', vendor.status === 200);
  const vt = vendor.data.token;

  const cust = await api('POST', '/api/auth/login', { body: { email: 'customer@test.com', password: 'password123' } });
  const ct = cust.data.token;

  /* ---- The approval already created restaurant #1 ("Tasty Grill House") ---- */
  r = await api('GET', '/api/vendor/restaurants', { token: vt });
  check('vendor sees their restaurant', r.status === 200 && r.data.restaurants.length === 1);
  const rest1 = r.data.restaurants[0];
  check('restaurant active + linked', rest1.is_active === 1 && rest1.name === 'Tasty Grill House');

  console.log('=== 1. PUBLIC LIST / FILTERS ===');

  r = await api('GET', '/api/restaurants');
  check('public list returns active restaurants', r.status === 200 && Array.isArray(r.data.restaurants) && r.data.restaurants.some((x) => x.id === rest1.id));

  r = await api('GET', '/api/restaurants?cuisine_type=Italian');
  check('filter by cuisine_type (none match) -> empty', r.status === 200 && r.data.restaurants.length === 0);

  r = await api('GET', '/api/restaurants?cuisine=Italian');
  check('filter by cuisine alias (none match) -> empty', r.status === 200 && r.data.restaurants.length === 0);

  r = await api('GET', '/api/restaurants?search=grill');
  check('search by name finds Tasty Grill', r.status === 200 && r.data.restaurants.some((x) => x.id === rest1.id));

  r = await api('GET', `/api/restaurants/${rest1.id}`);
  check('public detail + menu array', r.status === 200 && Array.isArray(r.data.menu) && r.data.restaurant.name === 'Tasty Grill House');

  console.log('=== 2. CREATE RESTAURANT (strict one-per-vendor rule) ===');

  // The approval flow already created restaurant #1 for this vendor.
  r = await api('POST', '/api/restaurants', {
    token: vt,
    body: { name: 'Campus Pizza Hub', description: 'Wood-fired pizza', cuisine_type: 'Italian', address: 'Block C', phone: '08022223333' },
  });
  check('second restaurant blocked: 409', r.status === 409);

  r = await api('GET', '/api/vendor/restaurants', { token: vt });
  check('vendor still has exactly one restaurant', r.status === 200 && r.data.restaurants.length === 1);

  // A restaurant_owner with NO restaurant yet can create their first one.
  const promo = await api('POST', '/api/auth/register', {
    body: { email: `promo_${stamp}@test.com`, password: 'password123', full_name: 'Promo Owner', phone: '08033334444', role: 'customer' },
  });
  check('promoted-owner candidate registered', promo.status === 201 || promo.status === 409);
  const promoUser = promo.data.user || promo.data;
  r = await api('PUT', `/api/admin/users/${promoUser.id}/role`, { token: admin.data.token, body: { role: 'restaurant_owner' } });
  check('admin promotes user to restaurant_owner', r.status === 200 && r.data.user.role === 'restaurant_owner');

  const promoLogin = await api('POST', '/api/auth/login', { body: { email: `promo_${stamp}@test.com`, password: 'password123' } });
  check('promoted owner logs in', promoLogin.status === 200);
  const pt = promoLogin.data.token;

  r = await api('POST', '/api/restaurants', {
    token: pt,
    body: { name: 'Promo Pizzeria', cuisine_type: 'Italian', address: 'Block D', phone: '08044445555' },
  });
  check('first restaurant for new owner: 201', r.status === 201 && r.data.restaurant);
  const rest2 = r.data.restaurant;
  check('owner_id = promoted user id', rest2.owner_id === promoUser.id);

  r = await api('POST', '/api/restaurants', {
    token: pt,
    body: { name: 'Promo Burger Joint', cuisine_type: 'Fast Food' },
  });
  check('their second restaurant blocked: 409', r.status === 409);

  r = await api('POST', '/api/restaurants', { token: ct, body: { name: 'Nope' } });
  check('customer cannot create restaurant: 403', r.status === 403);

  r = await api('POST', '/api/restaurants', { token: vt, body: { name: '' } });
  check('create without name: 422', r.status === 422);

  console.log('=== 3. UPDATE / SOFT DELETE (ownership) ===');

  r = await api('PUT', `/api/restaurants/${rest1.id}`, {
    token: vt,
    body: { name: 'Tasty Grill House 2.0', description: 'Now with shawarma', cuisine_type: 'Fast Food', address: null, phone: '08011112222', logo_url: null },
  });
  check('vendor updates own restaurant', r.status === 200 && r.data.restaurant.name === 'Tasty Grill House 2.0' && r.data.restaurant.cuisine_type === 'Fast Food');

  r = await api('PUT', `/api/restaurants/${rest1.id}`, { token: ct, body: { name: 'Hacked' } });
  check('customer cannot update: 403', r.status === 403);

  r = await api('DELETE', `/api/restaurants/${rest1.id}`, { token: ct });
  check('customer cannot delete: 403', r.status === 403);

  r = await api('DELETE', `/api/restaurants/${rest2.id}`, { token: pt });
  check('owner soft-deletes their restaurant', r.status === 200 && r.data.restaurant.is_active === 0);

  // STRICT: even a soft-deleted restaurant still counts — no new one allowed.
  r = await api('POST', '/api/restaurants', {
    token: pt,
    body: { name: 'Promo Reborn', cuisine_type: 'Fast Food' },
  });
  check('blocked again after soft-delete (still 409)', r.status === 409);

  r = await api('GET', '/api/restaurants');
  check('deleted restaurant hidden from public list', !r.data.restaurants.some((x) => x.id === rest2.id));

  r = await api('GET', `/api/restaurants/${rest2.id}`);
  check('deleted restaurant 404 for public', r.status === 404);

  r = await api('GET', `/api/restaurants/${rest2.id}`, { token: pt });
  check('owner still sees their inactive restaurant', r.status === 200 && r.data.restaurant.is_active === 0);

  console.log('=== 4. MENU ITEMS (photos required — at least 2) ===');

  // STRICT rule: 0 images -> 422
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { name: 'No Photos', price: '10', category: 'Mains' },
    images: [],
  });
  check('create with 0 images: 422', r.status === 422);

  // STRICT rule: 1 image -> 422
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { name: 'One Photo', price: '10' },
    images: [imgBlob()],
  });
  check('create with 1 image: 422', r.status === 422);

  // 2 images -> 201
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { name: 'Grilled Chicken', price: '12.5', category: 'Mains', description: 'Half chicken + rice' },
    images: [imgBlob(), imgBlob()],
  });
  check('create with 2 images: 201', r.status === 201 && r.data.item);
  const item1 = r.data.item;
  check('item has exactly 2 images + cover synced', item1.images.length === 2 && item1.image_url === item1.images[0] && item1.images[0].startsWith('/uploads/'));

  // Second item (also 2 images)
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { name: 'Chapman', price: '3.0', category: 'Drinks', is_available: 'true' },
    images: [imgBlob(), imgBlob()],
  });
  const item2 = r.data.item;
  check('second item also 2 images', r.status === 201 && item2.images.length === 2);

  // Valid images but bad price -> 422 (and uploaded files are cleaned up)
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { name: 'Bad Price', price: '-5' },
    images: [imgBlob(), imgBlob()],
  });
  check('negative price: 422', r.status === 422);

  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: ct,
    fields: { name: 'Sneaky', price: '1' },
    images: [imgBlob(), imgBlob()],
  });
  check('customer cannot create item: 403', r.status === 403);

  r = await api('GET', `/api/restaurants/${rest1.id}/menu`);
  check('public menu lists 2 items, each with >= 2 images', r.status === 200 && r.data.menu.length === 2 && r.data.menu.every((m) => m.images.length >= 2));

  // Update replacing the image set with 3 photos.
  r = await apiMulti('PUT', `/api/menu/${item1.id}`, {
    token: vt,
    fields: { name: 'Grilled Chicken & Chips', price: '14.0', category: 'Mains', is_available: 'true' },
    images: [imgBlob(), imgBlob(), imgBlob()],
  });
  check('update replaces images with 3 (price 14.0)', r.status === 200 && r.data.item.images.length === 3 && Number(r.data.item.price) === 14 && r.data.item.image_url === r.data.item.images[0]);

  // JSON update without files keeps the existing image set.
  r = await api('PUT', `/api/menu/${item1.id}`, {
    token: vt,
    body: { name: 'Grilled Chicken & Chips', price: 15, category: 'Mains', description: null, is_available: true },
  });
  check('update without files keeps 3 images', r.status === 200 && r.data.item.images.length === 3 && Number(r.data.item.price) === 15);

  // Replacing with only 1 image -> 422 (invariant never drops below 2).
  r = await apiMulti('PUT', `/api/menu/${item1.id}`, {
    token: vt,
    fields: { price: '16' },
    images: [imgBlob()],
  });
  check('replace with 1 image: 422', r.status === 422);

  r = await api('PUT', `/api/menu/${item1.id}`, { token: ct, body: { name: 'X', price: 1 } });
  check('customer cannot update item: 403', r.status === 403);

  r = await api('DELETE', `/api/menu/${item1.id}`, { token: ct });
  check('customer cannot delete item: 403', r.status === 403);

  r = await api('DELETE', `/api/menu/${item1.id}`, { token: vt });
  check('vendor deletes item', r.status === 200);

  r = await api('GET', `/api/restaurants/${rest1.id}/menu`);
  check('menu now has 1 item', r.data.menu.length === 1);

  console.log('=== 5. ALL FOODS (public /api/menu-items) ===');

  r = await api('GET', '/api/menu-items');
  check('all foods: 200 with items array', r.status === 200 && Array.isArray(r.data.items) && r.data.items.length >= 1);
  check('items carry images + restaurant info', r.data.items.every((i) => Array.isArray(i.images) && i.images.length >= 2 && i.restaurant_name && i.restaurant_id));

  r = await api('GET', '/api/menu-items?category=Drinks');
  check('category filter works', r.status === 200 && r.data.items.length === 1 && r.data.items[0].category === 'Drinks');

  r = await api('GET', '/api/menu-items?search=chap');
  check('search finds chapman', r.status === 200 && r.data.items.length === 1 && /chap/i.test(r.data.items[0].name));

  r = await api('GET', `/api/menu-items?restaurantId=${rest1.id}`);
  check('restaurant filter works', r.status === 200 && r.data.items.length >= 1 && r.data.items.every((i) => i.restaurant_id === rest1.id));

  r = await api('PUT', `/api/menu/${item2.id}`, {
    token: vt,
    body: { name: 'Chapman', price: 3.0, category: 'Drinks', description: null, is_available: false },
  });
  check('toggled item unavailable', r.status === 200 && r.data.item.is_available === 0);
  r = await api('GET', '/api/menu-items');
  check('unavailable item hidden from all-foods', r.status === 200 && !r.data.items.some((i) => i.id === item2.id));

  r = await api('PUT', `/api/menu/${item2.id}`, {
    token: vt,
    body: { name: 'Chapman', price: 3.0, category: 'Drinks', description: null, is_available: true },
  });
  check('toggled back available', r.status === 200);

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`Vendor (test): ${vendorEmail} / ${vendorPassword}`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Test runner error:', e.message);
  process.exit(1);
});