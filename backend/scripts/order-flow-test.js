/**
 * Order flow test — NEW lifecycle (product decision):
 *   pending -> (vendor ACCEPTS) preparing -> (vendor READY) ready_for_pickup
 *   -> (customer ONLY confirms) delivered -> vendor_paid = 1
 * Requires server on :5000.
 * Run with: node scripts/order-flow-test.js
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

  /* ---- Setup: vendor + restaurant + menu items ---- */
  let r = await api('POST', '/api/vendor-requests', {
    body: { email: vendorEmail, restaurantName: 'Phase5 Diner', description: 'Test diner' },
  });
  const reqId = r.data.request.id;

  const admin = await api('POST', '/api/auth/login', { body: { email: 'admin@campus.com', password: 'admin123' } });
  r = await api('PUT', `/api/admin/vendor-requests/${reqId}`, { token: admin.data.token, body: { action: 'approve' } });
  const vendorLogin = await api('POST', '/api/auth/login', { body: { email: vendorEmail, password: r.data.devPassword } });
  const vt = vendorLogin.data.token;

  r = await api('GET', '/api/vendor/restaurants', { token: vt });
  const rest1 = r.data.restaurants[0];

  // STRICT one-restaurant rule: the second restaurant needs a second vendor.
  const vendor2Email = `vendor2_${stamp}@test.com`;
  r = await api('POST', '/api/vendor-requests', {
    body: { email: vendor2Email, restaurantName: 'Other Diner', description: 'Second test diner' },
  });
  const reqId2 = r.data.request.id;
  r = await api('PUT', `/api/admin/vendor-requests/${reqId2}`, { token: admin.data.token, body: { action: 'approve' } });
  const vendor2Login = await api('POST', '/api/auth/login', { body: { email: vendor2Email, password: r.data.devPassword } });
  const vt2 = vendor2Login.data.token;
  r = await api('GET', '/api/vendor/restaurants', { token: vt2 });
  const rest2 = r.data.restaurants[0];

  // Menu items (STRICT: every item needs >= 2 uploaded images).
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { name: 'Grilled Chicken', price: '12.5', category: 'Mains' },
    images: [imgBlob(), imgBlob()],
  });
  const chicken = r.data.item;
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { name: 'Chapman', price: '3.0', category: 'Drinks' },
    images: [imgBlob(), imgBlob()],
  });
  const chapman = r.data.item;

  r = await apiMulti('POST', `/api/restaurants/${rest2.id}/menu`, {
    token: vt2,
    fields: { name: 'Pizza Slice', price: '8.0' },
    images: [imgBlob(), imgBlob()],
  });
  const pizza = r.data.item;

  const cust = await api('POST', '/api/auth/login', { body: { email: 'customer@test.com', password: 'password123' } });
  const ct = cust.data.token;
  const bob = await api('POST', '/api/auth/register', { body: { full_name: 'Bob Other', email: `bob_${stamp}@test.com`, password: 'password123' } });
  const bobt = bob.data.token;

  console.log('=== 1. PLACE ORDER (simulated payment, pending) ===');

  r = await api('POST', '/api/orders', {
    token: ct,
    body: {
      restaurantId: rest1.id,
      items: [{ menuItemId: chicken.id, quantity: 2 }, { menuItemId: chapman.id, quantity: 1 }],
      orderType: 'pickup',
      paymentMethod: 'paystack',
      specialInstructions: 'Extra spicy please',
    },
  });
  check('place order: 201', r.status === 201 && r.data.orderId);
  check('status = pending (awaits vendor acceptance)', r.data.status === 'pending');
  check('payment_status = paid (simulated)', r.data.paymentStatus === 'paid');
  check('total = 2x12.50 + 1x3.00 = 28.00', Number(r.data.totalAmount) === 28);
  check('paymentEnabled flag false', r.data.paymentEnabled === false);
  const order1 = r.data.orderId;

  r = await api('POST', '/api/orders', {
    token: ct,
    body: { restaurantId: rest1.id, items: [{ menuItemId: chicken.id, quantity: 1 }], orderType: 'delivery', paymentMethod: 'cash' },
  });
  check('delivery without address: 400', r.status === 400);

  r = await api('POST', '/api/orders', {
    token: ct,
    body: {
      restaurantId: rest1.id,
      items: [{ menuItemId: chicken.id, quantity: 1 }, { menuItemId: pizza.id, quantity: 1 }],
      orderType: 'pickup',
      paymentMethod: 'cash',
    },
  });
  check('item from another restaurant: 400', r.status === 400);

  r = await api('POST', '/api/orders', {
    token: ct,
    body: { restaurantId: rest1.id, items: [{ menuItemId: chicken.id, quantity: 0 }], orderType: 'pickup', paymentMethod: 'cash' },
  });
  check('quantity 0: 422', r.status === 422);

  r = await api('POST', '/api/orders', {
    token: vt,
    body: { restaurantId: rest1.id, items: [{ menuItemId: chicken.id, quantity: 1 }], orderType: 'pickup', paymentMethod: 'cash' },
  });
  check('vendor cannot place order: 403', r.status === 403);

  console.log('=== 2. ORDER DETAIL / LISTING ===');

  r = await api('GET', `/api/orders/${order1}`, { token: ct });
  check('customer sees own order detail', r.status === 200 && r.data.order.id === order1);
  check('detail has 2 items with subtotals', r.data.items.length === 2 && r.data.items.some((i) => Number(i.subtotal) === 25) && r.data.items.some((i) => Number(i.subtotal) === 3));
  check('detail total = 28.00', Number(r.data.order.total_amount) === 28);
  check('vendor NOT paid yet (vendor_paid = 0)', r.data.order.vendor_paid === 0);

  r = await api('GET', `/api/orders/${order1}`, { token: vt });
  check('vendor sees order for their restaurant', r.status === 200 && r.data.order.customer_email === 'customer@test.com');

  r = await api('GET', `/api/orders/${order1}`, { token: bobt });
  check('other customer cannot view: 403', r.status === 403);

  r = await api('GET', '/api/orders', { token: ct });
  check('customer lists own orders (latest first, with items)', r.status === 200 && r.data.orders.length >= 1 && r.data.orders[0].id === order1 && r.data.orders[0].items.length === 2);

  r = await api('GET', '/api/vendor/orders', { token: vt });
  check('vendor sees 1 order', r.status === 200 && r.data.orders.length === 1);
  check('vendor order has customer name', r.data.orders[0].customer_name === 'Demo Customer');
  check('vendor order exposes vendor_paid flag', typeof r.data.orders[0].vendor_paid === 'number');

  console.log('=== 3. STATUS TRANSITIONS (role-based) ===');

  r = await api('PUT', `/api/orders/${order1}/status`, { token: vt, body: { status: 'delivered' } });
  check('vendor cannot deliver from pending: 403', r.status === 403);

  r = await api('PUT', `/api/orders/${order1}/status`, { token: ct, body: { status: 'preparing' } });
  check('customer cannot mark preparing: 403', r.status === 403);

  r = await api('PUT', `/api/orders/${order1}/status`, { token: vt, body: { status: 'preparing' } });
  check('vendor ACCEPTS order (pending -> preparing): 200', r.status === 200 && r.data.status === 'preparing');

  r = await api('PUT', `/api/orders/${order1}/status`, { token: vt, body: { status: 'delivered' } });
  check('vendor cannot deliver while preparing: 403', r.status === 403);

  r = await api('PUT', `/api/orders/${order1}/status`, { token: vt, body: { status: 'ready_for_pickup' } });
  check('vendor marks order READY (preparing -> ready_for_pickup): 200', r.status === 200 && r.data.status === 'ready_for_pickup');

  r = await api('PUT', `/api/orders/${order1}/status`, { token: vt, body: { status: 'delivered' } });
  check('vendor still cannot deliver: 403', r.status === 403);

  r = await api('PUT', `/api/orders/${order1}/status`, { token: ct, body: { status: 'delivered' } });
  check('customer confirms delivery (ready_for_pickup -> delivered): 200', r.status === 200 && r.data.status === 'delivered');

  r = await api('GET', `/api/orders/${order1}`, { token: ct });
  check('vendor PAID after delivery (vendor_paid = 1)', r.data.order.vendor_paid === 1);

  r = await api('GET', '/api/vendor/orders', { token: vt });
  check('vendor list shows paid flag on delivered order', r.data.orders[0].vendor_paid === 1);

  r = await api('PUT', `/api/orders/${order1}/status`, { token: ct, body: { status: 'delivered' } });
  check('delivered is terminal: rejected (403 role / 400 transition)', [400, 403].includes(r.status));

  console.log('=== 4. CANCEL ===');

  r = await api('POST', '/api/orders', {
    token: ct,
    body: { restaurantId: rest1.id, items: [{ menuItemId: chapman.id, quantity: 2 }], orderType: 'pickup', paymentMethod: 'cash' },
  });
  const order2 = r.data.orderId;

  r = await api('PUT', `/api/orders/${order1}/cancel`, { token: ct });
  check('cancel delivered order: 400', r.status === 400);

  r = await api('PUT', `/api/orders/${order2}/cancel`, { token: ct });
  check('customer cancels pending order: 200', r.status === 200 && r.data.status === 'cancelled');

  r = await api('PUT', `/api/orders/${order2}/cancel`, { token: ct });
  check('cancel twice: 400', r.status === 400);

  r = await api('PUT', `/api/orders/${order2}/cancel`, { token: vt });
  check('vendor cannot cancel customer order: 403', r.status === 403);

  // Cancel while PREPARING (vendor already accepted).
  r = await api('POST', '/api/orders', {
    token: ct,
    body: { restaurantId: rest1.id, items: [{ menuItemId: chapman.id, quantity: 1 }], orderType: 'pickup', paymentMethod: 'cash' },
  });
  const order3 = r.data.orderId;
  r = await api('PUT', `/api/orders/${order3}/status`, { token: vt, body: { status: 'preparing' } });
  check('vendor accepts order3', r.status === 200);
  r = await api('PUT', `/api/orders/${order3}/cancel`, { token: ct });
  check('customer cancels while preparing: 200', r.status === 200 && r.data.status === 'cancelled');

  console.log('=== 5. ADMIN POWER ===');

  r = await api('GET', `/api/orders/${order1}`, { token: admin.data.token });
  check('admin sees any order', r.status === 200);

  r = await api('PUT', `/api/orders/${order1}/status`, { token: admin.data.token, body: { status: 'pending' } });
  check('admin rejected for invalid transition: 400', r.status === 400);

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`Vendor (test): ${vendorEmail}`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('Test runner error:', e.message);
  process.exit(1);
});