/**
 * main.js — global site behaviour.
 *
 * - Renders the navbar + footer based on login status / role.
 * - Global logout.
 * - Toast notifications.
 * - Per-page initialisers (called from the page's own script or here).
 */
(function () {
  const CB = window.UniBites;
  if (!CB) {
    console.error('api.js must be loaded before main.js');
    return;
  }

  const currentPage = (window.location.pathname.split('/').pop() || 'index.html').replace('.html', '');

  /* ================= Toasts ================= */
  function showToast(message, type = 'success', ms = 3000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const icon = { success: '✔', error: '✖', info: 'ℹ', warning: '⚠' }[type] || 'ℹ';
    el.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    document.body.appendChild(el);

    setTimeout(() => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 300);
    }, ms);
  }

  /* ================= Navbar ================= */
  function renderNavbar() {
    const mount = document.getElementById('site-header');
    if (!mount) return;

    const user = CB.getStoredUser();
    const isLoggedIn = Boolean(user);

    // Determine the right dashboard link by role.
    let dashboardLink = '';
    if (user && user.role === 'admin') dashboardLink = 'admin-dashboard.html';
    else if (user && user.role === 'restaurant_owner') dashboardLink = 'vendor-dashboard.html';

    const links = `
      <a href="index.html" class="${currentPage === 'index' ? 'text-amber-400 font-semibold' : 'text-slate-600 hover:text-amber-600'} transition-colors duration-200">Home</a>
      <a href="restaurants.html" class="${currentPage === 'restaurants' ? 'text-amber-400 font-semibold' : 'text-slate-600 hover:text-amber-600'} transition-colors duration-200">Restaurants</a>
      <a href="foods.html" class="${currentPage === 'foods' ? 'text-amber-400 font-semibold' : 'text-slate-600 hover:text-amber-600'} transition-colors duration-200">Foods</a>
      <a href="orders.html" class="${currentPage === 'orders' ? 'text-amber-400 font-semibold' : 'text-slate-600 hover:text-amber-600'} transition-colors duration-200">My Orders</a>
      <a href="cart.html" class="relative text-slate-600 hover:text-amber-600 transition-colors duration-200" aria-label="Cart">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path>
        </svg>
        <span id="cart-count" class="hidden absolute -top-2 -right-3 text-[0.65rem] bg-amber-500 text-white rounded-full px-1.5 py-0.5 font-bold"></span>
      </a>
    `;

    let authArea;
    if (isLoggedIn) {
      authArea = `
        ${dashboardLink ? `<a href="${dashboardLink}" class="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors duration-200">Dashboard</a>` : ''}
        <button onclick="UniBites.logout()" class="text-sm font-semibold text-slate-600 hover:text-red-600 transition-colors duration-200">Logout</button>
        <span class="hidden md:inline text-sm text-slate-400">Hi, <span class="text-slate-600 font-medium">${(user.full_name || user.email || '').split(' ')[0]}</span></span>
      `;
    } else {
      authArea = `
        <a href="login.html" class="text-sm font-semibold text-slate-600 hover:text-amber-600 transition-colors duration-200">Login</a>
        <a href="register.html" class="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors duration-200">Sign Up</a>
      `;
    }

    mount.innerHTML = `
      <nav class="bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6">
          <div class="flex items-center justify-between h-16">
            <a href="index.html" class="flex items-center gap-2">
              <span class="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-white font-black text-lg shadow">🍔</span>
              <span class="text-xl font-extrabold text-slate-800 tracking-tight">Campus<span class="text-amber-500">Bites</span></span>
            </a>

            <!-- desktop links -->
            <div class="hidden md:flex items-center gap-6 text-sm">
              ${links}
              <div class="flex items-center gap-3 ml-2">${authArea}</div>
            </div>

            <!-- mobile hamburger -->
            <button id="menu-btn" class="md:hidden text-slate-600 p-2" aria-label="Menu">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
          </div>

          <!-- mobile menu -->
          <div id="mobile-menu" class="hidden md:hidden pb-4 space-y-3 text-sm">
            ${links}
            <div class="flex items-center gap-3 pt-2 border-t border-slate-100">${authArea}</div>
          </div>
        </div>
      </nav>
    `;

    const btn = document.getElementById('menu-btn');
    const menu = document.getElementById('mobile-menu');
    if (btn && menu) {
      btn.addEventListener('click', () => menu.classList.toggle('hidden'));
    }

    updateCartBadge();
  }

  /* ================= Cart badge ================= */
  function updateCartBadge() {
    const badge = document.getElementById('cart-count');
    if (!badge) return;
    const count = window.UniBites.cart ? window.UniBites.cart.getCartCount() : 0;
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  /* ================= Footer ================= */
  function renderFooter() {
    const mount = document.getElementById('site-footer');
    if (!mount) return;
    mount.innerHTML = `
      <footer class="bg-slate-900 text-slate-400 mt-16">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <p class="text-white font-extrabold text-lg mb-2">Campus<span class="text-amber-500">Bites</span></p>
            <p class="text-sm">Order from your favourite campus restaurants and pick up on your way to class.</p>
          </div>
          <div class="text-sm space-y-2">
            <p class="text-white font-semibold">Quick Links</p>
            <a href="restaurants.html" class="block hover:text-amber-400 transition-colors">Browse restaurants</a>
            <a href="vendor-register.html" class="block hover:text-amber-400 transition-colors">Open a restaurant</a>
            <a href="register.html" class="block hover:text-amber-400 transition-colors">Create an account</a>
          </div>
          <div class="text-sm space-y-2">
            <p class="text-white font-semibold">Hours</p>
            <p>Mon – Sat: 8:00am – 9:00pm</p>
            <p>Sun: 12:00pm – 7:00pm</p>
          </div>
        </div>
        <div class="border-t border-slate-800 py-4 text-center text-xs">
          © ${new Date().getFullYear()} UniBites · Demo project · Payments simulated
        </div>
      </footer>
    `;
  }

  /* ================= Logout ================= */
  function logout() {
    CB.clearAuth();
    showToast('Logged out.', 'info');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 400);
  }

  /* ================= Page initialisers registry ================= */
  const initialisers = {};

  function registerPage(name, fn) {
    initialisers[name] = fn;
  }

  function runInitialiser() {
    const fn = initialisers[currentPage];
    if (typeof fn === 'function') {
      Promise.resolve(fn()).catch((err) => {
        console.error('Page init error:', err);
        showToast('Something went wrong while loading this page: ' + (err && err.message ? err.message : err), 'error', 5000);
      });
    }
  }

  /* ================= Reveal-on-scroll ================= */
  function initReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    els.forEach((el) => io.observe(el));
  }

  /* ================= Global error surfacing =================
   * Any uncaught error or unhandled promise rejection is logged
   * to the console AND shown as an error toast, so failures are
   * never silent. */
  window.addEventListener('error', (event) => {
    const msg = event.message || 'Unknown error';
    console.error('[Uncaught error]', msg, 'at', event.filename || '?', 'line', event.lineno || '?');
    showToast('Something went wrong: ' + msg, 'error', 5000);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason && reason.message ? reason.message : String(reason);
    console.error('[Unhandled promise rejection]', reason);
    showToast('Something went wrong: ' + msg, 'error', 5000);
  });

  /* ================= Boot ================= */
  document.addEventListener('DOMContentLoaded', () => {
    renderNavbar();
    renderFooter();
    initReveal();
    runInitialiser();
  });

  /* Expose globals used by inline handlers */
  window.UniBites.showToast = showToast;
  window.UniBites.logout = logout;
  window.UniBites.registerPage = registerPage;
  window.UniBites.updateCartBadge = updateCartBadge;
  window.UniBites.currentPage = currentPage;
})();