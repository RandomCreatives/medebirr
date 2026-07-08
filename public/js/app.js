/**
 * e-Merkato — Central Application Controller
 */
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

    // Authenticate and Load Data
    try {
      await this.authenticate();
      await this.loadInitialData();
      this.showApp();
    } catch (err) {
      console.warn('Backend connection failed, entering Demo Mode:', err.message);
      this.enterDemoMode();
    }

    this.render();
  },

  async authenticate() {
    let initData;
    if (window.Telegram?.WebApp?.initData) {
      initData = window.Telegram.WebApp.initData;
    } else {
      const demoUserId = localStorage.getItem('em_demo_user') || '12893412';
      initData = `mock:${demoUserId}`;
    }

    const existingToken = Api.getToken();
    if (existingToken) {
      try {
        const meData = await Api.users.me();
        State.user = meData.user;
        State.stores = meData.stores || [];
        if (State.stores.length > 0) State.currentStoreId = State.stores[0].store_id;
        return;
      } catch (err) {
        Api.clearToken();
      }
    }

    const authData = await Api.auth.telegram(initData);
    Api.setToken(authData.token);
    State.user = authData.user;
    State.stores = authData.user.stores || [];
    if (State.stores.length > 0) State.currentStoreId = State.stores[0].store_id;
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

  enterDemoMode() {
    State.isDemoMode = true;
    State.user = { firstName: 'Guest', lastName: 'User', tier: 'standard' };
    State.products = [
      { product_id: 'd1', title: 'iPhone 15 Pro Max', price_etb: 165000, store_name: 'Bole Apple Hub', category: 'electronics', rating: 4.9, order_count: 845, is_featured: true },
      { product_id: 'd2', title: 'Habesha Kemis Set', price_etb: 4500, store_name: 'Shiro Meda Textile', category: 'fashion', rating: 4.8, order_count: 620, is_featured: true },
      { product_id: 'd3', title: 'Sony WH-1000XM5', price_etb: 28500, store_name: 'Bole Apple Hub', category: 'electronics', rating: 4.8, order_count: 340, is_featured: false },
      { product_id: 'd4', title: 'Sidama Coffee 1kg', price_etb: 950, store_name: 'Kaffa Roastery', category: 'groceries', rating: 5.0, order_count: 1850, is_featured: true },
      { product_id: 'd5', title: 'Nike Pegasus 40', price_etb: 6800, store_name: 'Merkato Kicks', category: 'fashion', rating: 4.7, order_count: 890, is_featured: false },
      { product_id: 'd6', title: 'Handmade Gabi', price_etb: 1800, store_name: 'Shiro Meda Textile', category: 'fashion', rating: 4.7, order_count: 220, is_featured: false }
    ];
    this.showApp();
    this.showToast('⚠️ Running in Demo Mode (API Unreachable)');
  },

  showApp() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.style.display = 'none';
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.style.display = 'flex';
      appEl.style.flexDirection = 'column';
    }

    if (State.user) {
      const userAvatar = document.getElementById('userAvatar');
      if (userAvatar) userAvatar.textContent = (State.user.firstName || 'U')[0].toUpperCase();
      const headerUsername = document.getElementById('headerUsername');
      if (headerUsername) headerUsername.textContent = `${State.user.firstName} ${State.user.lastName || ''}`.trim();
      const headerLocation = document.getElementById('headerLocation');
      if (headerLocation) headerLocation.textContent = 'Addis Ababa, Ethiopia';
    }
  },

  showToast(message) {
    const toast = document.createElement('div');
    toast.style = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;border-radius:20px;font-size:12px;z-index:10000;white-space:nowrap;border:1px solid rgba(255,255,255,0.1);';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  },

  // ── Render ────────────────────────────────────────
  render() {
    const view = State.view;
    const mainContent = document.getElementById('mainContent');
    if (!mainContent) return;
    mainContent.innerHTML = '';

    if (State.role === 'buyer') {
      if (view === 'explore') BuyerView.renderExplore(mainContent);
      else if (view === 'cart') BuyerView.renderCart(mainContent);
      else if (view === 'orders') BuyerView.renderOrders(mainContent);
      else if (view === 'profile') BuyerView.renderProfile(mainContent);
    } else {
      if (view === 'dashboard') SellerView.renderDashboard(mainContent);
      else if (view === 'inventory') SellerView.renderInventory(mainContent);
      else if (view === 'dispatch') SellerView.renderDispatch(mainContent);
      else if (view === 'policy') SellerView.renderPolicy(mainContent);
    }

    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });
  },

  switchRole(role) {
    if (State.isDemoMode && role === 'seller') {
      this.showToast('Seller features disabled in Demo Mode');
      return;
    }
    State.role = role;
    State.view = role === 'buyer' ? 'explore' : 'dashboard';

    const buyerBtn = document.getElementById('buyerRoleBtn');
    const sellerBtn = document.getElementById('sellerRoleBtn');
    if (buyerBtn) buyerBtn.classList.toggle('active', role === 'buyer');
    if (sellerBtn) sellerBtn.classList.toggle('active', role === 'seller');

    const buyerNav = document.getElementById('buyerNav');
    const sellerNav = document.getElementById('sellerNav');
    if (buyerNav) buyerNav.style.display = role === 'buyer' ? 'flex' : 'none';
    if (sellerNav) sellerNav.style.display = role === 'seller' ? 'flex' : 'none';

    this.render();
  },

  switchView(view) {
    State.view = view;
    this.render();
    window.scrollTo(0, 0);
  }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
