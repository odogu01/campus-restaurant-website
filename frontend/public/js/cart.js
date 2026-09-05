/**
 * cart.js — localStorage shopping cart.
 *
 * Cart shape:
 * { restaurantId, restaurantName, items: [{
 *     menuItemId, name, price, qty,
 *     proteins: [{ proteinId, name, price, qty }]
 *   }] }
 */
(function () {
  const KEY = 'uni_bites_cart';

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || null; } catch { return null; }
  }

  function saveCart(cart) {
    localStorage.setItem(KEY, JSON.stringify(cart));
  }

  /**
   * Add an item. Items from a different restaurant start a new cart.
   * Protein selections merge into an existing line (same menuItemId):
   * repeated proteins add their quantities together.
   * @param {{menuItemId:number, name:string, price:number, restaurantId:number, restaurantName:string, proteins?:Array<{proteinId:number, name:string, price:number, qty:number}>}} item
   */
  function addToCart(item) {
    let cart = loadCart();

    if (!cart || cart.restaurantId !== item.restaurantId) {
      cart = { restaurantId: item.restaurantId, restaurantName: item.restaurantName, items: [] };
    }

    const proteins = (item.proteins || []).filter((p) => p.qty > 0);

    const found = cart.items.find((i) => i.menuItemId === item.menuItemId);
    if (found) {
      found.qty += 1;
      found.proteins = found.proteins || [];
      proteins.forEach((np) => {
        const existing = found.proteins.find((p) => p.proteinId === np.proteinId);
        if (existing) existing.qty += np.qty;
        else found.proteins.push({ proteinId: np.proteinId, name: np.name, price: np.price, qty: np.qty });
      });
    } else {
      cart.items.push({
        menuItemId: item.menuItemId,
        name: item.name,
        price: item.price,
        qty: 1,
        proteins: proteins.map((p) => ({ ...p })),
      });
    }

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

  /**
   * Set a protein's quantity on a cart line.
   * qty <= 0 removes the protein from the line.
   */
  function setProteinQuantity(menuItemId, proteinId, qty) {
    const cart = loadCart();
    if (!cart) return null;
    const item = cart.items.find((i) => i.menuItemId === menuItemId);
    if (!item) return cart;
    item.proteins = item.proteins || [];
    const found = item.proteins.find((p) => p.proteinId === proteinId);
    if (!found) return cart;
    if (qty <= 0) item.proteins = item.proteins.filter((p) => p.proteinId !== proteinId);
    else found.qty = qty;
    saveCart(cart);
    return cart;
  }

  /** Total for one line: food + protein additions. */
  function getItemTotal(item) {
    const food = item.qty * item.price;
    const proteins = (item.proteins || []).reduce((s, p) => s + p.qty * p.price, 0);
    return food + proteins;
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
    return cart ? cart.items.reduce((s, i) => s + getItemTotal(i), 0) : 0;
  }

  function clearCart() {
    localStorage.removeItem(KEY);
  }

  window.UniBites.cart = {
    addToCart,
    removeFromCart,
    setQuantity,
    setProteinQuantity,
    getItemTotal,
    getCart,
    getCartItems,
    getCartCount,
    getCartTotal,
    clearCart,
  };
})();