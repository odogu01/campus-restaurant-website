/**
 * foods.js — "All foods" page.
 *
 * Shows every available menu item from every active restaurant with
 * search, category chips and a restaurant filter. Each card links back
 * to its restaurant and can be added straight to the cart.
 */
(function () {
  const CB = window.CampusBites;
  if (!CB) return;

  const state = {
    search: '',
    category: '',
    restaurantId: '',
    items: [],       // last fetched items
    restaurants: [], // for the filter dropdown
  };

  const grid = document.getElementById('food-grid');
  const skel = document.getElementById('food-skeleton');
  const empty = document.getElementById('food-empty');

  /* ---------- Build the category chips from the fetched items ---------- */
  function renderCategoryChips() {
    const wrap = document.getElementById('food-cats');
    const counts = {};
    state.items.forEach((i) => {
      const cat = i.category || 'Other';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    const cats = Object.keys(counts).sort();
    const chip = (label, value) => `
      <button data-cat="${value}" class="chip px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
        state.category === value ? 'bg-amber-500 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:border-amber-400'
      }">${label}</button>`;
    wrap.innerHTML = [chip('All', ''), ...cats.map((c) => chip(`${c} (${counts[c]})`, c))].join('');
    wrap.querySelectorAll('.chip').forEach((b) =>
      b.addEventListener('click', () => {
        state.category = b.dataset.cat;
        fetchItems();
      })
    );
  }

  /* ---------- Restaurant filter dropdown ---------- */
  async function loadRestaurants() {
    try {
      const data = await CB.apiGet('/api/restaurants');
      state.restaurants = data.restaurants;
      const sel = document.getElementById('food-rest-select');
      sel.innerHTML = '<option value="">All restaurants</option>' + state.restaurants
        .map((r) => `<option value="${r.id}">${r.name}</option>`)
        .join('');
    } catch { /* dropdown stays empty — foods still load */ }
  }

  /* ---------- Fetch + render ---------- */
  async function fetchItems() {
    skel.classList.remove('hidden');
    grid.classList.add('hidden');
    empty.classList.add('hidden');
    try {
      const data = await CB.apiGet('/api/menu-items', {
        auth: false,
        query: {
          search: state.search || undefined,
          category: state.category || undefined,
          restaurantId: state.restaurantId || undefined,
        },
      });
      state.items = data.items;
      skel.classList.add('hidden');
      grid.classList.remove('hidden');
      renderCategoryChips(); // keep active chip + counts in sync with the results

      if (state.items.length === 0) {
        empty.classList.remove('hidden');
        grid.innerHTML = '';
        return;
      }

      grid.innerHTML = state.items.map((item) => `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-lg transition-shadow duration-300 animate-slideUp">
          <div class="h-40 bg-slate-100 relative">
            ${item.images && item.images.length
              ? `<img src="${item.images[0]}" class="w-full h-full object-cover" alt="${item.name}" onerror="this.style.display='none'">
                 <span class="absolute top-2 right-2 text-[0.65rem] font-bold bg-slate-800/80 text-white rounded-full px-2 py-0.5">${item.images.length} 📷</span>`
              : '<div class="w-full h-full flex items-center justify-center text-4xl">🍽️</div>'}
          </div>
          <div class="p-4">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <h3 class="font-bold text-slate-800 leading-tight">${item.name}</h3>
                <a href="menu.html?id=${item.restaurant_id}" class="text-xs text-amber-600 hover:text-amber-700 font-semibold">${item.restaurant_name} →</a>
              </div>
              <p class="font-extrabold text-amber-600 whitespace-nowrap">${CB.formatMoney(item.price)}</p>
            </div>
            ${item.description ? `<p class="text-sm text-slate-500 mt-1.5 line-clamp-2">${item.description}</p>` : ''}
            <div class="flex items-center justify-between mt-3">
              <span class="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">${item.category || 'Other'}</span>
              <button data-id="${item.id}" data-name="${item.name}" data-price="${item.price}"
                data-rest="${item.restaurant_id}" data-rest-name="${item.restaurant_name}"
                class="add-btn relative bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all duration-200 hover:scale-105">
                Add to cart
              </button>
            </div>
          </div>
        </div>
      `).join('');

      grid.querySelectorAll('.add-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          CB.cart.addToCart({
            menuItemId: Number(btn.dataset.id),
            name: btn.dataset.name,
            price: Number(btn.dataset.price),
            restaurantId: Number(btn.dataset.rest),
            restaurantName: btn.dataset.restName,
          });

          // Green flash + scale, then "+1" popup (same micro-interaction as menu.html).
          btn.classList.remove('flash');
          void btn.offsetWidth;
          btn.classList.add('flash');
          const pop = document.createElement('span');
          pop.className = 'add-pop';
          pop.textContent = '+1';
          btn.appendChild(pop);
          setTimeout(() => pop.remove(), 500);

          CB.updateCartBadge();
          CB.showToast(`${btn.dataset.name} added to cart`, 'success', 1400);
        });
      });
    } catch (err) {
      skel.classList.add('hidden');
      empty.textContent = err.message || 'Could not load foods.';
      empty.classList.remove('hidden');
      console.error(err);
    }
  }

  /* ---------- Wire up ---------- */
  document.getElementById('food-search').addEventListener('submit', (e) => {
    e.preventDefault();
    state.search = document.getElementById('food-search-input').value.trim();
    fetchItems();
  });
  document.getElementById('food-rest-select').addEventListener('change', (e) => {
    state.restaurantId = e.target.value;
    fetchItems();
  });

  CB.registerPage('foods', async function () {
    await Promise.all([loadRestaurants(), fetchItems()]);
  });
})();