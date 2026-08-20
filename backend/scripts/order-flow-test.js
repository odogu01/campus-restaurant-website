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

  // Foods + proteins (STRICT one-primary rule; prices add on top of items).
  r = await api('POST', `/api/restaurants/${rest1.id}/foods`, { token: vt, body: { name: 'Grilled Chicken' } });
  const foodChicken = r.data.food;
  r = await api('POST', `/api/restaurants/${rest1.id}/foods`, { token: vt, body: { name: 'Chapman' } });
  const foodChapman = r.data.food;
  r = await api('POST', `/api/restaurants/${rest1.id}/proteins`, { token: vt, body: { name: 'Goat Meat', price: 2.5, is_primary: true } });
  const proteinGoat = r.data.protein;
  r = await api('POST', `/api/restaurants/${rest1.id}/proteins`, { token: vt, body: { name: 'Beef', price: 3.0 } });
  const proteinBeef = r.data.protein;
  r = await api('POST', `/api/restaurants/${rest2.id}/foods`, { token: vt2, body: { name: 'Pizza Slice' } });
  const foodPizza = r.data.food;
  r = await api('POST', `/api/restaurants/${rest2.id}/proteins`, { token: vt2, body: { name: 'Pepperoni', price: 1.5 } });
  const proteinPepperoni = r.data.protein;

  // Menu items (STRICT: every item needs >= 2 uploaded images).
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { food_id: foodChicken.id, price: '12.5', protein_ids: [proteinGoat.id, proteinBeef.id] },
    images: [imgBlob(), imgBlob()],
  });
  const chicken = r.data.item;
  r = await apiMulti('POST', `/api/restaurants/${rest1.id}/menu`, {
    token: vt,
    fields: { food_id: foodChapman.id, price: '3.0' },
    images: [imgBlob(), imgBlob()],
  });
  const chapman = r.data.item;

  r = await apiMulti('POST', `/api/restaurants/${rest2.id}/menu`, {
    token: vt2,
    fields: { food_id: foodPizza.id, price: '8.0' },
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
      items: [
        {
          menuItemId: chicken.id,
          quantity: 2,
          proteins: [
            { proteinId: proteinGoat.id, quantity: 2 }, // 2 × goat meat @2.50
            { proteinId: proteinBeef.id, quantity: 1 }, // 1 × beef @3.00
          ],
        },
        { menuItemId: chapman.id, quantity: 1 },
      ],
      orderType: 'pickup',
      paymentMethod: 'paystack',
      specialInstructions: 'Extra spicy please',
    },
  });
  check('place order: 201', r.status === 201 && r.data.orderId);
  check('status = pending (awaits vendor acceptance)', r.data.status === 'pending');
  check('payment_status = paid (simulated)', r.data.paymentStatus === 'paid');
  check('total = 2x12.50 + (2x2.50 + 1x3.00) + 1x3.00 = 36.00', Number(r.data.totalAmount) === 36);
  check('paymentEnabled flag false', r.data.paymentEnabled === false);
  const order1 = r.data.orderId;

  // No proteins sent on an item that HAS proteins -> primary auto-added (qty 1).
  r = await api('POST', '/api/orders', {
    token: ct,
    body: { restaurantId: rest1.id, items: [{ menuItemId: chicken.id, quantity: 1 }], orderType: 'pickup', paymentMethod: 'cash' },
  });
  check('order without proteins placed: 201', r.status === 201);
  const orderAuto = r.data.orderId;
  check('total includes default primary protein (12.50 + 2.50 = 15.00)', Number(r.data.totalAmount) === 15);
  r = await api('GET', `/api/orders/${orderAuto}`, { token: ct });
  check('default primary protein attached to line',
    r.data.items[0].proteins.length === 1 && r.data.items[0].proteins[0].name === 'Goat Meat' && r.data.items[0].proteins[0].quantity === 1);

  // Invalid / foreign / zero-quantity proteins -> rejected.
  r = await api('POST', '/api/orders', {
    token: ct,
    body: { restaurantId: rest1.id, items: [{ menuItemId: chicken.id, quantity: 1, proteins: [{ proteinId: 99999, quantity: 1 }] }], orderType: 'pickup', paymentMethod: 'cash' },
  });
  check('unknown protein id: 400', r.status === 400);

  r = await api('POST', '/api/orders', {
    token: ct,
    body: { restaurantId: rest1.id, items: [{ menuItemId: chicken.id, quantity: 1, proteins: [{ proteinId: proteinPepperoni.id, quantity: 1 }] }], orderType: 'pickup', paymentMethod: 'cash' },
  });
  check('protein from another restaurant: 400', r.status === 400);

  r = await api('POST', '/api/orders', {
    token: ct,
    body: { restaurantId: rest1.id, items: [{ menuItemId: chicken.id, quantity: 1, proteins: [{ proteinId: proteinGoat.id, quantity: 0 }] }], orderType: 'pickup', paymentMethod: 'cash' },
  });
  check('protein quantity 0: 422', r.status === 422);

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
  check('detail has 2 items with food subtotals (chicken 25.00, chapman 3.00)',
    r.data.items.length === 2 && r.data.items.some((i) => Number(i.subtotal) === 25) && r.data.items.some((i) => Number(i.subtotal) === 3));
  check('chicken line carries protein breakdown',
    r.data.items.find((i) => i.menu_item_id === chicken.id).proteins.length === 2 &&
    r.data.items.find((i) => i.menu_item_id === chicken.id).proteins.every((p) => p.name && p.quantity >= 1 && Number(p.unit_price) >= 2.5));
  check('detail total = 36.00', Number(r.data.order.total_amount) === 36);
  check('vendor NOT paid yet (vendor_paid = 0)', r.data.order.vendor_paid === 0);

  r = await api('GET', `/api/orders/${order1}`, { token: vt });
  check('vendor sees order for their restaurant', r.status === 200 && r.data.order.customer_email === 'customer@test.com');

  r = await api('GET', `/api/orders/${order1}`, { token: bobt });
  check('other customer cannot view: 403', r.status === 403);

  r = await api('GET', '/api/orders', { token: ct });
  check('customer lists own orders (latest first, with items)',
    r.status === 200 && r.data.orders.length >= 2 && r.data.orders[0].id === orderAuto && r.data.orders[0].items.length === 1);

  r = await api('GET', '/api/vendor/orders', { token: vt });
  check('vendor sees 2 orders', r.status === 200 && r.data.orders.length === 2);
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
  check('vendor list shows paid flag on delivered order', r.data.orders.some((o) => o.id === order1 && o.vendor_paid === 1));

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