/**
 * Order controller.
 *
 * Customer: POST /api/orders (place), GET /api/orders (own), GET /api/orders/:id,
 *           PUT /api/orders/:id/status (mark delivered ONLY), PUT /api/orders/:id/cancel
 * Vendor:   GET /api/orders/:id (their restaurant), PUT /api/orders/:id/status
 *           (accept / ready), GET /api/vendor/orders
 * Admin:    GET /api/orders/:id, PUT /api/orders/:id/status (backstop)
 *
 * ORDER LIFECYCLE (per product decision):
 *   pending        -> placed by customer (payment simulated as paid)
 *   preparing      -> vendor ACCEPTS the order
 *   ready_for_pickup -> vendor marks "order is ready"
 *   delivered      -> CUSTOMER confirms delivery (only the customer can do this)
 *                     and ONLY THEN is money credited to the vendor (vendor_paid=1)
 *   cancelled      -> customer may cancel while pending or preparing
 *
 * PROTEINS (per product decision):
 *   Menu items expose available proteins (menu_item_proteins). Customers
 *   get the restaurant's PRIMARY protein preselected by default (qty 1),
 *   may pick several proteins and buy more than one of each. Protein
 *   prices (set by the vendor) are snapshotted into order_item_proteins.
 *
 * PAYMENT SIMULATION (important):
 * With PAYMENT_ENABLED=false (current default) there is NO third-party payment
 * call. The order is created as pending and payment_status is immediately set to
 * 'paid' to simulate a successful Paystack charge. The vendor is NOT paid at
 * order time — the vendor's earnings are credited only when the order reaches
 * 'delivered' (vendor_paid flag). No delivery fee is ever added.
 */
const db = require('../config/db');

const PAYMENT_ENABLED = process.env.PAYMENT_ENABLED === 'true';

/* Valid status transitions. 'cancelled' is reachable via the cancel endpoint;
 * admin may also force it via PUT /status as a backstop. */
const ALLOWED_TRANSITIONS = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['delivered'],
  delivered: [],
  cancelled: [],
};

/* Which transition each non-admin role may perform:
 *   vendor   -> accept (pending->preparing) and mark ready (preparing->ready_for_pickup)
 *   customer -> confirm delivery (ready_for_pickup->delivered)
 *   admin    -> any valid transition (backstop) */
