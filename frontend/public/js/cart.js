/**
 * cart.js — localStorage shopping cart.
 *
 * Cart shape: { restaurantId, restaurantName, items: [{ menuItemId, name, price, qty }] }
 * Phase 8 builds cart.html rendering + checkout on top of this.
 */
(function () {
  const KEY = 'campus_bites_cart';

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || null; } catch { return null; }
  }

  function saveCart(cart) {
    localStorage.setItem(KEY, JSON.stringify(cart));
  }

  /**
   * Add an item. Items from a different restaurant start a new cart.
   * @param {{menuItemId:number, name:string, price:number, restaurantId:number, restaurantName:string}} item
   */
  function addToCart(item) {
    let cart = loadCart();

    if (!cart || cart.restaurantId !== item.restaurantId) {
      cart = { restaurantId: item.restaurantId, restaurantName: item.restaurantName, items: [] };
    }

    const found = cart.items.find((i) => i.menuItemId === item.menuItemId);
    if (found) found.qty += 1;
    else cart.items.push({ menuItemId: item.menuItemId, name: item.name, price: item.price, qty: 1 });

    saveCart(cart);
    return cart;
  }

  function removeFromCart(menuItemId) {
    const cart = loadCart();
    if (!cart) return null;
    cart.items = cart.items.filter((i) => i.menuItemId !== menuItemId);
    if (cart.items.length === 0) {
      clearCart();
      return null;
    }
    saveCart(cart);
    return cart;
  }

  function setQuantity(menuItemId, qty) {
    const cart = loadCart();
    if (!cart) return null;
    const item = cart.items.find((i) => i.menuItemId === menuItemId);
    if (!item) return cart;
    if (qty <= 0) return removeFromCart(menuItemId);
    item.qty = qty;
    saveCart(cart);
    return cart;
  }

  function getCart() {
    return loadCart();
  }

  // Alias matching the Phase 8 spec name.
  function getCartItems() {
    return loadCart();
  }

  function getCartCount() {
    const cart = loadCart();
    return cart ? cart.items.reduce((s, i) => s + i.qty, 0) : 0;
  }

  function getCartTotal() {
    const cart = loadCart();
    return cart ? cart.items.reduce((s, i) => s + i.qty * i.price, 0) : 0;
  }

  function clearCart() {
    localStorage.removeItem(KEY);
  }

  window.CampusBites.cart = {
    addToCart,
    removeFromCart,
    setQuantity,
    getCart,
    getCartItems,
    getCartCount,
    getCartTotal,
    clearCart,
  };
})();