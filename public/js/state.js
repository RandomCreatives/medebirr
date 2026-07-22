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
  profileSubSection: null,  // null = hub, 'profile'|'address'|'payment'|'orders'|'coupons'|'settings'|'help'|'privacy'
  sellerSettingsGroup: null,    // null = category list, else group key
  sellerSettingsSection: null,  // null = group list, else section key within group
  sellerNotifications: [],      // seller notification feed
  sellerUnread: 0,              // unread count for the seller bell
  sellerNotifView: false,       // true when showing the seller notification center
  notifUnread: 0,               // unread in-app notifications (buyer)

  // Language
  language: 'en',
  languages: ['en', 'am', 'or'],

  // Translation lookup. Delegates to the generated locale files loaded in
  // index.html (window.I18n.t). Falls back to English, then the key itself.
  t(key, vars) {
    if (window.I18n && window.I18n.t) return window.I18n.t(key, vars);
    return key;
  },

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
  wishlistItems: null,

  // Addresses
  addresses: [],

  // Orders
  myOrders: [],
  storeOrders: [],     // For seller view

  // Notifications
  notifications: [],

  // Payment methods (saved cards)
  paymentMethods: null,

  // User coupons
  userCoupons: null,

  // User settings
  userSettings: null,

  // Orders filter tab (for profile sub-section)
  ordersFilter: 'all',

  // Seller studio state
  sellerStats: null,
  sellerProducts: [],
  storeReviews: [],
  pendingProducts: [],
  sellerUnlocked: false,
  storeDetail: null,
  inventorySort: 'newest',
  inventoryFilter: 'all',
  couponPolicy: null,
  conversations: null,
  unreadCount: 0,
  coupons: null,

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
        physicalAddress: product.physical_address || '',
        returnPolicy: product.return_policy_type || 'no_return',
        deliveryFee: Number(product.addis_delivery_fee) || 150,
        freeDeliveryThreshold: Number(product.free_delivery_threshold) || 0,
        telebirrCode: product.telebirr_merchant_id || '',
        telebirrAccountName: product.telebirr_account_name || '',
        cbeAccountNumber: product.cbe_account_number || '',
        cbeAccountName: product.cbe_account_name || '',
        telebirrEnabled: product.telebirr_enabled !== false,
        cbeEnabled: product.cbe_enabled || false,
        cashEnabled: product.cash_on_delivery !== false,
        items: []
      };
    }
    const pkg = this.cart[shopId];
    const existing = pkg.items.find(i => i.product.product_id === product.product_id);
    const maxStock = Number(product.stock_quantity || 999);
    if (existing) {
      if ((existing.qty + qty) > maxStock) {
        existing.qty = maxStock;
        if (typeof App !== 'undefined' && typeof App.toast === 'function') {
          App.toast(`Only ${maxStock} units available in stock for ${product.title}!`, 'warning');
        }
      } else {
        existing.qty += qty;
      }
    } else {
      if (qty > maxStock) {
        pkg.items.push({ product, qty: maxStock });
        if (typeof App !== 'undefined' && typeof App.toast === 'function') {
          App.toast(`Only ${maxStock} units available in stock for ${product.title}!`, 'warning');
        }
      } else {
        pkg.items.push({ product, qty });
      }
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
      const maxStock = Number(item.product.stock_quantity || 999);
      if (qty > maxStock) {
        item.qty = maxStock;
        if (typeof App !== 'undefined' && typeof App.toast === 'function') {
          App.toast(`Maximum stock reached (${maxStock} units)`, 'warning');
        }
      } else {
        item.qty = qty;
      }
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
      if (saved) {
        this.cart = JSON.parse(saved);
        // Ensure all deliveryFees are numeric (may have been saved as strings)
        Object.values(this.cart).forEach(pkg => {
          pkg.deliveryFee = Number(pkg.deliveryFee) || 150;
        });
      }
    } catch (e) {
      this.cart = {};
    }
  },

  pkgSubtotal(shopId) {
    return this.cart[shopId]?.items.reduce((s, i) => s + Number(i.product.price_etb) * i.qty, 0) || 0;
  },

  pkgTotal(shopId) {
    const pkg = this.cart[shopId];
    if (!pkg) return 0;
    return this.pkgSubtotal(shopId) + Number(pkg.deliveryFee || 0);
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
