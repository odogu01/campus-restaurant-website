/**
 * checkout.js — checkout page logic.
 *
 * - Renders the order summary from the localStorage cart.
 * - Toggles the delivery address field with the order-type radios.
 * - Submits POST /api/orders (payment is simulated — always 'paystack').
 * - On success: clears the cart, shows a success modal with the order ID,
 *   then redirects to orders.html after 3 seconds.
 */
(function () {
  const CB = window.UniBites;
  if (!CB) return;

  const cart = () => CB.cart.getCart();

  function renderSummary() {
    const current = cart();
    const total = CB.cart.getCartTotal();
    document.getElementById('summary-items').innerHTML = current.items
      .map((i) => {
        const proteins = (i.proteins || []).map((p) => `
          <div class="flex justify-between text-slate-400 text-xs pl-4">
            <span>↳ ${p.qty} × ${p.name}</span><span>${CB.formatMoney(p.qty * p.price)}</span>
          </div>`).join('');
        return `<div class="flex justify-between text-slate-600"><span>${i.qty} × ${i.name}</span><span>${CB.formatMoney(CB.cart.getItemTotal(i))}</span></div>${proteins}`;
      })
      .join('');
    document.getElementById('summary-total').textContent = CB.formatMoney(total);
    document.getElementById('pay-amount').textContent = total.toFixed(2);
  }

  function toggleAddressField(value) {
    document.getElementById('address-field').classList.toggle('hidden', value !== 'delivery');
  }

  async function placeOrder(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    const current = cart();

    // 1. Cart must have items.
    if (!current || current.items.length === 0) {
      CB.showToast('Your cart is empty.', 'error');
      setTimeout(() => { window.location.href = 'restaurants.html'; }, 800);
      return;
    }

    // 2. Must be logged in as a customer.
    const user = CB.getStoredUser();
    if (!user || !CB.getToken()) {
      CB.showToast('Please log in to place your order.', 'warning');
      setTimeout(() => { window.location.href = 'login.html'; }, 900);
      return;
    }

    const orderType = form.querySelector('input[name="orderType"]:checked').value;
    const deliveryAddress = document.getElementById('deliveryAddress').value.trim() || null;
    const specialInstructions = document.getElementById('specialInstructions').value.trim() || null;

    if (orderType === 'delivery' && !deliveryAddress) {
      CB.showToast('Please enter a delivery address.', 'error');
      return;
    }

    // 3. Submit.
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Placing order…';
    try {
      const data = await CB.apiPost('/api/orders', {
        restaurantId: current.restaurantId,
        items: current.items.map((i) => ({
          menuItemId: i.menuItemId,
          quantity: i.qty,
          proteins: (i.proteins || []).map((p) => ({ proteinId: p.proteinId, quantity: p.qty })),
        })),
        orderType,
        deliveryAddress,
        specialInstructions,
        paymentMethod: 'paystack', // simulated — no real Paystack call
      });

      // 4. Success — clear the cart and celebrate.
      CB.cart.clearCart();
      CB.updateCartBadge();

      showSuccessModal(data.orderId, data.status, data.paymentStatus);
    } catch (err) {
      CB.showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Place order — pay ₦' + CB.cart.getCartTotal().toFixed(2);
    }
  }

  /* ---------- Success modal + countdown redirect ---------- */
  function showSuccessModal(orderId, status, paymentStatus) {
    const modal = document.getElementById('success-modal');
    document.getElementById('success-order-id').textContent = '#' + orderId;
    document.getElementById('success-status').textContent = (status || 'pending').replace(/_/g, ' ');
    document.getElementById('success-payment').textContent = (paymentStatus || 'paid').toUpperCase();
    modal.classList.remove('hidden');

    let seconds = 3;
    const counter = document.getElementById('success-countdown');
    const timer = setInterval(() => {
      seconds -= 1;
      counter.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(timer);
        window.location.href = 'orders.html';
      }
    }, 1000);
  }

  /* ---------- Page init ---------- */
  CB.registerPage('checkout', function () {
    const current = cart();
    const emptyState = document.getElementById('empty-state');
    const content = document.getElementById('checkout-content');

    if (!current || current.items.length === 0) {
      emptyState.classList.remove('hidden');
      content.classList.add('hidden');
      return;
    }
    emptyState.classList.add('hidden');
    content.classList.remove('hidden');

    renderSummary();

    // Order-type radio → address field
    document.querySelectorAll('input[name="orderType"]').forEach((radio) =>
      radio.addEventListener('change', (e) => toggleAddressField(e.target.value))
    );

    document.getElementById('checkout-form').addEventListener('submit', placeOrder);
  });
})();