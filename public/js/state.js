/* ═══════════════════════════════════════════════════
   e-Merkato App State Manager
═══════════════════════════════════════════════════ */

const State = {
  // Auth
  user: null,
  stores: [],          // Seller's own stores

  // Current role
  role: 'buyer',       // 'buyer' | 'seller'
  currentTab: 'explore',
  currentStoreId: null,

  // Buyer state
  products: [],
  productTotal: 0,
  productPage: 1,
  activeFilter: 'all',
  searchQuery: '',
  sortBy: 'featured',

  // Cart: { shopId: { shopName, shopId, deliveryFee, returnPolicy, telebirrCode, items: [{product, qty}] } }
  cart: {},

  // Wishlisted product IDs
  wishlist: new Set(),

  // Addresses
  addresses: [],

  // Orders
  myOrders: [],
  storeOrders: [],     // For seller view

  // Notifications
  notifications: [],

  // Seller studio state
  sellerStats: null,
  sellerProducts: [],
  pendingDispatch: [],

  // ── Cart helpers ──────────────────────────────────
  cartCount() {
    return Object.values(this.cart).reduce((sum, pkg) => {
      return sum + pkg.items.reduce((s, i) => s + i.qty, 0);
    }, 0);
  },

  addToCart(product, qty = 1) {
    const shopId = product.store_id;
    if (!this.cart[shopId]) {
      this.cart[shopId] = {
        shopId,
        shopName: product.store_name,
        location: product.location_sub_city || '',
        returnPolicy: product.return_policy_type || 'no_return',
        deliveryFee: product.addis_delivery_fee || 150,
        telebirrCode: product.telebirr_merchant_id || '',
        chapaEnabled: product.chapa_enabled || false,
        cashEnabled: product.cash_on_delivery || true,
        items: []
      };
    }
    const pkg = this.cart[shopId];
    const existing = pkg.items.find(i => i.product.product_id === product.product_id);
    if (existing) {
      existing.qty += qty;
    } else {
      pkg.items.push({ product, qty });
    }
    this.saveCart();
  },

  removeFromCart(shopId, productId) {
    if (!this.cart[shopId]) return;
    this.cart[shopId].items = this.cart[shopId].items.filter(i => i.product.product_id !== productId);
    if (this.cart[shopId].items.length === 0) delete this.cart[shopId];
    this.saveCart();
  },

  updateQty(shopId, productId, qty) {
    if (!this.cart[shopId]) return;
    const item = this.cart[shopId].items.find(i => i.product.product_id === productId);
    if (!item) return;
    if (qty <= 0) {
      this.removeFromCart(shopId, productId);
    } else {
      item.qty = qty;
      this.saveCart();
    }
  },

  clearStoreCart(shopId) {
    delete this.cart[shopId];
    this.saveCart();
  },

  saveCart() {
    try {
      localStorage.setItem('em_cart', JSON.stringify(this.cart));
    } catch (e) {}
  },

  loadCart() {
    try {
      const saved = localStorage.getItem('em_cart');
      if (saved) this.cart = JSON.parse(saved);
    } catch (e) {
      this.cart = {};
    }
  },

  pkgSubtotal(shopId) {
    return this.cart[shopId]?.items.reduce((s, i) => s + i.product.price_etb * i.qty, 0) || 0;
  },

  pkgTotal(shopId) {
    const pkg = this.cart[shopId];
    if (!pkg) return 0;
    return this.pkgSubtotal(shopId) + (pkg.deliveryFee || 0);
  },

  policyLabel(type) {
    const map = {
      '7_day_free': '7-Day Free Return',
      '3_day_warranty': '3-Day Warranty',
      'size_exchange': 'Size Exchange',
      'fresh_guarantee': 'Freshness Guarantee',
      'no_return': 'No Returns'
    };
    return map[type] || type || 'Store Policy';
  },

  formatETB(amount) {
    return `Br ${Number(amount).toLocaleString('en-ET', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
};
