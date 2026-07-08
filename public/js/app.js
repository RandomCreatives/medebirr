/* ═══════════════════════════════════════════════════
   e-Merkato App Controller
   Orchestrates auth, navigation, events, and API calls
═══════════════════════════════════════════════════ */

const App = {

  // ── Bootstrap ─────────────────────────────────────
  async init() {
    // Initialize Telegram WebApp
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }

    // Load persisted cart
    State.loadCart();

    try {
      await this.authenticate();
      await this.loadInitialData();
    } catch (err) {
      console.warn('API unavailable, running in offline mode:', err.message);
      // Set a guest user so the UI renders regardless
      if (!State.user) {
        State.user = {
          firstName: 'Guest',
          lastName: '',
          username: 'guest',
          tier: 'standard',
          isSeller: false,
          walletPoints: 0
        };
      }
      // Load demo products from static data so UI isn't empty
      State.products = this._demoProducts();
      State.offlineMode = true;
    }

    this.showApp();
    this.render();

    // Show a soft banner if offline, not a hard crash
    if (State.offlineMode) {
      setTimeout(() => this.toast('⚠️ Database not connected — set DATABASE_URL in Vercel', 'error'), 800);
    }
  },

  // Static demo products shown when DB is unreachable
  _demoProducts() {
    return [
      { product_id: 'demo-1', title: 'Apple iPhone 15 Pro Max (256GB)', price_etb: 165000, compare_price: 170000, stock_quantity: 8, category: 'electronics', store_id: 'demo-store-1', store_name: 'Bole Apple & Tech Hub', location_sub_city: 'Bole', verified_badge: true, return_policy_type: '3_day_warranty', addis_delivery_fee: 200, cash_on_delivery: true, telebirr_enabled: true, rating: 4.9, rating_count: 312 },
      { product_id: 'demo-2', title: 'Sony WH-1000XM5 Headphones', price_etb: 28500, stock_quantity: 15, category: 'electronics', store_id: 'demo-store-1', store_name: 'Bole Apple & Tech Hub', location_sub_city: 'Bole', verified_badge: true, return_policy_type: '3_day_warranty', addis_delivery_fee: 200, cash_on_delivery: true, telebirr_enabled: true, rating: 4.8, rating_count: 180 },
      { product_id: 'demo-3', title: 'Traditional Habesha Kemis – Women', price_etb: 4500, stock_quantity: 40, category: 'fashion', store_id: 'demo-store-2', store_name: 'Shiro Meda Heritage Textile', location_sub_city: 'Gulele', verified_badge: true, return_policy_type: '7_day_free', addis_delivery_fee: 150, cash_on_delivery: true, telebirr_enabled: true, rating: 4.9, rating_count: 620 },
      { product_id: 'demo-4', title: 'Organic Sidama Coffee Beans (1kg)', price_etb: 950, stock_quantity: 200, category: 'groceries', store_id: 'demo-store-3', store_name: 'Kaffa & Sidama Direct Roastery', location_sub_city: 'Kirkos', verified_badge: true, return_policy_type: 'fresh_guarantee', addis_delivery_fee: 100, cash_on_delivery: true, telebirr_enabled: true, rating: 5.0, rating_count: 1850 },
      { product_id: 'demo-5', title: 'Nike Air Zoom Pegasus 40', price_etb: 6800, stock_quantity: 35, category: 'fashion', store_id: 'demo-store-4', store_name: 'Merkato Premium Footwear', location_sub_city: 'Addis Ketema', verified_badge: true, return_policy_type: 'size_exchange', addis_delivery_fee: 150, cash_on_delivery: true, telebirr_enabled: true, rating: 4.7, rating_count: 890 },
      { product_id: 'demo-6', title: 'Yirgacheffe Natural Grade 1 (500g)', price_etb: 650, stock_quantity: 150, category: 'groceries', store_id: 'demo-store-3', store_name: 'Kaffa & Sidama Direct Roastery', location_sub_city: 'Kirkos', verified_badge: true, return_policy_type: 'fresh_guarantee', addis_delivery_fee: 100, cash_on_delivery: true, telebirr_enabled: true, rating: 5.0, rating_count: 1200 }
    ];
  },

  async authenticate() {
    let initData;

    if (window.Telegram?.WebApp?.initData) {
      initData = window.Telegram.WebApp.initData;
    } else {
      // Demo mode — use mock user
      const demoUserId = localStorage.getItem('em_demo_user') || '12893412';
      initData = `mock:${demoUserId}`;
    }

    const existingToken = Api.getToken();
    if (existingToken) {
      try {
        const meData = await Api.users.me();
        State.user = meData.user;
        State.stores = meData.stores || [];
        if (State.stores.length > 0) {
          State.currentStoreId = State.stores[0].store_id;
        }
        return;
      } catch (err) {
        Api.clearToken();
      }
    }

    const authData = await Api.auth.telegram(initData);
    Api.setToken(authData.token);
    State.user = authData.user;
    State.stores = authData.user.stores || [];
    if (State.stores.length > 0) {
      State.currentStoreId = State.stores[0].store_id;
    }
  },

  async loadInitialData() {
    const [productsData, addressesData] = await Promise.all([
      Api.products.list({ sort: 'featured', limit: 20 }),
      Api.users.addresses().catch(() => ({ addresses: [] }))
    ]);
    State.products = productsData.products || [];
    State.productTotal = productsData.total || 0;
    State.addresses = addressesData.addresses || [];
  },

  showApp() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('app').style.flexDirection = 'column';

    // Update header
    const user = State.user;
    if (user) {
      document.getElementById('userAvatar').textContent = (user.firstName || 'U')[0].toUpperCase();
      document.getElementById('headerUsername').textContent = `${user.firstName} ${user.lastName || ''}`.trim();
      document.getElementById('headerLocation').textContent = 'Addis Ababa, Ethiopia';
    }
  },

  showError(message) {
    document.getElementById('loadingScreen').innerHTML = `
      <div style="text-align:center;padding:30px;">
        <div style="font-size:40px;margin-bottom:12px;">⚠️</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:8px;">Connection Error</div>
        <div style="font-size:13px;color:#9DA3AE;margin-bottom:20px;">${message}</div>
        <button onclick="location.reload()" style="background:#FCCD04;color:#111;padding:12px 24px;border:none;border-radius:12px;font-weight:800;cursor:pointer;font-size:14px;">
          Retry
        </button>
      </div>
    `;
  },

  // ── Render ────────────────────────────────────────
  render() {
    this.renderRoleBar();
    this.renderNavigation();
    this.renderContent();
  },

  renderRoleBar() {
    const badge = document.getElementById('roleBadge');
    const sub = document.getElementById('roleSub');
    const btn = document.getElementById('roleSwitchBtn');
    const isSeller = State.user?.isSeller && State.stores.length > 0;

    if (State.role === 'buyer') {
      badge.className = 'role-badge buyer-badge';
      badge.textContent = '🛒 Buyer Hub';
      sub.textContent = '1,000+ Verified Ethiopian Shops';
      btn.innerHTML = isSeller ? 'Seller Studio <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>' : '';
      btn.style.display = isSeller ? 'flex' : 'none';
    } else {
      badge.className = 'role-badge seller-badge';
      badge.textContent = '🏬 Seller Studio';
      sub.textContent = State.stores[0]?.store_name || 'Your Shop';
      btn.innerHTML = 'Buyer Hub <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>';
      btn.style.display = 'flex';
    }
  },

  renderNavigation() {
    const nav = document.getElementById('bottomNav');
    const cartCount = State.cartCount();

    if (State.role === 'buyer') {
      nav.innerHTML = `
        <button class="nav-item ${State.currentTab==='explore'?'active':''}" onclick="App.switchTab('explore')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Explore
        </button>
        <button class="nav-item ${State.currentTab==='cart'?'active':''}" onclick="App.switchTab('cart')">
          ${cartCount > 0 ? `<span class="nav-badge">${cartCount}</span>` : ''}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          Cart
        </button>
        <button class="nav-item ${State.currentTab==='wishlist'?'active':''}" onclick="App.switchTab('wishlist')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          Saved
        </button>
        <button class="nav-item ${State.currentTab==='orders'?'active':''}" onclick="App.switchTab('orders')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Deliveries
        </button>
      `;
    } else {
      const pendingCount = State.storeOrders.filter(o => o.order_status === 'confirmed' && o.payment_status === 'paid').length;
      nav.innerHTML = `
        <button class="nav-item ${State.currentTab==='dashboard'?'active':''}" onclick="App.switchTab('dashboard')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          Sales Hub
        </button>
        <button class="nav-item ${State.currentTab==='inventory'?'active':''}" onclick="App.switchTab('inventory')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
          My Items
        </button>
        <button class="nav-item ${State.currentTab==='policy'?'active':''}" onclick="App.switchTab('policy')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Policy
        </button>
        <button class="nav-item ${State.currentTab==='dispatch'?'active':''}" onclick="App.switchTab('dispatch')">
          ${pendingCount > 0 ? `<span class="nav-badge">${pendingCount}</span>` : ''}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          Dispatch
        </button>
      `;
    }
  },

  renderContent() {
    const body = document.getElementById('appBody');
    if (State.role === 'buyer') {
      if (State.currentTab === 'explore') BuyerViews.renderExplore(body);
      else if (State.currentTab === 'cart') BuyerViews.renderCart(body);
      else if (State.currentTab === 'wishlist') BuyerViews.renderWishlist(body);
      else if (State.currentTab === 'orders') BuyerViews.renderOrders(body);
    } else {
      if (State.currentTab === 'dashboard') SellerViews.renderDashboard(body);
      else if (State.currentTab === 'inventory') SellerViews.renderInventory(body);
      else if (State.currentTab === 'policy') SellerViews.renderPolicy(body);
      else if (State.currentTab === 'dispatch') SellerViews.renderDispatch(body);
    }
    document.getElementById('appBody').scrollTop = 0;
  },

  // ── Navigation ────────────────────────────────────
  async switchTab(tab) {
    State.currentTab = tab;
    // Lazy-load tab data on first visit
    if (tab === 'orders' && !State.myOrders.length) {
      await this.refreshOrders();
    }
    if (tab === 'wishlist' && !State.wishlistItems) {
      try {
        const data = await Api.users.wishlist();
        State.wishlistItems = data.wishlist || [];
        // Sync wishlist IDs into the Set for fast lookup
        State.wishlist = new Set(State.wishlistItems.map(p => p.product_id));
      } catch (e) {
        State.wishlistItems = [];
      }
    }
    if (tab === 'dispatch' && State.role === 'seller' && !State.storeOrders.length) {
      await this.loadSellerData();
    }
    this.render();
  },

  async toggleRole() {
    State.role = State.role === 'buyer' ? 'seller' : 'buyer';
    State.currentTab = State.role === 'buyer' ? 'explore' : 'dashboard';
    if (State.role === 'seller') {
      await this.loadSellerData();
    }
    this.render();
  },

  async loadSellerData() {
    if (!State.currentStoreId) return;
    try {
      const [statsData, productsData, ordersData] = await Promise.all([
        Api.stores.stats(State.currentStoreId),
        Api.products.list({ store_id: State.currentStoreId, limit: 50 }),
        Api.orders.storeOrders(State.currentStoreId, { limit: 50 })
      ]);
      State.sellerStats = statsData;
      State.sellerProducts = productsData.products || [];
      State.storeOrders = ordersData.orders || [];
    } catch (err) {
      this.toast('Failed to load seller data', 'error');
    }
  },

  async loadSellerStats() {
    if (!State.currentStoreId) return;
    try {
      State.sellerStats = await Api.stores.stats(State.currentStoreId);
      this.renderContent();
    } catch (err) {}
  },

  // ── Product Actions ───────────────────────────────
  async openProduct(productId) {
    try {
      const data = await Api.products.get(productId);
      Modals.openProductDetail(data.product);
    } catch (err) {
      // Fallback to catalog data
      const product = State.products.find(p => p.product_id === productId);
      if (product) Modals.openProductDetail(product);
    }
  },

  handleSearch(val) {
    State.searchQuery = val;
    this._fetchProducts();
  },

  handleFilter(filter) {
    State.activeFilter = filter;
    State.searchQuery = '';
    this._fetchProducts();
  },

  handleSort(sort) {
    State.sortBy = sort;
    this._fetchProducts();
  },

  async _fetchProducts() {
    const params = { sort: State.sortBy, limit: 20 };
    if (State.activeFilter !== 'all') params.category = State.activeFilter;
    if (State.searchQuery) params.search = State.searchQuery;
    try {
      const data = await Api.products.list(params);
      State.products = data.products || [];
      this.renderContent();
    } catch (err) {
      this.toast('Search failed', 'error');
    }
  },

  addToCart(productId) {
    const product = State.products.find(p => p.product_id === productId)
      || State.wishlistItems?.find(p => p.product_id === productId);
    if (!product) return;
    if (product.stock_quantity <= 0) { this.toast('Out of stock', 'error'); return; }
    State.addToCart(product);
    this.renderNavigation();
    this.toast(`Added to cart!`, 'success');
  },

  updateQty(shopId, productId, qty) {
    State.updateQty(shopId, productId, qty);
    this.renderNavigation();
    this.renderContent();
  },

  async toggleWishlist(productId) {
    if (State.wishlist.has(productId)) {
      State.wishlist.delete(productId);
      await Api.users.removeWishlist(productId).catch(() => {});
      this.toast('Removed from saved', 'info');
    } else {
      State.wishlist.add(productId);
      await Api.users.addWishlist(productId).catch(() => {});
      this.toast('Saved!', 'success');
    }
  },

  // ── Order Placement ───────────────────────────────
  async placeOrder(shopId) {
    const policyAgreement = document.getElementById('policyAgreement');
    if (!policyAgreement?.checked) {
      this.toast('Please agree to the store policy to proceed', 'error');
      return;
    }

    const pkg = State.cart[shopId];
    const paymentMethod = document.querySelector('input[name="payMethod"]:checked')?.value || 'telebirr';
    const addressSelect = document.getElementById('checkoutAddress');
    const addressId = addressSelect?.value;

    let deliveryAddress;
    if (!addressId || addressId === 'new') {
      const subCity = document.getElementById('newSubCity')?.value;
      const woreda = document.getElementById('newWoreda')?.value;
      const house = document.getElementById('newHouse')?.value;
      const phone = document.getElementById('newPhone')?.value;
      if (!subCity || !phone) { this.toast('Sub-city and phone are required', 'error'); return; }
      deliveryAddress = { sub_city: subCity, woreda, house_number: house, phone };
    } else {
      const addr = State.addresses.find(a => a.address_id === addressId);
      deliveryAddress = { sub_city: addr.sub_city, woreda: addr.woreda, house_number: addr.house_number, landmark: addr.landmark, phone: addr.phone };
    }

    const items = pkg.items.map(i => ({ product_id: i.product.product_id, quantity: i.qty }));

    try {
      this.toast('Placing order...', 'info');
      const orderData = await Api.orders.create({ store_id: shopId, items, delivery_address: deliveryAddress, payment_method: paymentMethod, address_id: addressId !== 'new' ? addressId : undefined });
      const order = orderData.order;

      if (paymentMethod === 'telebirr') {
        const payData = await Api.payments.initiateTelebirr(order.order_id);
        if (payData.toPayUrl && !payData.toPayUrl.includes('mock-payment')) {
          window.open(payData.toPayUrl, '_blank');
        }
        Modals.showPaymentProcessing(payData.txRef, order.total_etb, order.store?.telebirr_merchant_id);
        this._pendingOrderId = order.order_id;
        this._pendingStoreId = shopId;
        this._pendingOrderRef = order.order_ref;
        this._pendingStoreName = order.store?.store_name;
      } else if (paymentMethod === 'cash') {
        await Api.payments.confirmCash(order.order_id);
        State.clearStoreCart(shopId);
        this.renderNavigation();
        Modals.showOrderConfirmed(order.order_ref, order.store?.store_name || pkg.shopName);
        this.refreshOrders();
      }
    } catch (err) {
      this.toast(err.message || 'Order failed', 'error');
    }
  },

  async simulatePaymentSuccess(txRef) {
    // Demo mode: simulate webhook callback
    if (this._pendingOrderId) {
      try {
        await fetch('/api/v1/payments/telebirr/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outTradeNo: txRef, transactionNo: `TX-${Date.now()}`, tradeStatus: 'SUCCESS', sign: 'demo' })
        });
        State.clearStoreCart(this._pendingStoreId);
        this.renderNavigation();
        Modals.showOrderConfirmed(this._pendingOrderRef, this._pendingStoreName || 'Store');
        this.refreshOrders();
      } catch (err) {
        this.toast('Payment simulation failed', 'error');
      }
    }
  },

  async refreshOrders() {
    try {
      const data = await Api.orders.list();
      State.myOrders = data.orders || [];
    } catch (err) {}
  },

  async confirmDelivery(orderId) {
    try {
      await Api.orders.confirmDelivery(orderId);
      this.toast('Delivery confirmed! Warranty period started.', 'success');
      await this.refreshOrders();
      this.renderContent();
    } catch (err) {
      this.toast(err.message, 'error');
    }
  },

  async openOrderDetail(orderId) {
    try {
      const data = await Api.orders.get(orderId);
      const o = data.order;
      const addr = typeof o.delivery_address === 'string' ? JSON.parse(o.delivery_address) : o.delivery_address;
      const addrStr = [addr.sub_city, addr.woreda, addr.house_number, addr.landmark].filter(Boolean).join(', ');
      const policy = typeof o.policy_snapshot === 'string' ? JSON.parse(o.policy_snapshot) : o.policy_snapshot;
      Modals.open(`
        <div class="modal-handle"></div>
        <div class="modal-title">${o.order_ref}</div>
        <span class="order-status-badge status-${o.order_status}" style="margin-bottom:12px;display:inline-block;">${o.order_status}</span>
        <div class="card" style="margin-bottom:10px;">
          <div class="card-title">📍 Delivery Address</div>
          <div class="card-sub" style="margin-top:4px;">${addrStr}<br>${addr.phone}</div>
        </div>
        ${o.items ? `
        <div class="card" style="margin-bottom:10px;">
          <div class="card-title" style="margin-bottom:10px;">Order Items</div>
          ${o.items.map(i => `<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;"><span>${i.title} x${i.quantity}</span><span style="color:var(--accent);font-weight:700;">${State.formatETB(i.subtotal_etb)}</span></div>`).join('')}
          <div style="border-top:1px solid var(--border);padding-top:8px;display:flex;justify-content:space-between;font-weight:900;">
            <span>Total Paid</span><span style="color:var(--accent);">${State.formatETB(o.total_etb)}</span>
          </div>
        </div>` : ''}
        ${o.rider_name ? `<div class="card" style="margin-bottom:10px;"><div class="card-title">🛵 Rider Details</div><div class="card-sub" style="margin-top:4px;">${o.rider_name} · ${o.rider_phone}</div></div>` : ''}
        ${policy ? `<div class="policy-box">🛡️ ${State.policyLabel(policy.return_policy_type)}: ${policy.custom_policy_text || ''}</div>` : ''}
        ${o.order_status === 'dispatched' ? `<button class="btn-primary" style="margin-top:14px;" onclick="App.confirmDelivery('${orderId}');Modals.close();">✅ QR Handshake — Confirm Delivery</button>` : ''}
      `);
    } catch (err) {
      this.toast('Could not load order detail', 'error');
    }
  },

  // ── Seller Actions ────────────────────────────────
  async createProduct() {
    const data = this._getProductFormData();
    if (!data) return;
    data.store_id = State.currentStoreId;
    try {
      await Api.products.create(data);
      this.toast('Item published to hub!', 'success');
      Modals.close();
      const result = await Api.products.list({ store_id: State.currentStoreId, limit: 50 });
      State.sellerProducts = result.products || [];
      this.renderContent();
    } catch (err) {
      this.toast(err.message || 'Failed to publish item', 'error');
    }
  },

  async updateProduct(productId) {
    const data = this._getProductFormData();
    if (!data) return;
    try {
      await Api.products.update(productId, data);
      this.toast('Item updated!', 'success');
      Modals.close();
      const result = await Api.products.list({ store_id: State.currentStoreId, limit: 50 });
      State.sellerProducts = result.products || [];
      this.renderContent();
    } catch (err) {
      this.toast(err.message || 'Update failed', 'error');
    }
  },

  _getProductFormData() {
    const title = document.getElementById('prodTitle')?.value?.trim();
    const price = parseFloat(document.getElementById('prodPrice')?.value);
    const stock = parseInt(document.getElementById('prodStock')?.value);
    if (!title) { this.toast('Title is required', 'error'); return null; }
    if (!price || price <= 0) { this.toast('Valid price required', 'error'); return null; }
    if (stock === undefined || stock < 0) { this.toast('Valid stock quantity required', 'error'); return null; }
    return {
      title,
      description: document.getElementById('prodDesc')?.value || '',
      price_etb: price,
      stock_quantity: stock,
      category: document.getElementById('prodCategory')?.value,
      sku: document.getElementById('prodSku')?.value || null,
      is_published: document.getElementById('prodPublish')?.checked || false
    };
  },

  async togglePublish(productId, currentState) {
    try {
      await Api.products.update(productId, { is_published: !currentState });
      this.toast(currentState ? 'Item unpublished' : 'Item is now live!', 'success');
      const result = await Api.products.list({ store_id: State.currentStoreId, limit: 50 });
      State.sellerProducts = result.products || [];
      this.renderContent();
    } catch (err) {
      this.toast('Failed to update status', 'error');
    }
  },

  async savePolicy() {
    const storeId = State.currentStoreId;
    if (!storeId) return;
    const data = {
      return_policy_type: document.getElementById('policyType')?.value,
      custom_policy_text: document.getElementById('policyText')?.value,
      addis_delivery_fee: parseFloat(document.getElementById('addisFee')?.value),
      regional_dispatch_fee: parseFloat(document.getElementById('regionalFee')?.value),
      telebirr_enabled: document.getElementById('telebirrEnabled')?.checked,
      cash_on_delivery: document.getElementById('cashEnabled')?.checked
    };
    try {
      await Api.stores.updatePolicy(storeId, data);
      // Refresh store data in state
      const storeData = await Api.stores.get(storeId);
      State.stores[0] = { ...State.stores[0], ...storeData.store };
      this.toast('Store settings saved!', 'success');
    } catch (err) {
      this.toast(err.message || 'Save failed', 'error');
    }
  },

  async assignRider(orderId) {
    const riderName = document.getElementById('riderName')?.value?.trim();
    const riderPhone = document.getElementById('riderPhone')?.value?.trim();
    const note = document.getElementById('dispatchNote')?.value;
    if (!riderName || !riderPhone) { this.toast('Rider name and phone required', 'error'); return; }
    try {
      await Api.orders.dispatch(orderId, { rider_name: riderName, rider_phone: riderPhone, dispatch_note: note });
      this.toast('Rider assigned! Buyer notified.', 'success');
      Modals.close();
      const ordersData = await Api.orders.storeOrders(State.currentStoreId, { limit: 50 });
      State.storeOrders = ordersData.orders || [];
      this.renderContent();
    } catch (err) {
      this.toast(err.message || 'Dispatch failed', 'error');
    }
  },

  // ── Modal ─────────────────────────────────────────
  closeModalOnBg(event) {
    if (event.target === document.getElementById('modalBackdrop')) {
      Modals.close();
    }
  },

  // ── Toast ─────────────────────────────────────────
  toast(message, type = 'info') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = `toast show ${type}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }
};

// Boot the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
