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

  // Language
  language: 'en',
  languages: ['en', 'am', 'or'],
  _i18n: {
    en: {
      appTitle: 'Medebirr', appTagline: "Ethiopia's Marketplace",
      tabExplore: 'Explore', tabWishlist: 'Wishlist', tabCart: 'Cart', tabProfile: 'Profile',
      searchPlaceholder: 'Search shops, items, or locations...',
      filterAll: 'All', filterElectronics: '📱 Electronics', filterFashion: '👗 Fashion', filterFood: '☕ Food & Coffee', filterFootwear: '👟 Footwear',
      addToCart: '+ Add to Cart', viewAll: 'View All', featuredItems: 'Featured Items',
      profile: 'Your Profile', address: 'Manage Address', payment: 'Payment Methods', orders: 'My Orders',
      coupons: 'My Coupons', settings: 'Settings', help: 'Help Center', privacy: 'Privacy Policy',
      badgeShops: 'Verified Shops', badgeSeller: 'Seller Studio',
      emptyWishlist: 'No items saved yet', emptyWishlistDesc: 'Tap the heart on any product to save it here.',
      emptyCart: 'Your cart is empty', emptyCartDesc: 'Browse products and add your favorites.',
      checkout: 'Checkout', orderPlaced: 'Order Placed!',
      save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', apply: 'Apply', confirm: 'Confirm',
      notifTitle: 'Notifications', notifEmpty: 'No notifications yet',
    },
    am: {
      appTitle: 'መደብር', appTagline: 'የኢትዮጵያ ገበያ',
      tabExplore: 'መፈለግ', tabWishlist: 'ተወዳጅ', tabCart: 'ጋረድ', tabProfile: 'መገለጫ',
      searchPlaceholder: 'ሱቆችን፣ ምርቶችን ወይም ቦታዎችን ይፈልጉ...',
      filterAll: 'ሁሉም', filterElectronics: '📱 ኤሌክትሮኒክስ', filterFashion: '👗 ፋሽን', filterFood: '☕ ምግብ እና ቡና', filterFootwear: '👟 ጉም茠ክ',
      addToCart: '+ ወደ ጋረድ ጨምር', viewAll: 'ሁሉንም ይመልከቱ', featuredItems: 'ተወዳጅ ምርቶች',
      profile: 'የእርስዎ መገለጫ', address: 'አድራሻ ያስተካክሉ', payment: 'የክፍያ ዘዴዎች', orders: 'ፍርዎቼ',
      coupons: 'ኩፖኖቼ', settings: 'ማስተካከያ', help: 'የእገዛ ማዕከል', privacy: 'የግላዊነት ፖሊሲ',
      badgeShops: 'የተረጋገጡ ሱቆች', badgeSeller: 'የሸጋ归来 ስ튜ዲዮ',
      emptyWishlist: 'ተስፋፋ ያልተመዘገቡ ምርቶች የሉም', emptyWishlistDesc: 'ማንኛውንም ምርት ላይ ልብ ጠቅ በማድረግ እዚህ ያስቀምጡ።',
      emptyCart: 'ጋረድዎ ባዶ ነው', emptyCartDesc: 'ምርቶችን ያስሱ ሻጮችንም ያክሉ።',
      checkout: 'ክፍል', orderPlaced: 'ትዕዛዙ ቀርቧል!',
      save: 'አስቀምጥ', cancel: 'ሰርዝ', delete: 'አጥፋ', edit: 'ተካክል', apply: 'ተግብር', confirm: 'ያረጋግጡ',
      notifTitle: 'ማሳወቂያዎች', notifEmpty: 'ማሳወቂያ የለም',
    },
    or: {
      appTitle: 'Medebirr', appTagline: "Balka Itoophiyaa",
      tabExplore: 'Ilaali', tabWishlist: 'Jaalalaa', tabCart: 'Kabaja', tabProfile: 'Babajii',
      searchPlaceholder: 'Makaa, nafaallee fi naanna qoradhu...',
      filterAll: 'Hunda', filterElectronics: '📱 Elektrooniksii', filterFashion: 'ashion', filterFood: '☕ Nanni fi Bunaa', filterFootwear: '👟 Foonii',
      addToCart: '+ Kabaja irratti geessi', viewAll: 'Hunda ilaali', featuredItems: 'Nafaallee',
      profile: 'Babajii Keessan', address: 'Teessoo Jijjiiraa', payment: 'Kaffaltii', orders: 'Ajajoota Koo',
      coupons: 'Kuuponii Koo', settings: 'Qindaawii', help: 'Gargaarsa', privacy: 'Dhuunfaa',
      badgeShops: 'Makaa Dhugaa', badgeSeller: 'Gabaa Iyyuu',
      emptyWishlist: 'Nafaallee hin qabamu', emptyWishlistDesc: 'Madda irratti qabduu dhiisuun kana keessa qabnaa.',
      emptyCart: 'Kabaja keessan duwwaa dha', emptyCartDesc: 'Nafaallee ilaaliin geessi.',
      checkout: 'Isa Gurgurtaa', orderPlaced: 'Ajajni Ta\'e!',
      save: 'Qabnaa', cancel: 'Haquu', delete: 'Haqi', edit: 'Jijjiiraa', apply: 'Fayyadami', confirm: 'Mirkaneessaa',
      notifTitle: 'Beeksiisee', notifEmpty: 'Beeksiisee hin jiru',
    }
  },

  t(key) { return this._i18n[this.language]?.[key] || this._i18n.en[key] || key; },

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
        deliveryFee: Number(product.addis_delivery_fee) || 150,  // Always numeric
        telebirrCode: product.telebirr_merchant_id || '',
        chapaEnabled: product.chapa_enabled || false,
        cashEnabled: product.cash_on_delivery !== false,
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
