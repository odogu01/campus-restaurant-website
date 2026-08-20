/**
 * auth.js — form handlers for login, registration and vendor requests.
 *
 * Uses the shared api.js wrapper (which attaches tokens automatically).
 * On success: stores token + user, redirects by role.
 */
(function () {
  const CB = window.CampusBites;
  if (!CB) return;

  /* Small helper: spinner state on a submit button */
  function setSubmitting(btn, busy, label) {
    if (busy) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="btn-spinner"></span> ${label || 'Please wait...'}`;
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.label || btn.innerHTML;
    }
  }

  function handleError(err) {
    const msg = err && err.message ? err.message : 'Something went wrong.';
    CB.showToast(msg, 'error');
  }

  /* ================= LOGIN ================= */
  async function handleLogin(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    setSubmitting(btn, true);

    try {
      const data = await CB.apiPost('/api/auth/login', {
        email: form.email.value.trim(),
        password: form.password.value,
      });
      CB.setToken(data.token);
      CB.setStoredUser(data.user);
      CB.showToast(`Welcome back, ${data.user.full_name || 'friend'}!`, 'success');

      const dest =
        data.user.role === 'admin' ? 'admin-dashboard.html'
        : data.user.role === 'restaurant_owner' ? 'vendor-dashboard.html'
        : 'index.html';
      setTimeout(() => { window.location.href = dest; }, 700);
    } catch (err) {
      handleError(err);
    } finally {
      setSubmitting(btn, false);
    }
  }

  /* ================= REGISTER (customer) ================= */
  async function handleRegister(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');

    if (form.password.value !== form.confirmPassword.value) {
      CB.showToast('Passwords do not match.', 'error');
      return;
    }

    setSubmitting(btn, true);
    try {
      const data = await CB.apiPost('/api/auth/register', {
        full_name: form.fullName.value.trim(),
        email: form.email.value.trim(),
        password: form.password.value,
        phone: form.phone.value.trim() || null,
      });
      CB.setToken(data.token);
      CB.setStoredUser(data.user);
      CB.showToast('Account created — welcome to Campus Bites!', 'success');
      setTimeout(() => { window.location.href = 'index.html'; }, 800);
    } catch (err) {
      handleError(err);
    } finally {
      setSubmitting(btn, false);
    }
  }

  /* ================= VENDOR REQUEST ================= */
  async function handleVendorRegister(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    setSubmitting(btn, true);

    try {
      const data = await CB.apiPost('/api/vendor-requests', {
        email: form.email.value.trim(),
        restaurantName: form.restaurantName.value.trim(),
        description: form.description.value.trim() || null,
        phone: form.phone.value.trim() || null,
      });
      CB.showToast('Request submitted! You will be emailed once an admin approves.', 'success');
      form.reset();
      // Show a friendly confirmation panel.
      const panel = document.getElementById('success-panel');
      if (panel) panel.classList.remove('hidden');
    } catch (err) {
      handleError(err);
    } finally {
      setSubmitting(btn, false);
    }
  }

  /* ================= SHOW/HIDE PASSWORD ================= */
  /* Clickable eye icon on every [data-toggle-password] button. */
  function initPasswordToggles() {
    document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        const open = btn.querySelector('[data-icon-open]');
        const closed = btn.querySelector('[data-icon-closed]');
        if (open) open.classList.toggle('hidden', show);
        if (closed) closed.classList.toggle('hidden', !show);
        // Keep the caret where the user was typing.
        input.focus({ preventScroll: true });
        const len = input.value.length;
        try { input.setSelectionRange(len, len); } catch { /* not focusable */ }
      });
    });
  }

  /* Wire forms on page load */
  document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    const vendorForm = document.getElementById('vendor-register-form');

    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (regForm) regForm.addEventListener('submit', handleRegister);
    if (vendorForm) vendorForm.addEventListener('submit', handleVendorRegister);

    initPasswordToggles();
  });
})();