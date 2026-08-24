/**
 * vendor.js — Vendor Dashboard logic.
 *
 * Tabs:
 *   1. My Restaurant — view, edit, create, deactivate restaurants
 *   2. Menu Items    — list, add, edit, delete items (per restaurant)
 *   3. Orders        — incoming orders: ACCEPT (pending->preparing),
 *                      mark READY (preparing->ready_for_pickup), earnings
 *                      (credited only on customer-confirmed delivery)
 */
(function () {
  const CB = window.CampusBites;
  if (!CB) return;

  /* ---------- Guard: restaurant owners only ---------- */
  const user = CB.getStoredUser();
  if (!user || user.role !== 'restaurant_owner') {
    CB.showToast('Vendor access required.', 'error');
    setTimeout(() => { window.location.replace('login.html'); }, 600);
    return;
  }

  /* Vendor actions per status. The customer confirms delivery; the vendor
   * only accepts orders and marks them ready. Earnings are credited when the
   * customer marks the order delivered (vendor_paid flag). */
  const VENDOR_ACTIONS = {
    pending: [{ to: 'preparing', label: 'Accept order', cls: 'bg-emerald-500 hover:bg-emerald-600 text-white' }],
    preparing: [{ to: 'ready_for_pickup', label: 'Order is ready', cls: 'bg-amber-500 hover:bg-amber-600 text-white' }],
    ready_for_pickup: [], // waiting for the customer to confirm delivery
    delivered: [],
    cancelled: [],
  };

  const ORDER_STATUSES = ['pending', 'preparing', 'ready_for_pickup', 'delivered', 'cancelled'];
  let restaurants = [];
  let selectedRestaurantId = null;

  /* ---------- Tabs ---------- */
  document.querySelectorAll('.tab-btn').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab))
  );

  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      const active = b.dataset.tab === name;
      b.className = `tab-btn px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
        active ? 'bg-amber-500 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:border-amber-400'
      }`;
    });
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    const panel = document.getElementById('panel-' + name);
    panel.classList.remove('hidden');

    if (name === 'restaurant') loadRestaurants();
    else if (name === 'menu') loadMenu();
    else if (name === 'orders') loadOrders();
  }

  function chipBar(active, options, onClick) {
    const chips = `<div class="flex flex-wrap gap-2 mb-5">${['', ...options].map((o) => {
      const label = o === '' ? 'All' : o.replace(/_/g, ' ');
      const isActive = o === active;
      return `<button data-f="${o || ''}" class="chip px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
        isActive ? 'bg-amber-500 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:border-amber-400'
      }">${label}</button>`;
    }).join('')}</div>`;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = chips;
    wrapper.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => onClick(c.dataset.f)));
    return wrapper.innerHTML;
  }

  /* ================================================================
   * TAB 1 — MY RESTAURANT
   * ================================================================ */
  async function loadRestaurants() {
    const panel = document.getElementById('panel-restaurant');
    panel.innerHTML = `
      <div id="create-rest-card" class="mb-6 bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg animate-slideUp">
        <h2 class="text-xl font-extrabold">Add a new restaurant</h2>
        <p class="text-amber-100 text-sm mt-1">Each vendor manages one restaurant.</p>
        <form id="create-rest-form" class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input id="c-name" placeholder="Restaurant name *" required class="px-4 py-2.5 rounded-xl text-slate-800 outline-none" />
          <input id="c-cuisine" placeholder="Cuisine type" class="px-4 py-2.5 rounded-xl text-slate-800 outline-none" />
          <input id="c-address" placeholder="Address" class="px-4 py-2.5 rounded-xl text-slate-800 outline-none" />
          <input id="c-phone" placeholder="Phone" class="px-4 py-2.5 rounded-xl text-slate-800 outline-none" />
          <textarea id="c-desc" rows="2" placeholder="Short description" class="sm:col-span-2 px-4 py-2.5 rounded-xl text-slate-800 outline-none"></textarea>
          <button type="submit" class="sm:col-span-2 bg-white text-orange-600 font-bold py-2.5 rounded-xl hover:bg-amber-50 transition-colors">Create restaurant</button>
        </form>
      </div>
      <div id="rest-list" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="skeleton h-44"></div><div class="skeleton h-44"></div>
      </div>
      <div id="foods-proteins" class="mt-6"></div>`;

    document.getElementById('create-rest-form').addEventListener('submit', createRestaurant);
    await loadRestaurantsList();
  }

  async function loadRestaurantsList() {
    try {
      const data = await CB.apiGet('/api/vendor/restaurants');
      restaurants = data.restaurants;
      if (restaurants.length > 0 && !selectedRestaurantId) {
        selectedRestaurantId = restaurants[0].id;
      }
      // STRICT RULE: one restaurant per vendor — hide the create form
      // once the vendor already has their restaurant (active or inactive).
      const createCard = document.getElementById('create-rest-card');
      if (createCard) {
        if (restaurants.length > 0) {
          createCard.classList.add('hidden');
        } else {
          createCard.classList.remove('hidden');
        }
      }
      const grid = document.getElementById('rest-list');
      if (restaurants.length === 0) {
        grid.innerHTML = '<p class="text-slate-400 text-center py-10 col-span-full">No restaurants yet — create one above!</p>';
        return;
      }
      grid.innerHTML = restaurants.map(renderRestaurantCard).join('');
      grid.querySelectorAll('.rest-edit').forEach((b) => b.addEventListener('click', () => openRestEdit(b.dataset.id)));
      grid.querySelectorAll('.rest-delete').forEach((b) => b.addEventListener('click', () => deactivateRestaurant(b.dataset.id)));
      await renderFoodsProteins(restaurants[0].id);
    } catch (err) {
      document.getElementById('rest-list').innerHTML = `<p class="text-red-500 text-center py-10">${err.message}</p>`;
    }
  }

  /* ================================================================
   * FOODS & PROTEINS — set up in the My Restaurant tab
   * ================================================================ */
  async function renderFoodsProteins(rid) {
    const host = document.getElementById('foods-proteins');
    if (!host || !rid) return;
    host.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 animate-slideUp">
        <h3 class="font-extrabold text-slate-800">🥘 Foods &amp; proteins</h3>
        <p class="text-xs text-slate-400 mt-0.5 mb-4">Menu items are created from these foods. The <b>primary</b> protein is preselected for customers by default, and protein prices are added on top of the item price.</p>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <p class="text-sm font-bold text-slate-700 mb-2">Foods you sell</p>
            <div id="food-list" class="space-y-1.5 mb-3"></div>
            <form id="food-add-form" class="flex gap-2">
              <input id="food-name" placeholder="e.g. Jollof rice" class="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 focus:border-amber-400 outline-none text-sm" />
              <button type="submit" class="bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">Add</button>
            </form>
          </div>
          <div>
            <p class="text-sm font-bold text-slate-700 mb-2">Proteins (with prices)</p>
            <div id="protein-list" class="space-y-1.5 mb-3"></div>
            <form id="protein-add-form" class="flex gap-2 flex-wrap">
              <input id="protein-name" placeholder="e.g. Goat meat" class="flex-1 min-w-[7rem] px-3 py-2 rounded-xl border border-slate-200 focus:border-amber-400 outline-none text-sm" />
              <input id="protein-price" type="number" step="0.01" min="0" placeholder="Price ₦" class="w-24 px-3 py-2 rounded-xl border border-slate-200 focus:border-amber-400 outline-none text-sm" />
              <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <input id="protein-primary" type="checkbox" class="accent-amber-500 w-4 h-4" /> Primary
              </label>
              <button type="submit" class="bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">Add</button>
            </form>
            <p class="text-[0.7rem] text-slate-400 mt-2">⭐ = primary protein (the default customers get). Click a star to change it. Edit a price inline and press Enter.</p>
          </div>
        </div>
      </div>`;

    document.getElementById('food-add-form').addEventListener('submit', (e) => { e.preventDefault(); addFood(rid); });
    document.getElementById('protein-add-form').addEventListener('submit', (e) => { e.preventDefault(); addProtein(rid); });
    await Promise.all([loadFoods(rid), loadProteins(rid)]);
  }

  async function loadFoods(rid) {
    const el = document.getElementById('food-list');
    try {
      const data = await CB.apiGet(`/api/restaurants/${rid}/foods`);
      if (data.foods.length === 0) {
        el.innerHTML = '<p class="text-xs text-slate-400">No foods yet — add the foods you sell.</p>';
        return;
      }
      el.innerHTML = data.foods.map((f) => `
        <div class="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5">
          <span class="text-sm font-semibold text-slate-700">${f.name}</span>
          <button data-id="${f.id}" class="food-del text-xs text-slate-400 hover:text-red-600 transition-colors" title="Remove food">✕</button>
        </div>`).join('');
      el.querySelectorAll('.food-del').forEach((b) => b.addEventListener('click', () => deleteFood(rid, Number(b.dataset.id))));
    } catch (err) {
      el.innerHTML = `<p class="text-xs text-red-500">${err.message}</p>`;
    }
  }

  async function addFood(rid) {
    const input = document.getElementById('food-name');
    const name = input.value.trim();
    if (!name) return;
    try {
      await CB.apiPost(`/api/restaurants/${rid}/foods`, { name });
      input.value = '';
      CB.showToast(`"${name}" added to your foods.`, 'success');
      await loadFoods(rid);
    } catch (err) {
      CB.showToast(err.message, 'error');
    }
  }

  async function deleteFood(rid, id) {
    if (!confirm('Remove this food from your list?')) return;
    try {
      await CB.apiDelete(`/api/foods/${id}`);
      CB.showToast('Food removed.', 'info');
      await loadFoods(rid);
    } catch (err) {
      CB.showToast(err.message, 'error');
    }
  }

  async function loadProteins(rid) {
    const el = document.getElementById('protein-list');
    try {
      const data = await CB.apiGet(`/api/restaurants/${rid}/proteins`);
      if (data.proteins.length === 0) {
        el.innerHTML = '<p class="text-xs text-slate-400">No proteins yet — add the proteins you sell with their prices.</p>';
        return;
      }
      el.innerHTML = data.proteins.map((p) => `
        <div class="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5 gap-2">
          <button data-id="${p.id}" class="primary-star text-base ${p.is_primary ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'} transition-colors" title="${p.is_primary ? 'Primary protein' : 'Set as primary protein'}">★</button>
          <span class="text-sm font-semibold text-slate-700 flex-1 min-w-0 truncate">${p.name}${p.is_primary ? ' <span class="text-[0.6rem] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full ml-1">DEFAULT</span>' : ''}</span>
          <input data-id="${p.id}" type="number" step="0.01" min="0" value="${Number(p.price)}" class="price-input w-20 px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-amber-400" title="Edit price (Enter to save)" />
          <button data-id="${p.id}" class="protein-del text-xs text-slate-400 hover:text-red-600 transition-colors" title="Remove protein">✕</button>
        </div>`).join('');
      el.querySelectorAll('.primary-star').forEach((b) =>
        b.addEventListener('click', () => setPrimaryProtein(rid, Number(b.dataset.id)))
      );
      el.querySelectorAll('.price-input').forEach((inp) =>
        inp.addEventListener('change', () => updateProteinPrice(rid, Number(inp.dataset.id), inp))
      );
      el.querySelectorAll('.protein-del').forEach((b) =>
        b.addEventListener('click', () => deleteProtein(rid, Number(b.dataset.id)))
      );
    } catch (err) {
      el.innerHTML = `<p class="text-xs text-red-500">${err.message}</p>`;
    }
  }

  async function addProtein(rid) {
    const name = document.getElementById('protein-name').value.trim();
    const price = Number(document.getElementById('protein-price').value);
    const primary = document.getElementById('protein-primary').checked;
    if (!name || !(price >= 0)) {
      CB.showToast('Protein name and price are required.', 'error');
      return;
    }
    try {
      await CB.apiPost(`/api/restaurants/${rid}/proteins`, { name, price, is_primary: primary });
      document.getElementById('protein-name').value = '';
      document.getElementById('protein-price').value = '';
      document.getElementById('protein-primary').checked = false;
      CB.showToast(`"${name}" added (${CB.formatMoney(price)}).`, 'success');
      await loadProteins(rid);
    } catch (err) {
      CB.showToast(err.message, 'error');
    }
  }

  async function setPrimaryProtein(rid, id) {
    try {
      await CB.apiPut(`/api/proteins/${id}`, { is_primary: true });
      CB.showToast('Primary protein updated.', 'success');
      await loadProteins(rid);
    } catch (err) {
      CB.showToast(err.message, 'error');
    }
  }

  async function updateProteinPrice(rid, id, inp) {
    const price = Number(inp.value);
    if (!(price >= 0)) {
      CB.showToast('Price must be a positive number.', 'error');
      await loadProteins(rid);
      return;
    }
    try {
      await CB.apiPut(`/api/proteins/${id}`, { price });
      CB.showToast('Protein price updated.', 'success');
      await loadProteins(rid);
    } catch (err) {
      CB.showToast(err.message, 'error');
      await loadProteins(rid);
    }
  }

  async function deleteProtein(rid, id) {
    if (!confirm('Remove this protein from your list?')) return;
    try {
      await CB.apiDelete(`/api/proteins/${id}`);
      CB.showToast('Protein removed.', 'info');
      await loadProteins(rid);
    } catch (err) {
      CB.showToast(err.message, 'error');
    }
  }

  function renderRestaurantCard(r) {
    const openStatus = r.is_open === false
      ? '<span class="badge badge-cancelled">Closed</span>'
      : r.opening_time || r.closing_time
        ? `<span class="badge badge-delivered">Open ${r.opening_time || ''}–${r.closing_time || ''}</span>`
        : '<span class="badge badge-confirmed">Always open</span>';
    return `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 animate-slideUp ${r.is_active ? '' : 'opacity-60'}" data-rest-id="${r.id}">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 class="font-extrabold text-slate-800">${r.name}</h3>
            <p class="text-sm text-slate-500">${r.cuisine_type || 'No cuisine set'} · ${r.menu_items_count} items available</p>
            <p class="text-xs text-slate-400 mt-0.5">${openStatus}</p>
          </div>
          <span class="badge ${r.is_active ? 'badge-delivered' : 'badge-cancelled'}">${r.is_active ? 'active' : 'inactive'}</span>
        </div>
        ${r.description ? `<p class="text-sm text-slate-600 mt-2">${r.description}</p>` : ''}
        <div class="text-xs text-slate-400 mt-2">${r.address || ''}${r.phone ? ' · ' + r.phone : ''}</div>
        <div class="flex gap-2 mt-4">
          <button data-id="${r.id}" class="rest-edit flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold py-2 rounded-xl transition-colors">Edit</button>
          ${r.is_active ? `<button data-id="${r.id}" class="rest-delete flex-1 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold py-2 rounded-xl transition-colors">Deactivate</button>` : ''}
        </div>
      </div>`;
  }

  async function createRestaurant(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const data = await CB.apiPost('/api/restaurants', {
        name: document.getElementById('c-name').value.trim(),
        cuisine_type: document.getElementById('c-cuisine').value.trim() || null,
        address: document.getElementById('c-address').value.trim() || null,
        phone: document.getElementById('c-phone').value.trim() || null,
        description: document.getElementById('c-desc').value.trim() || null,
      });
      CB.showToast(`"${data.restaurant.name}" created!`, 'success');
      e.target.reset();
      await loadRestaurantsList();
    } catch (err) {
      console.error('[createRestaurant]', err);
      CB.showToast(err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ---------- Edit restaurant modal ---------- */
  function openRestEdit(id) {
    const r = restaurants.find((x) => x.id === Number(id));
    if (!r) return;
    document.getElementById('rest-id').value = r.id;
    document.getElementById('rest-name').value = r.name || '';
    document.getElementById('rest-desc').value = r.description || '';
    document.getElementById('rest-cuisine').value = r.cuisine_type || '';
    document.getElementById('rest-phone').value = r.phone || '';
    document.getElementById('rest-address').value = r.address || '';
    document.getElementById('rest-logo').value = r.logo_url || '';
    document.getElementById('rest-opening').value = r.opening_time || '';
    document.getElementById('rest-closing').value = r.closing_time || '';
    // Load existing restaurant images
    renderRestImagePreviews(r.images || []);
    document.getElementById('rest-modal').classList.remove('hidden');
  }

  document.getElementById('rest-cancel').addEventListener('click', () => document.getElementById('rest-modal').classList.add('hidden'));
  document.getElementById('rest-save').addEventListener('click', async () => {
    const id = document.getElementById('rest-id').value;
    const btn = document.getElementById('rest-save');
    btn.disabled = true;
    try {
      // First update restaurant basic info + hours
      await CB.apiPut(`/api/restaurants/${id}`, {
        name: document.getElementById('rest-name').value.trim(),
        description: document.getElementById('rest-desc').value.trim() || null,
        cuisine_type: document.getElementById('rest-cuisine').value.trim() || null,
        phone: document.getElementById('rest-phone').value.trim() || null,
        address: document.getElementById('rest-address').value.trim() || null,
        logo_url: document.getElementById('rest-logo').value.trim() || null,
        opening_time: document.getElementById('rest-opening').value || null,
        closing_time: document.getElementById('rest-closing').value || null,
      });
      // Then upload any new restaurant images
      const imageFiles = document.getElementById('rest-images').files;
      if (imageFiles.length > 0) {
        const form = new FormData();
        for (const f of imageFiles) form.append('images', f);
        await CB.apiPost(`/api/restaurants/${id}/images`, form);
      }
      document.getElementById('rest-modal').classList.add('hidden');
      CB.showToast('Restaurant updated.', 'success');
      await loadRestaurantsList();
    } catch (err) {
      CB.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  async function deactivateRestaurant(id) {
    if (!confirm('Deactivate this restaurant? It will be hidden from customers.')) return;
    try {
      await CB.apiDelete(`/api/restaurants/${id}`);
      CB.showToast('Restaurant deactivated.', 'info');
      await loadRestaurantsList();
    } catch (err) {
      CB.showToast(err.message, 'error');
    }
  }

  /* ================================================================
   * TAB 2 — MENU ITEMS
   * ================================================================ */
  async function loadMenu() {
    const panel = document.getElementById('panel-menu');
    panel.innerHTML = `
      <div class="flex flex-wrap items-center gap-3 mb-5">
        <label class="text-sm font-semibold text-slate-600">Restaurant:</label>
        <select id="menu-rest-select" class="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 outline-none">
          ${restaurants.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}
        </select>
        <button id="add-item-btn" class="ml-auto bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">+ Add item</button>
      </div>
      <div id="menu-list" class="space-y-3">
        <div class="skeleton h-20"></div><div class="skeleton h-20"></div>
      </div>`;

    const select = document.getElementById('menu-rest-select');
    if (restaurants.length > 0) select.value = selectedRestaurantId || restaurants[0].id;
    select.addEventListener('change', () => {
      selectedRestaurantId = Number(select.value);
      renderMenuItems();
    });
    document.getElementById('add-item-btn').addEventListener('click', () => openItemModal());
    await renderMenuItems();
  }

  async function renderMenuItems() {
    const list = document.getElementById('menu-list');
    if (!restaurants.length) {
      list.innerHTML = '<p class="text-slate-400 text-center py-10">Create a restaurant first.</p>';
      return;
    }
    const rid = selectedRestaurantId || restaurants[0].id;
    try {
      const data = await CB.apiGet(`/api/restaurants/${rid}/menu`);
      if (data.menu.length === 0) {
        list.innerHTML = '<p class="text-slate-400 text-center py-10">No items yet — add your first one!</p>';
        return;
      }
      list.innerHTML = data.menu.map((item) => `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4 animate-slideUp">
          ${item.images && item.images.length ? `
            <div class="relative shrink-0">
              <img src="${item.images[0]}" class="w-14 h-14 rounded-xl object-cover border border-slate-100" alt="${item.name}">
              <span class="absolute -bottom-1.5 -right-1.5 text-[0.6rem] font-bold bg-slate-700 text-white rounded-full px-1.5 py-0.5">${item.images.length} 📷</span>
            </div>` : ''}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h4 class="font-bold text-slate-800">${item.name}</h4>
              <span class="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">${item.proteins && item.proteins.length ? `${item.proteins.length} protein${item.proteins.length > 1 ? 's' : ''}` : 'No proteins'}</span>
            </div>
            ${item.description ? `<p class="text-sm text-slate-500">${item.description}</p>` : ''}
          </div>
          <div class="text-right shrink-0">
            <p class="font-extrabold text-amber-600">${CB.formatMoney(item.price)}</p>
            <button data-id="${item.id}" class="toggle-item text-xs font-semibold mt-1 ${item.is_available ? 'text-emerald-600 hover:text-emerald-700' : 'text-red-400 hover:text-red-600'} transition-colors">
              ${item.is_available ? 'available' : 'unavailable'}
            </button>
          </div>
          <div class="flex flex-col gap-1.5 shrink-0">
            <button data-id="${item.id}" class="item-edit bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-1.5 rounded-lg transition-colors">Edit</button>
            <button data-id="${item.id}" class="item-delete bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold px-4 py-1.5 rounded-lg transition-colors">Delete</button>
          </div>
        </div>`).join('');

      list.querySelectorAll('.item-edit').forEach((b) => b.addEventListener('click', () => openItemModal(Number(b.dataset.id))));
      list.querySelectorAll('.item-delete').forEach((b) => b.addEventListener('click', () => deleteItem(Number(b.dataset.id))));
      list.querySelectorAll('.toggle-item').forEach((b) => b.addEventListener('click', () => toggleAvailability(Number(b.dataset.id))));
    } catch (err) {
      list.innerHTML = `<p class="text-red-500 text-center py-10">${err.message}</p>`;
    }
  }

  /* ---------- Menu item modal (photos required, >= 2) ---------- */
  let itemCurrentImages = []; // images already on the server (edit mode)

  function renderItemImagePreviews() {
    const previews = document.getElementById('item-image-previews');
    const count = document.getElementById('item-image-count');
    if (!previews) return;

    const local = Array.from(document.getElementById('item-images').files || []);
    const total = itemCurrentImages.length + local.length;

    previews.innerHTML = [
      ...itemCurrentImages.map((src) => `<img src="${src}" class="w-full h-16 object-cover rounded-lg border border-slate-200" alt="existing photo">`),
      ...local.map((f) => `<img src="${URL.createObjectURL(f)}" class="w-full h-16 object-cover rounded-lg border border-amber-300" alt="new photo">`),
    ].join('');

    count.textContent = `Photos: ${total} of at least 2 required.${local.length ? ` (${local.length} new — these will replace existing photos on save)` : ''}`;
    count.className = 'text-xs mt-1 ' + (total >= 2 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold');
  }

  /* Restaurant image previews (for edit modal) */
  function renderRestImagePreviews(images) {
    const previews = document.getElementById('rest-image-previews');
    const count = document.getElementById('rest-image-count');
    if (!previews) return;

    const local = Array.from(document.getElementById('rest-images').files || []);
    const total = (images?.length || 0) + local.length;

    previews.innerHTML = [
      ...(images || []).map((src) => `<img src="${src}" class="w-full h-16 object-cover rounded-lg border border-slate-200" alt="existing photo">`),
      ...local.map((f) => `<img src="${URL.createObjectURL(f)}" class="w-full h-16 object-cover rounded-lg border border-amber-300" alt="new photo">`),
    ].join('');

    count.textContent = `Photos: ${total} ${local.length ? `(${local.length} new)` : ''}`;
    count.className = 'text-xs mt-1 text-slate-500';
  }

  async function openItemModal(item) {
    const rid = selectedRestaurantId || restaurants[0].id;

    // Load the restaurant's foods + proteins for the dropdown/checkboxes.
    let foods = [];
    let proteins = [];
    try {
      const [f, p] = await Promise.all([
        CB.apiGet(`/api/restaurants/${rid}/foods`),
        CB.apiGet(`/api/restaurants/${rid}/proteins`),
      ]);
      foods = f.foods;
      proteins = p.proteins;
    } catch { /* modal still opens with empty selectors */ }

    const foodSel = document.getElementById('item-food');
    const proteinBox = document.getElementById('item-proteins');

    if (foods.length === 0) {
      foodSel.innerHTML = '<option value="">No foods yet…</option>';
      foodSel.disabled = true;
      document.getElementById('item-food-hint').classList.remove('hidden');
    } else {
      foodSel.disabled = false;
      document.getElementById('item-food-hint').classList.add('hidden');
      foodSel.innerHTML = '<option value="">Select a food…</option>' +
        foods.map((f) => `<option value="${f.id}">${f.name}</option>`).join('');
    }

    const checkedIds = new Set((item && Array.isArray(item.proteins) ? item.proteins : []).map((p) => p.id));
    if (proteins.length === 0) {
      proteinBox.innerHTML = '';
      document.getElementById('item-proteins-hint').classList.remove('hidden');
    } else {
      document.getElementById('item-proteins-hint').classList.add('hidden');
      proteinBox.innerHTML = proteins.map((p) => `
        <label class="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
          <input type="checkbox" value="${p.id}" class="protein-check accent-amber-500 w-4 h-4" ${checkedIds.has(p.id) ? 'checked' : ''} />
          ${p.name} <span class="text-xs font-bold text-amber-600">${CB.formatMoney(p.price)}</span>
          ${p.is_primary ? '<span class="text-[0.6rem] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">DEFAULT</span>' : ''}
        </label>`).join('');
    }

    document.getElementById('item-modal-title').textContent = item ? 'Edit menu item' : 'Add menu item';
    document.getElementById('item-id').value = item ? item.id : '';
    if (item && item.food_id) foodSel.value = String(item.food_id);
    document.getElementById('item-price').value = item ? item.price : '';
    document.getElementById('item-desc').value = item ? (item.description || '') : '';
    document.getElementById('item-available').checked = item ? Boolean(item.is_available) : true;

    // Photos: show existing set, clear the file input for a fresh selection.
    itemCurrentImages = item && Array.isArray(item.images) && item.images.length
      ? item.images
      : (item && item.image_url ? [item.image_url] : []);
    document.getElementById('item-images').value = '';
    renderItemImagePreviews();
    document.getElementById('item-modal').classList.remove('hidden');
  }

  document.getElementById('item-cancel').addEventListener('click', () => document.getElementById('item-modal').classList.add('hidden'));
  document.getElementById('item-images').addEventListener('change', renderItemImagePreviews);
  document.getElementById('rest-images').addEventListener('change', () => renderRestImagePreviews([]));
  document.getElementById('item-save').addEventListener('click', async () => {
    const id = document.getElementById('item-id').value;
    const btn = document.getElementById('item-save');
    const rid = selectedRestaurantId || restaurants[0].id;
    const foodId = document.getElementById('item-food').value;
    const price = Number(document.getElementById('item-price').value);
    const files = document.getElementById('item-images').files;

    if (!foodId) {
      CB.showToast('Select a food for the item (add foods in My Restaurant first).', 'error');
      return;
    }
    if (!(price >= 0)) {
      CB.showToast('A valid price is required.', 'error');
      return;
    }
    // STRICT: at least 2 photos — either from the existing set (edit,
    // no new files) or from the upload (create or replacement).
    const totalImages = (id ? itemCurrentImages.length : 0) + files.length;
    if (totalImages < 2) {
      CB.showToast('At least 2 photos are required for every menu item.', 'error');
      return;
    }
    if (files.length > 0 && files.length < 2) {
      CB.showToast('When replacing photos you must upload at least 2.', 'error');
      return;
    }

    const form = new FormData();
    form.append('food_id', foodId);
    form.append('price', String(price));
    form.append('description', document.getElementById('item-desc').value.trim() || '');
    form.append('is_available', document.getElementById('item-available').checked ? 'true' : 'false');
    // Repeated protein_ids fields — multer parses them into an array.
    document.querySelectorAll('#item-proteins .protein-check:checked').forEach((c) => form.append('protein_ids', c.value));
    for (const f of files) form.append('images', f);

    btn.disabled = true;
    try {
      if (id) await CB.apiPut(`/api/menu/${id}`, form);
      else await CB.apiPost(`/api/restaurants/${rid}/menu`, form);
      document.getElementById('item-modal').classList.add('hidden');
      CB.showToast(id ? 'Item updated.' : 'Item added!', 'success');
      await renderMenuItems();
    } catch (err) {
      CB.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  async function deleteItem(id) {
    if (!confirm('Delete this menu item?')) return;
    try {
      await CB.apiDelete(`/api/menu/${id}`);
      CB.showToast('Item deleted.', 'info');
      await renderMenuItems();
    } catch (err) {
      CB.showToast(err.message, 'error');
    }
  }

  async function toggleAvailability(id) {
    try {
      const current = await CB.apiGet(`/api/menu/${id}`);
      await CB.apiPut(`/api/menu/${id}`, { is_available: !current.item.is_available });
      await renderMenuItems();
    } catch (err) {
      CB.showToast(err.message, 'error');
    }
  }

  /* ================================================================
   * TAB 3 — ORDERS
   * ================================================================ */
  async function loadOrders(status = '') {
    const panel = document.getElementById('panel-orders');
    panel.innerHTML = `
      ${chipBar(status, ORDER_STATUSES, (s) => loadOrders(s))}
      ${status ? '' : `
      <div id="order-summary" class="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="font-extrabold text-amber-800">💰 Earnings (credited on delivery)</p>
          <p class="text-xs text-amber-700 mt-0.5">Money is paid to you only after the customer confirms delivery.</p>
        </div>
        <p class="font-extrabold text-2xl text-emerald-600" id="earnings-total">…</p>
      </div>`}
      <div id="order-list" class="space-y-4 stagger">
        <div class="skeleton h-32"></div><div class="skeleton h-32"></div>
      </div>`;

    try {
      const data = await CB.apiGet('/api/vendor/orders', { query: { status: status || undefined } });
      const list = document.getElementById('order-list');
      if (data.orders.length === 0) {
        list.innerHTML = '<p class="text-slate-400 text-center py-10">No orders yet.</p>';
      } else {
        list.innerHTML = data.orders.map(renderVendorOrderCard).join('');
        bindVendorOrderControls(list);
      }
      // Earnings = sum of totals where vendor_paid = 1 (delivered + paid out).
      const paid = data.orders.filter((o) => o.vendor_paid);
      const el = document.getElementById('earnings-total');
      if (el) {
        const sum = paid.reduce((s, o) => s + Number(o.total_amount), 0);
        el.textContent = `${CB.formatMoney(sum)}${paid.length ? ` · ${paid.length} order${paid.length > 1 ? 's' : ''} paid` : ''}`;
      }
    } catch (err) {
      panel.innerHTML = `<p class="text-red-500 text-center py-10">${err.message}</p>`;
    }
  }

  function renderVendorOrderCard(o) {
    const actions = VENDOR_ACTIONS[o.status] || [];
    const earned = o.vendor_paid ? '<span class="badge badge-delivered">Paid to you ✓</span>' : '';
    const waiting = o.status === 'ready_for_pickup'
      ? '<p class="text-xs text-slate-400 mt-2">⏳ Waiting for the customer to confirm delivery…</p>'
      : '';
    return `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 animate-slideUp">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="font-extrabold text-slate-800">#${o.id} · ${o.customer_name}</p>
            <p class="text-xs text-slate-400 mt-0.5">${o.customer_email} · ${new Date(o.created_at).toLocaleString()}</p>
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
          <span class="text-xs text-slate-400">${o.order_type}${o.delivery_address ? ' → ' + o.delivery_address : ''}${o.special_instructions ? ' · 📝 ' + o.special_instructions : ''}</span>
          <div class="flex items-center gap-3">
            <span class="font-extrabold text-amber-600">${CB.formatMoney(o.total_amount)}</span>
            ${actions.map((a) => `
              <button data-order="${o.id}" data-to="${a.to}" class="vendor-action-btn ${a.cls} text-xs font-bold px-4 py-2 rounded-lg transition-all duration-150 hover:scale-105 active:scale-95">
                ${a.label}
              </button>`).join('')}
          </div>
        </div>
        ${waiting}
      </div>`;
  }

  function bindVendorOrderControls(container) {
    container.querySelectorAll('.vendor-action-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.order;
        const to = btn.dataset.to;
        btn.disabled = true;
        btn.classList.add('opacity-60', 'cursor-wait');
        try {
          await CB.apiPut(`/api/orders/${orderId}/status`, { status: to });
          CB.showToast(`Order #${orderId} → ${to.replace(/_/g, ' ')}`, 'success');
          loadOrders();
        } catch (err) {
          CB.showToast(err.message, 'error');
          btn.disabled = false;
          btn.classList.remove('opacity-60', 'cursor-wait');
        }
      });
    });
  }

  /* ---------- boot ---------- */
  switchTab('restaurant');
  window.vendorDash = { switchTab, loadRestaurants, loadMenu, loadOrders };
})();