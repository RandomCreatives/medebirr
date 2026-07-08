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

    // Authenticate
    try {
      await this.authenticate();
      await this.loadInitialData();
      this.showApp();
      this.render();
    } catch (err) {
      console.error('Init error:', err);
      let message = err.message;
      if (message.includes('ECONNREFUSED') || message.includes('DATABASE_URL')) {
        message = 'The database is not reachable. If you are the developer, please ensure DATABASE_URL is set correctly in Vercel settings.';
      }
      this.showError(message);
    }
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
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.style.display = 'none';
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.style.display = 'flex';
      appEl.style.flexDirection = 'column';
    }

    // Update header
    if (State.user) {
      const user = State.user;
      const userAvatar = document.getElementById('userAvatar');
      if (userAvatar) userAvatar.textContent = (user.firstName || 'U')[0].toUpperCase();
      const headerUsername = document.getElementById('headerUsername');
      if (headerUsername) headerUsername.textContent = `${user.firstName} ${user.lastName || ''}`.trim();
      const headerLocation = document.getElementById('headerLocation');
      if (headerLocation) headerLocation.textContent = 'Addis Ababa, Ethiopia';
    }
  },

  showError(message) {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      loadingScreen.innerHTML = `
        <div style="text-align:center;padding:30px;">
          <div style="font-size:40px;margin-bottom:12px;">⚠️</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:8px;">Connection Error</div>
          <div style="font-size:13px;color:#9DA3AE;margin-bottom:20px;max-width:300px;margin-left:auto;margin-right:auto;">${message}</div>
          <button onclick="location.reload()" style="background:#FCCD04;color:#111;padding:12px 24px;border:none;border-radius:12px;font-weight:800;cursor:pointer;font-size:14px;">
            Retry
          </button>
        </div>
      `;
    }
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

    // Update Nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });
  },

  // ── Actions ───────────────────────────────────────
  switchRole(role) {
    State.role = role;
    State.view = role === 'buyer' ? 'explore' : 'dashboard';

    // Update role bar UI
    const buyerBtn = document.getElementById('buyerRoleBtn');
    const sellerBtn = document.getElementById('sellerRoleBtn');
    if (buyerBtn) buyerBtn.classList.toggle('active', role === 'buyer');
    if (sellerBtn) sellerBtn.classList.toggle('active', role === 'seller');

    // Update bottom nav
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

// Global exports
window.App = App;

// Start the app
document.addEventListener('DOMContentLoaded', () => App.init());
