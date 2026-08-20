/**
 * orders.js — order history page.
 *
 * - Fetches GET /api/orders and renders cards with status badges.
 * - Polls every 5 seconds to reflect live status updates from the vendor.
 * - Cancel button while 'pending' or 'preparing'.
 * - "I've received it" (mark delivered) button ONLY on 'ready_for_pickup' —
 *   only the customer can confirm delivery, and that credits the vendor.
 */
(function () {
  const CB = window.CampusBites;
  if (!CB) return;

  const POLL_INTERVAL_MS = 5000;
  let inFlight = false;

  function renderOrders(orders) {
    const ordersEl = document.getElementById('orders');
    const empty = document.getElementById('empty');

    if (orders.length === 0) {
      ordersEl.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    ordersEl.innerHTML = orders.map((o) => {
      const cancellable = ['pending', 'preparing'].includes(o.status);
      const deliverable = o.status === 'ready_for_pickup';
      return `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 animate-slideUp">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="font-extrabold text-slate-800">#${o.id} · ${o.restaurant_name}</p>
              <p class="text-xs text-slate-400 mt-0.5">${new Date(o.created_at).toLocaleString()}</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="badge badge-${o.status} badge-pulse"><span class="dot"></span>${o.status.replace(/_/g, ' ')}</span>
              <span class="badge badge-${o.payment_status}">${o.payment_status}</span>
            </div>
          </div>
          <div class="mt-3 text-sm text-slate-600">
            ${(o.items || []).map((i) => `
              <span class="inline-block mr-4">${i.quantity} × ${i.item_name || 'Item'}
                ${(i.proteins || []).map((p) => `<span class="text-xs text-slate-400"> · ${p.quantity}× ${p.name}</span>`).join('')}
              </span>`).join('')}
          </div>
          <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span class="text-xs text-slate-400">
              ${o.order_type === 'delivery' ? '🚚 Delivery' : '🥡 Pickup'}${o.delivery_address ? ' → ' + o.delivery_address : ''}
            </span>
            <div class="flex items-center gap-3">
              <span class="font-extrabold text-amber-600">${CB.formatMoney(o.total_amount)}</span>
              ${deliverable ? `
                <button data-id="${o.id}" class="deliver-btn bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors duration-200">
                  I've received it — confirm delivery
                </button>` : ''}
              ${cancellable ? `
                <button data-id="${o.id}" class="cancel-btn bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold px-4 py-2 rounded-lg transition-colors duration-200">
                  Cancel order
                </button>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    ordersEl.querySelectorAll('.cancel-btn').forEach((btn) =>
      btn.addEventListener('click', () => cancelOrder(btn.dataset.id, btn))
    );
    ordersEl.querySelectorAll('.deliver-btn').forEach((btn) =>
      btn.addEventListener('click', () => markDelivered(btn.dataset.id, btn))
    );
  }

  async function loadOrders({ silent = false } = {}) {
    if (inFlight) return; // never stack overlapping polls
    inFlight = true;
    try {
      const data = await CB.apiGet('/api/orders');
      const skel = document.getElementById('skeleton');
      if (skel) skel.classList.add('hidden');
      renderOrders(data.orders);
    } catch (err) {
      if (!silent) {
        const skel = document.getElementById('skeleton');
        const empty = document.getElementById('empty');
        if (skel) skel.classList.add('hidden');
        if (empty) {
          empty.textContent = err.message || 'Could not load orders.';
          empty.classList.remove('hidden');
        }
      }
    } finally {
      inFlight = false;
    }
  }

  async function markDelivered(id, btn) {
    if (!confirm('Confirm that you have received your order? The vendor will be paid.')) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span>';
    try {
      const data = await CB.apiPut(`/api/orders/${id}/status`, { status: 'delivered' });
      CB.showToast(`Order #${data.orderId} delivered. Thanks!`, 'success');
      await loadOrders();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "I've received it — confirm delivery";
      CB.showToast(err.message, 'error');
    }
  }

  async function cancelOrder(id, btn) {
    if (!confirm('Cancel this order?')) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span>';
    try {
      const data = await CB.apiPut(`/api/orders/${id}/cancel`);
      CB.showToast(`Order #${data.orderId} cancelled.`, 'success');
      await loadOrders();
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = 'Cancel order';
      CB.showToast(err.message, 'error');
    }
  }

  /* ---------- Page init ---------- */
  CB.registerPage('orders', async function () {
    const user = CB.getStoredUser();
    const loginPrompt = document.getElementById('login-prompt');
    const skel = document.getElementById('skeleton');

    if (!user || !CB.getToken()) {
      skel.classList.add('hidden');
      loginPrompt.classList.remove('hidden');
      return;
    }
    loginPrompt.classList.add('hidden');

    await loadOrders();

    // Live polling — every 5 seconds, silent (no skeleton flicker).
    setInterval(() => loadOrders({ silent: true }), POLL_INTERVAL_MS);
  });
})();