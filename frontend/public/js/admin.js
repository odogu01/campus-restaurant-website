/**
 * admin.js — Admin Dashboard logic.
 *
 * Tabs:
 *   1. Vendor Requests — approve / reject (modal with reason)
 *   2. All Orders      — every order (view-only: vendors accept & prepare;
 *                        customers confirm delivery; admin sees everything)
 *   3. Users           — list users + change roles
 */
(function () {
  const CB = window.CampusBites;
  if (!CB) return;

  /* ---------- Guard: admins only ---------- */
  const user = CB.getStoredUser();
  if (!user || user.role !== 'admin') {
    CB.showToast('Admin access required.', 'error');
    setTimeout(() => { window.location.replace('login.html'); }, 600);
    return;
  }

  const ACTIVE_TAB = { value: 'requests' };

  /* ---------- Tabs ---------- */
  function switchTab(name) {
    ACTIVE_TAB.value = name;
    document.querySelectorAll('.tab-btn').forEach((b) => {
      const active = b.dataset.tab === name;
      b.className = `tab-btn px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
        active ? 'bg-amber-500 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:border-amber-400'
      }`;
    });
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    const panel = document.getElementById('panel-' + name);
    panel.classList.remove('hidden');

    if (name === 'requests') loadRequests();
    else if (name === 'orders') loadOrders();
    else if (name === 'users') loadUsers();
  }

  document.querySelectorAll('.tab-btn').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab))
  );

  /* ---------- Shared: filter chip bar ---------- */
  function filterChips(active, options, onClick, extra = {}) {
    return `
      <div class="flex flex-wrap gap-2 mb-5">
        ${['', ...options].map((o) => {
          const label = o === '' ? 'All' : o.replace(/_/g, ' ');
          const isActive = (o === '') === (active === '' || active == null) || o === active;
          return `<button data-f="${o || ''}" class="chip px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
            isActive ? 'bg-amber-500 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:border-amber-400'
          }">${label}</button>`;
        }).join('')}
        ${extra.after || ''}
      </div>`;
  }

  function bindChips(container, onClick) {
    container.querySelectorAll('.chip').forEach((c) =>
      c.addEventListener('click', () => onClick(c.dataset.f))
    );
  }

  /* ================================================================
   * TAB 1 — VENDOR REQUESTS
   * ================================================================ */
  async function loadRequests(status = 'pending') {
    const panel = document.getElementById('panel-requests');
    panel.innerHTML = `
      ${filterChips(status, ['pending', 'approved', 'rejected'], null)}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 stagger" id="req-grid">
        <div class="skeleton h-40"></div><div class="skeleton h-40"></div>
      </div>`;
    bindChips(panel, (s) => loadRequests(s));

    try {
      const data = await CB.apiGet('/api/admin/vendor-requests', { query: { status: status || undefined } });
      const grid = document.getElementById('req-grid');
      if (data.requests.length === 0) {
        grid.innerHTML = '<p class="text-slate-400 text-center py-10 col-span-full">No requests here.</p>';
        return;
      }
      grid.innerHTML = data.requests.map(renderRequestCard).join('');
      bindRequestActions(grid);
    } catch (err) {
      panel.innerHTML = `<p class="text-red-500 text-center py-10">${err.message}</p>`;
    }
  }

  function renderRequestCard(r) {
    return `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 animate-slideUp">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="font-extrabold text-slate-800 truncate">${r.restaurant_name}</h3>
            <p class="text-sm text-slate-500">${r.email}${r.phone ? ' · ' + r.phone : ''}</p>
          </div>
          <span class="badge badge-${r.status}">${r.status}</span>
        </div>
        ${r.description ? `<p class="text-sm text-slate-600 mt-2">${r.description}</p>` : ''}
        <p class="text-xs text-slate-400 mt-3">Submitted ${new Date(r.created_at).toLocaleString()}</p>
        ${r.admin_comment ? `<p class="text-xs mt-2 bg-slate-50 rounded-lg p-2 text-slate-500"><span class="font-semibold">Note:</span> ${r.admin_comment}</p>` : ''}
        ${r.status === 'pending' ? `
          <div class="flex gap-2 mt-4">
            <button data-act="approve" data-id="${r.id}" class="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold py-2 rounded-xl transition-colors duration-200">Approve</button>
            <button data-act="reject" data-id="${r.id}" class="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-bold py-2 rounded-xl transition-colors duration-200">Reject</button>
          </div>` : ''}
      </div>`;
  }

  function bindRequestActions(grid) {
    grid.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (btn.dataset.act === 'approve') {
          btn.disabled = true;
          btn.innerHTML = '<span class="btn-spinner"></span> Approving…';
          try {
            const data = await CB.apiPut(`/api/admin/vendor-requests/${id}`, { action: 'approve' });
            CB.showToast(`${data.request.restaurant_name} approved! Credentials emailed.`, 'success', 4000);
            loadRequests('pending');
          } catch (err) {
            btn.disabled = false;
            btn.innerHTML = 'Approve';
            CB.showToast(err.message, 'error');
          }
        } else {
          openRejectModal(id);
        }
      });
    });
  }

  /* ---------- Reject modal ---------- */
  function openRejectModal(id) {
    document.getElementById('reject-id').value = id;
    document.getElementById('reject-reason').value = '';
    document.getElementById('reject-modal').classList.remove('hidden');
  }

  document.getElementById('reject-cancel').addEventListener('click', () => {
    document.getElementById('reject-modal').classList.add('hidden');
  });
  document.getElementById('reject-confirm').addEventListener('click', async () => {
    const id = document.getElementById('reject-id').value;
    const reason = document.getElementById('reject-reason').value.trim();
    const btn = document.getElementById('reject-confirm');

    if (!reason) {
      CB.showToast('A reason is required to reject.', 'error');
      return;
    }
    btn.disabled = true;
    try {
      await CB.apiPut(`/api/admin/vendor-requests/${id}`, { action: 'reject', admin_comment: reason });
      document.getElementById('reject-modal').classList.add('hidden');
      CB.showToast('Application rejected and applicant emailed.', 'success');
      loadRequests('pending');
    } catch (err) {
      CB.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  /* ================================================================
   * TAB 2 — ALL ORDERS
   * ================================================================ */
  const ORDER_STATUSES = ['pending', 'preparing', 'ready_for_pickup', 'delivered', 'cancelled'];

  async function loadOrders(status = '') {
    const panel = document.getElementById('panel-orders');
    panel.innerHTML = `
      ${filterChips(status, ORDER_STATUSES, null)}
      <div class="space-y-4 stagger" id="order-list">
        <div class="skeleton h-32"></div><div class="skeleton h-32"></div>
      </div>`;
    bindChips(panel, (s) => loadOrders(s));

    try {
      const data = await CB.apiGet('/api/admin/orders', { query: { status: status || undefined } });
      const list = document.getElementById('order-list');
      if (data.orders.length === 0) {
        list.innerHTML = '<p class="text-slate-400 text-center py-10">No orders found.</p>';
        return;
      }
      list.innerHTML = data.orders.map(renderOrderCard).join('');
    } catch (err) {
      panel.innerHTML = `<p class="text-red-500 text-center py-10">${err.message}</p>`;
    }
  }

  /* ================================================================
   * TAB 3 — USERS
   * ================================================================ */
  async function loadUsers(role = '') {
    const panel = document.getElementById('panel-users');
    panel.innerHTML = `
      ${filterChips(role, ['customer', 'restaurant_owner', 'admin'], null)}
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-500 text-left">
              <tr><th class="px-5 py-3 font-semibold">User</th><th class="px-5 py-3 font-semibold hidden sm:table-cell">Email</th><th class="px-5 py-3 font-semibold">Role</th><th class="px-5 py-3 font-semibold hidden md:table-cell">Joined</th></tr>
            </thead>
            <tbody id="user-rows"></tbody>
          </table>
        </div>
      </div>`;
    bindChips(panel, (r) => loadUsers(r));

    try {
      const data = await CB.apiGet('/api/admin/users', { query: { role: role || undefined } });
      const rows = document.getElementById('user-rows');
      rows.innerHTML = data.users.map(renderUserRow).join('');
      rows.querySelectorAll('.role-select').forEach((sel) =>
        sel.addEventListener('change', () => changeRole(sel.dataset.id, sel.value, sel))
      );
    } catch (err) {
      panel.innerHTML = `<p class="text-red-500 text-center py-10">${err.message}</p>`;
    }
  }

  function renderUserRow(u) {
    const me = CB.getStoredUser();
    return `
      <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
        <td class="px-5 py-3 font-bold text-slate-800">${u.full_name} ${u.id === me.id ? '<span class="text-xs text-amber-600 font-semibold">(you)</span>' : ''}</td>
        <td class="px-5 py-3 text-slate-500 hidden sm:table-cell">${u.email}</td>
        <td class="px-5 py-3">
          <select data-id="${u.id}" class="role-select ${u.id === me.id ? 'opacity-50 pointer-events-none' : ''} bg-slate-100 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 border border-slate-200 outline-none">
            ${['customer', 'restaurant_owner', 'admin'].map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r.replace('_', ' ')}</option>`).join('')}
          </select>
        </td>
        <td class="px-5 py-3 text-slate-400 hidden md:table-cell">${new Date(u.created_at).toLocaleDateString()}</td>
      </tr>`;
  }

  async function changeRole(userId, role, sel) {
    try {
      const data = await CB.apiPut(`/api/admin/users/${userId}/role`, { role });
      CB.showToast(data.message, 'success');
    } catch (err) {
      CB.showToast(err.message, 'error');
      // revert select to server truth
      loadUsers();
    }
  }

  /* ================================================================
   * SHARED ORDER CARD (admin view — read-only)
   * Vendors handle accepting/preparing; customers confirm delivery.
   * ================================================================ */
  function renderOrderCard(o) {
    const earned = o.vendor_paid ? '<span class="badge badge-delivered">Paid to vendor ✓</span>' : '';
    return `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 animate-slideUp">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="font-extrabold text-slate-800">#${o.id} · ${o.restaurant_name}</p>
            <p class="text-xs text-slate-400 mt-0.5">${o.customer_name} (${o.customer_email}) · ${new Date(o.created_at).toLocaleString()}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="badge badge-${o.status} badge-pulse"><span class="dot"></span>${o.status.replace(/_/g, ' ')}</span>
            <span class="badge badge-${o.payment_status}">${o.payment_status}</span>
            ${earned}
          </div>
        </div>
        <div class="mt-3 text-sm text-slate-600">
          ${(o.items || []).map((i) => `
              <span class="inline-block mr-4">${i.quantity} × ${i.item_name || 'Item'}
                ${(i.proteins || []).map((p) => `<span class="text-xs text-slate-400"> · ${p.quantity}× ${p.name}</span>`).join('')}
              </span>`).join('')}
        </div>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span class="text-xs text-slate-400">${o.order_type}${o.delivery_address ? ' → ' + o.delivery_address : ''}</span>
          <span class="font-extrabold text-amber-600">${CB.formatMoney(o.total_amount)}</span>
        </div>
      </div>`;
  }

  /* ---------- boot ---------- */
  switchTab('requests');
  window.adminDash = { switchTab, loadRequests, loadOrders, loadUsers };
})();