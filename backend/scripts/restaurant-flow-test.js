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
  Object.entries(fields).forEach(([k, v]) => {
    // Array values append as repeated fields (e.g. protein_ids).
    if (Array.isArray(v)) v.forEach((x) => form.append(k, String(x)));
    else form.append(k, String(v));
  });
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

  console.log('=== 3.5 FOODS & PROTEINS (restaurant setup) ===');

  // Foods
  r = await api('GET', `/api/restaurants/${rest1.id}/foods`, { token: vt });
  check('foods list starts empty', r.status === 200 && r.data.foods.length === 0);

  r = await api('POST', `/api/restaurants/${rest1.id}/foods`, { token: vt, body: { name: 'Grilled Chicken' } });
  check('add food: 201', r.status === 201 && r.data.food.name === 'Grilled Chicken');
  const food1 = r.data.food;

  r = await api('POST', `/api/restaurants/${rest1.id}/foods`, { token: vt, body: { name: 'Chapman' } });
  check('add second food: 201', r.status === 201);
  const food2 = r.data.food;

  r = await api('POST', `/api/restaurants/${rest1.id}/foods`, { token: vt, body: { name: 'Grilled Chicken' } });
  check('duplicate food blocked: 409', r.status === 409);

  r = await api('POST', `/api/restaurants/${rest1.id}/foods`, { token: ct, body: { name: 'X' } });
  check('customer cannot add food: 403', r.status === 403);

  r = await api('POST', `/api/restaurants/${rest1.id}/foods`, { token: vt, body: { name: '' } });
  check('add food without name: 422', r.status === 422);

  // Proteins + primary rules
  r = await api('GET', `/api/restaurants/${rest1.id}/proteins`, { token: vt });
  check('proteins list starts empty', r.status === 200 && r.data.proteins.length === 0);

  r = await api('POST', `/api/restaurants/${rest1.id}/proteins`, { token: vt, body: { name: 'Goat Meat', price: 2.5, is_primary: true } });
  check('first protein created primary', r.status === 201 && r.data.protein.is_primary === 1);
  const p1 = r.data.protein;

  r = await api('POST', `/api/restaurants/${rest1.id}/proteins`, { token: vt, body: { name: 'Beef', price: 3.0 } });
  check('second protein not primary', r.status === 201 && r.data.protein.is_primary === 0);
  const p2 = r.data.protein;

  r = await api('POST', `/api/restaurants/${rest1.id}/proteins`, { token: vt, body: { name: 'Chicken', price: 2.0 } });
  check('third protein created', r.status === 201);
  const p3 = r.data.protein;

  r = await api('POST', `/api/restaurants/${rest1.id}/proteins`, { token: vt, body: { name: 'Beef', price: 9 } });
  check('duplicate protein blocked: 409', r.status === 409);

  r = await api('POST', `/api/restaurants/${rest1.id}/proteins`, { token: vt, body: { name: 'Fish', price: -1 } });
  check('negative protein price: 422', r.status === 422);

  r = await api('POST', `/api/restaurants/${rest1.id}/proteins`, { token: ct, body: { name: 'X', price: 1 } });
  check('customer cannot add protein: 403', r.status === 403);

  // Primary switch: marking Beef primary clears Goat Meat.
  r = await api('PUT', `/api/proteins/${p2.id}`, { token: vt, body: { is_primary: true } });
  check('set Beef primary: 200', r.status === 200 && r.data.protein.is_primary === 1);

  r = await api('GET', `/api/restaurants/${rest1.id}/proteins`, { token: vt });
  check('exactly one primary after switch',
    r.data.proteins.filter((x) => x.is_primary).length === 1 && r.data.proteins.find((x) => x.id === p1.id).is_primary === 0);

  // Unsetting the current primary is rejected — a restaurant needs one.
  r = await api('PUT', `/api/proteins/${p2.id}`, { token: vt, body: { is_primary: false } });
  check('unsetting current primary: 400', r.status === 400);

  r = await api('PUT', `/api/proteins/${p3.id}`, { token: vt, body: { price: 2.5 } });
  check('edit protein price: 200', r.status === 200 && Number(r.data.protein.price) === 2.5);

  r = await api('PUT', `/api/proteins/${p3.id}`, { token: ct, body: { price: 9 } });
  check('customer cannot edit protein: 403', r.status === 403);

  // Deleting the primary auto-promotes the oldest remaining protein.
  r = await api('DELETE', `/api/proteins/${p2.id}`, { token: vt });
  check('delete primary protein: 200', r.status === 200);
  r = await api('GET', `/api/restaurants/${rest1.id}/proteins`, { token: vt });
  check('oldest remaining auto-promoted to primary',
    r.data.proteins.length === 2 && r.data.proteins.filter((x) => x.is_primary).length === 1 && r.data.proteins.find((x) => x.id === p1.id).is_primary === 1);

  r = await api('DELETE', `/api/proteins/${p1.id}`, { token: ct });
  check('customer cannot delete protein: 403', r.status === 403);

  r = await api('DELETE', `/api/foods/${food1.id}`, { token: ct });
  check('customer cannot delete food: 403', r.status === 403);

  console.log('=== 4. MENU ITEMS (food dropdown, proteins, photos >= 2) ===');

  // STRICT rule: 0 images -> 422 (valid food + proteins so only images fail)
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { food_id: food1.id, price: '10', protein_ids: [p1.id] },
    images: [],
  });
  check('create with 0 images: 422', r.status === 422);

  // STRICT rule: 1 image -> 422
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { food_id: food1.id, price: '10' },
    images: [imgBlob()],
  });
  check('create with 1 image: 422', r.status === 422);

  // 2 images -> 201; name comes from the food; proteins attach.
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { food_id: food1.id, price: '12.5', protein_ids: [p1.id, p3.id], description: 'Half chicken + rice' },
    images: [imgBlob(), imgBlob()],
  });
  check('create with 2 images: 201', r.status === 201 && r.data.item);
  const item1 = r.data.item;
  check('item name from food + proteins attached',
    item1.name === 'Grilled Chicken' && item1.food_id === food1.id && item1.proteins.length === 2 && item1.proteins.some((x) => x.is_primary));
  check('item has exactly 2 images + cover synced', item1.images.length === 2 && item1.image_url === item1.images[0] && item1.images[0].startsWith('/uploads/'));

  // Second item (also 2 images)
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { food_id: food2.id, price: '3.0', protein_ids: [p3.id], is_available: 'true' },
    images: [imgBlob(), imgBlob()],
  });
  const item2 = r.data.item;
  check('second item also 2 images', r.status === 201 && item2.images.length === 2);

  // Valid images but bad price -> 422 (and uploaded files are cleaned up)
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { food_id: food1.id, price: '-5' },
    images: [imgBlob(), imgBlob()],
  });
  check('negative price: 422', r.status === 422);

  // No food selected -> 422
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { price: '5' },
    images: [imgBlob(), imgBlob()],
  });
  check('missing food_id: 422', r.status === 422);

  // Protein not owned by this restaurant -> 422
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { food_id: food1.id, price: '5', protein_ids: [99999] },
    images: [imgBlob(), imgBlob()],
  });
  check('invalid protein_id: 422', r.status === 422);

  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: ct,
    fields: { food_id: food1.id, price: '1' },
    images: [imgBlob(), imgBlob()],
  });
  check('customer cannot create item: 403', r.status === 403);

  r = await api('GET', `/api/restaurants/${rest1.id}/menu`);
  check('public menu lists 2 items with proteins', r.status === 200 && r.data.menu.length === 2 && r.data.menu.every((m) => m.images.length >= 2 && Array.isArray(m.proteins)));

  // Update replacing the image set with 3 photos + proteins replaced with 1.
  r = await apiMulti('PUT', `/api/menu/${item1.id}`, {
    token: vt,
    fields: { food_id: food1.id, price: '14.0', protein_ids: [p1.id], is_available: 'true' },
    images: [imgBlob(), imgBlob(), imgBlob()],
  });
  check('update replaces images with 3 (price 14.0)', r.status === 200 && r.data.item.images.length === 3 && Number(r.data.item.price) === 14 && r.data.item.image_url === r.data.item.images[0]);
  check('update replaces proteins (1 left)', r.data.item.proteins.length === 1 && r.data.item.proteins[0].id === p1.id);

  // JSON update without files keeps the existing image set.
  r = await api('PUT', `/api/menu/${item1.id}`, {
    token: vt,
    body: { food_id: food1.id, price: 15, description: null, is_available: true, protein_ids: [p1.id] },
  });
  check('update without files keeps 3 images', r.status === 200 && r.data.item.images.length === 3 && Number(r.data.item.price) === 15);

  // Replacing with only 1 image -> 422 (invariant never drops below 2).
  r = await apiMulti('PUT', `/api/menu/${item1.id}`, {
    token: vt,
    fields: { price: '16' },
    images: [imgBlob()],
  });
  check('replace with 1 image: 422', r.status === 422);

  // Switching the food renames the item to the new food's name.
  r = await api('PUT', `/api/menu/${item1.id}`, {
    token: vt,
    body: { food_id: food2.id, price: 15, description: null, is_available: true },
  });
  check('switching food renames item', r.status === 200 && r.data.item.name === 'Chapman');
  r = await api('PUT', `/api/menu/${item1.id}`, {
    token: vt,
    body: { food_id: food1.id, price: 15, description: null, is_available: true },
  });
  check('switching back restores name', r.status === 200 && r.data.item.name === 'Grilled Chicken');

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
  check('items carry images + restaurant info + proteins',
    r.data.items.every((i) => Array.isArray(i.images) && i.images.length >= 2 && i.restaurant_name && i.restaurant_id && Array.isArray(i.proteins)));

  r = await api('GET', '/api/menu-items?search=chap');
  check('search finds chapman', r.status === 200 && r.data.items.length === 1 && /chap/i.test(r.data.items[0].name));

  r = await api('GET', `/api/menu-items?restaurantId=${rest1.id}`);
  check('restaurant filter works', r.status === 200 && r.data.items.length >= 1 && r.data.items.every((i) => i.restaurant_id === rest1.id));

  r = await api('PUT', `/api/menu/${item2.id}`, {
    token: vt,
    body: { food_id: food2.id, price: 3.0, description: null, is_available: false },
  });
  check('toggled item unavailable', r.status === 200 && r.data.item.is_available === 0);
  r = await api('GET', '/api/menu-items');
  check('unavailable item hidden from all-foods', r.status === 200 && !r.data.items.some((i) => i.id === item2.id));

  r = await api('PUT', `/api/menu/${item2.id}`, {
    token: vt,
    body: { food_id: food2.id, price: 3.0, description: null, is_available: true },
  });
  check('toggled back available', r.status === 200);

  // Food with no menu items left can be deleted.
  r = await api('DELETE', `/api/foods/${food1.id}`, { token: vt });
  check('delete unused food: 200', r.status === 200);
  r = await api('GET', `/api/restaurants/${rest1.id}/foods`, { token: vt });
  check('food gone from list', r.status === 200 && !r.data.foods.some((f) => f.id === food1.id));

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`Vendor (test): ${vendorEmail} / ${vendorPassword}`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Test runner error:', e.message);
  process.exit(1);
});