function canPerform(role, isOwnerVendor, isOrderCustomer, fromStatus, toStatus) {
  if (role === 'admin') return true;
  if (isOwnerVendor) {
    return (
      (fromStatus === 'pending' && toStatus === 'preparing') ||
      (fromStatus === 'preparing' && toStatus === 'ready_for_pickup')
    );
  }
  if (isOrderCustomer) {
    return fromStatus === 'ready_for_pickup' && toStatus === 'delivered';
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* POST /api/orders  (customer only)                                   */
/* Body: { restaurantId, items: [{ menuItemId, quantity,               */
/*         proteins?: [{ proteinId, quantity }] }], orderType,         */
/*         deliveryAddress?, specialInstructions?, paymentMethod }     */
/*                                                                     */
/* PROTEINS:                                                           */
/*   - each item exposes its AVAILABLE proteins (menu_item_proteins)   */
/*   - if the customer sends no proteins for an item that HAS them,    */
/*     the restaurant's PRIMARY protein is added automatically (qty 1) */
/*   - the customer may pick several proteins, each with its own qty   */
/*   - totals = item base (qty x price) + proteins (qty x price)       */
/* ------------------------------------------------------------------ */
async function placeOrder(req, res, next) {
  // Customer-only endpoint.
  if (req.user.role !== 'customer') {
    return res.status(403).json({ error: 'Only customers can place orders.' });
  }

  let conn;
  try {
    const {
      restaurantId,
      items, // [{ menuItemId, quantity, proteins: [{ proteinId, quantity }] }]
      orderType,
      deliveryAddress = null,
      specialInstructions = null,
      paymentMethod,
    } = req.body;

    // 1. Delivery requires an address.
    if (orderType === 'delivery' && !deliveryAddress) {
      return res.status(400).json({ error: 'deliveryAddress is required when orderType is delivery.' });
    }

    // 2. Restaurant must exist and be active.
    const [restRows] = await db.query(
      'SELECT id, name, is_active FROM restaurants WHERE id = ?',
      [restaurantId]
    );
    if (restRows.length === 0 || !restRows[0].is_active) {
      return res.status(404).json({ error: 'Restaurant not found or not active.' });
    }

    // 3. Load the ordered menu items — must all exist AND belong to this restaurant.
    const itemIds = items.map((i) => i.menuItemId);
    const placeholders = itemIds.map(() => '?').join(',');
    const [menuRows] = await db.query(
      `SELECT id, name, price, is_available
       FROM menu_items
       WHERE restaurant_id = ? AND id IN (${placeholders})`,
      [restaurantId, ...itemIds]
    );

    if (menuRows.length !== itemIds.length) {
      return res.status(400).json({
        error: 'One or more menu items do not exist or do not belong to this restaurant.',
      });
    }
    const unavailable = menuRows.filter((m) => !m.is_available);
    if (unavailable.length > 0) {
      return res.status(400).json({ error: `Item not available: ${unavailable[0].name}` });
    }

    const priceMap = new Map(menuRows.map((m) => [m.id, m]));

    // 3b. Load the proteins available with each ordered item (batched).
    const [proteinRows] = await db.query(
      `SELECT mip.menu_item_id, p.id, p.name, p.price, p.is_primary
       FROM menu_item_proteins mip
       JOIN proteins p ON p.id = mip.protein_id
       WHERE mip.menu_item_id IN (${placeholders})`,
      itemIds
    );
    const proteinsByItem = new Map();
    for (const row of proteinRows) {
      if (!proteinsByItem.has(row.menu_item_id)) proteinsByItem.set(row.menu_item_id, []);
      proteinsByItem.get(row.menu_item_id).push({
        id: row.id,
        name: row.name,
        price: Number(row.price),
        is_primary: row.is_primary === 1,
      });
    }

    // 4. Compute totals — sum of quantity * unit price. NO delivery fee.
    //    Protein selections add their own quantity * price.
    const lineItems = [];
    let totalAmount = 0;

    for (const { menuItemId, quantity, proteins } of items) {
      const menuRow = priceMap.get(menuItemId);
      const available = proteinsByItem.get(menuItemId) || [];
      const availableMap = new Map(available.map((p) => [p.id, p]));
      const chosen = [];

      if (available.length > 0) {
        if (!Array.isArray(proteins) || proteins.length === 0) {
          // Default: the restaurant's PRIMARY protein, quantity 1.
          const primary = available.find((p) => p.is_primary) || available[0];
          chosen.push({ protein: primary, quantity: 1 });
        } else {
          for (const sel of proteins) {
            const protein = availableMap.get(Number(sel.proteinId));
            if (!protein) {
              return res.status(400).json({
                error: `Protein ${sel.proteinId} is not available with '${menuRow.name}'.`,
              });
            }
            if (!Number.isInteger(Number(sel.quantity)) || Number(sel.quantity) < 1) {
              return res.status(422).json({
                error: `Protein '${protein.name}' needs a quantity of at least 1.`,
              });
            }
            chosen.push({ protein, quantity: Number(sel.quantity) });
          }
        }
      }

      const lineFood = quantity * Number(menuRow.price);
      const lineProteins = chosen.reduce((s, c) => s + c.quantity * c.protein.price, 0);
      totalAmount += lineFood + lineProteins;
      lineItems.push({ menuItemId, quantity, unit_price: menuRow.price, chosen });
    }

    totalAmount = Math.round(totalAmount * 100) / 100;

    // 5. Create the order + items + protein selections atomically,
    //    then apply the payment simulation.
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [orderResult] = await conn.query(
      `INSERT INTO orders
         (user_id, restaurant_id, total_amount, status, order_type,
          delivery_address, special_instructions, payment_method, payment_status)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, 'pending')`,
      [req.user.id, restaurantId, totalAmount, orderType, deliveryAddress, specialInstructions, paymentMethod]
    );
    const orderId = orderResult.insertId;

    for (const li of lineItems) {
      const [itemRes] = await conn.query(
        'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [orderId, li.menuItemId, li.quantity, li.unit_price]
      );
      for (const c of li.chosen) {
        await conn.query(
          `INSERT INTO order_item_proteins
             (order_item_id, protein_id, protein_name, quantity, unit_price)
           VALUES (?, ?, ?, ?, ?)`,
          [itemRes.insertId, c.protein.id, c.protein.name, c.quantity, c.protein.price]
        );
      }
    }

    // 6. Simulated payment: no real Paystack call.
    //    Mark payment as 'paid' immediately (simulated charge), but KEEP the
    //    order status 'pending' — it awaits the vendor's acceptance.
    let finalStatus = 'pending';
    let finalPaymentStatus = 'pending';
    if (!PAYMENT_ENABLED) {
      await conn.query(
        "UPDATE orders SET payment_status = 'paid' WHERE id = ?",
        [orderId]
      );
      finalPaymentStatus = 'paid';
    }

    await conn.commit();
    conn.release();
    conn = null;

    return res.status(201).json({
      message: PAYMENT_ENABLED
        ? 'Order placed. Payment processing...'
        : 'Order placed. Payment simulated as PAID — awaiting vendor acceptance.',
      orderId,
      totalAmount,
      status: finalStatus,
      paymentStatus: finalPaymentStatus,
      paymentEnabled: PAYMENT_ENABLED,
    });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch { /* ignore */ }
      conn.release();
    }
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/orders  (customer) — list own orders with items            */
/* ------------------------------------------------------------------ */
async function listMyOrders(req, res, next) {
  try {
    const [orders] = await db.query(
      `SELECT o.id, o.restaurant_id, r.name AS restaurant_name,
              o.total_amount, o.status, o.order_type, o.delivery_address,
              o.special_instructions, o.payment_method, o.payment_status,
              o.vendor_paid, o.created_at, o.updated_at
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    const withItems = await attachItems(orders);
    return res.json({ orders: withItems });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/orders/:id  (customer owner / vendor of restaurant / admin)*/
/* ------------------------------------------------------------------ */
async function getOrderById(req, res, next) {
  try {
    const [rows] = await db.query(
      `SELECT o.*, r.name AS restaurant_name, r.owner_id,
              u.full_name AS customer_name, u.email AS customer_email
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       JOIN users u ON u.id = o.user_id
       WHERE o.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = rows[0];

    // Authorization: admin, the customer who placed it, or the restaurant owner.
    const isOwnerVendor = req.user.role === 'restaurant_owner' && order.owner_id === req.user.id;
    const isOwnCustomer = order.user_id === req.user.id;
    if (req.user.role !== 'admin' && !isOwnerVendor && !isOwnCustomer) {
      return res.status(403).json({ error: 'You cannot view this order.' });
    }

    const [items] = await db.query(
      `SELECT oi.id, oi.menu_item_id, mi.name AS item_name,
              oi.quantity, oi.unit_price, oi.subtotal
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = ?`,
      [order.id]
    );

    // Attach the protein selections (snapshotted names + prices).
    const itemIds = items.map((i) => i.id);
    const proteinsByItem = new Map();
    if (itemIds.length > 0) {
      const itemPh = itemIds.map(() => '?').join(',');
      const [proteinRows] = await db.query(
        `SELECT order_item_id, protein_id, protein_name, quantity, unit_price, subtotal
         FROM order_item_proteins
         WHERE order_item_id IN (${itemPh})
         ORDER BY order_item_id, id`,
        itemIds
      );
      for (const p of proteinRows) {
        if (!proteinsByItem.has(p.order_item_id)) proteinsByItem.set(p.order_item_id, []);
        proteinsByItem.get(p.order_item_id).push({
          proteinId: p.protein_id,
          name: p.protein_name,
          quantity: p.quantity,
          unit_price: Number(p.unit_price),
          subtotal: Number(p.subtotal),
        });
      }
    }
    const withProteins = items.map((it) => ({ ...it, proteins: proteinsByItem.get(it.id) || [] }));

    return res.json({ order, items: withProteins });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* PUT /api/orders/:id/status  (vendor / customer-owner / admin)       */
/* Body: { status } — must follow ALLOWED_TRANSITIONS AND the role's    */
/* capability (see canPerform).                                        */
/* ------------------------------------------------------------------ */
async function updateOrderStatus(req, res, next) {
  try {
    const { status } = req.body;

    const [rows] = await db.query(
      `SELECT o.id, o.status, o.payment_status, o.user_id, r.owner_id
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE o.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = rows[0];

    // Role capability check:
    //   vendor  -> may accept (pending->preparing) and mark ready (preparing->ready_for_pickup)
    //   customer-> may ONLY confirm delivery (ready_for_pickup->delivered)
    //   admin   -> any valid transition (backstop)
    const isOwnerVendor = req.user.role === 'restaurant_owner' && order.owner_id === req.user.id;
    const isOrderCustomer = req.user.id === order.user_id;
    if (!canPerform(req.user.role, isOwnerVendor, isOrderCustomer, order.status, status)) {
      return res.status(403).json({
        error: 'You are not allowed to make this status change.',
      });
    }

    // Transition validation.
    const allowed = ALLOWED_TRANSITIONS[order.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: `Cannot move order from '${order.status}' to '${status}'.`,
        allowedTransitions: allowed,
      });
    }

    // Delivering an order credits the vendor's earnings (vendor_paid = 1).
    if (status === 'delivered') {
      await db.query(
        "UPDATE orders SET status = 'delivered', vendor_paid = 1 WHERE id = ?",
        [order.id]
      );
    } else {
      await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, order.id]);
    }
    return res.json({ message: `Order status updated to '${status}'.`, orderId: order.id, status });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* PUT /api/orders/:id/cancel  (customer who placed the order)         */
/* Allowed only while status is 'pending' or 'preparing'.              */
/* ------------------------------------------------------------------ */
async function cancelOrder(req, res, next) {
  try {
    const [rows] = await db.query(
      'SELECT id, user_id, status, payment_status FROM orders WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = rows[0];

    if (order.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only cancel your own orders.' });
    }
    if (!['pending', 'preparing'].includes(order.status)) {
      return res.status(400).json({
        error: `Order cannot be cancelled once its status is '${order.status}'.`,
      });
    }

    await db.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [order.id]);
    return res.json({ message: 'Order cancelled.', orderId: order.id, status: 'cancelled' });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/vendor/orders  (vendor) — orders for the vendor's restaurant */
/* Query: ?status= optional filter                                     */
/* ------------------------------------------------------------------ */
async function getVendorOrders(req, res, next) {
  try {
    const { status } = req.query;
    const params = [req.user.id];
    let sql = `
      SELECT o.id, o.user_id, u.full_name AS customer_name, u.email AS customer_email,
             o.restaurant_id, r.name AS restaurant_name,
             o.total_amount, o.status, o.order_type, o.delivery_address,
             o.special_instructions, o.payment_method, o.payment_status,
             o.vendor_paid, o.created_at, o.updated_at
      FROM orders o
      JOIN restaurants r ON r.id = o.restaurant_id
      JOIN users u ON u.id = o.user_id
      WHERE r.owner_id = ?`;

    if (status) {
      sql += ' AND o.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY o.created_at DESC';

    const [orders] = await db.query(sql, params);
    const withItems = await attachItems(orders);
    return res.json({ orders: withItems });
  } catch (err) {
    return next(err);
  }
}

/* ------------------------------------------------------------------ */
/* Helper — attach order_items (with item names AND protein            */
/* selections) to a list of orders.                                    */
/* ------------------------------------------------------------------ */
async function attachItems(orders) {
  if (orders.length === 0) return orders;

  const ids = orders.map((o) => o.id);
  const placeholders = ids.map(() => '?').join(',');
  const [items] = await db.query(
    `SELECT oi.order_id, oi.id, oi.menu_item_id, mi.name AS item_name,
            oi.quantity, oi.unit_price, oi.subtotal
     FROM order_items oi
     LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE oi.order_id IN (${placeholders})`,
    ids
  );

  // Attach protein selections to each order item.
  const itemIds = items.map((i) => i.id);
  const proteinsByItem = new Map();
  if (itemIds.length > 0) {
    const itemPh = itemIds.map(() => '?').join(',');
    const [proteinRows] = await db.query(
      `SELECT order_item_id, protein_id, protein_name, quantity, unit_price, subtotal
       FROM order_item_proteins
       WHERE order_item_id IN (${itemPh})
       ORDER BY order_item_id, id`,
      itemIds
    );
    for (const p of proteinRows) {
      if (!proteinsByItem.has(p.order_item_id)) proteinsByItem.set(p.order_item_id, []);
      proteinsByItem.get(p.order_item_id).push({
        proteinId: p.protein_id,
        name: p.protein_name,
        quantity: p.quantity,
        unit_price: Number(p.unit_price),
        subtotal: Number(p.subtotal),
      });
    }
  }

  const byOrder = new Map();
  for (const it of items) {
    if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
    byOrder.get(it.order_id).push({ ...it, proteins: proteinsByItem.get(it.id) || [] });
  }

  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) || [] }));
}

module.exports = { placeOrder, listMyOrders, getOrderById, updateOrderStatus, cancelOrder, getVendorOrders, attachItems };