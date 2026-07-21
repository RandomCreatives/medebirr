/* ═══════════════════════════════════════════════════
   e-Merkato App Controller
   Orchestrates auth, navigation, events, and API calls
═══════════════════════════════════════════════════ */

const App = {

  // ── Theme Management ────────────────────────────────
  applyTheme() {
    const dark = State.userSettings?.dark_mode === true;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('em_theme', dark ? 'dark' : 'light'); } catch (_) {}
  },

  // ── Bootstrap ─────────────────────────────────────
  async init() {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }

    State.loadCart();

    // Restore theme instantly from localStorage (before API response)
    const savedTheme = localStorage.getItem('em_theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }

    // Restore language preference
    const savedLang = localStorage.getItem('em_lang');
    if (savedLang && State.languages.includes(savedLang)) State.language = savedLang;

    // ── Phase 1: Show UI instantly with cached data ──────────────
    // Restore cached user + products so the screen renders in <100ms
    this._restoreCache();
    this.showApp();
    this.render();

    // ── Phase 2: Authenticate + fetch real data in background ─────
    // Don't block the UI — show cached content immediately,
    // then update when real data arrives.
    this.authenticate()
      .then(() => {
        this.showApp();
        this.renderRoleBar();
        this.renderNavigation();
        return this.loadInitialData();
      })
      .then(() => this.renderContent())
      .then(() => {
        // Preload wishlist so PDP heart works from any screen
        Api.users.wishlist().then(data => {
          State.wishlistItems = data.wishlist || [];
          State.wishlist = new Set(State.wishlistItems.map(p => p.product_id));
        }).catch(() => {});

        // Request geolocation for faster checkout
        if (navigator.geolocation && !localStorage.getItem('em_geo_requested')) {
          navigator.geolocation.getCurrentPosition(
            () => { localStorage.setItem('em_geo_requested', '1'); },
            () => { localStorage.setItem('em_geo_requested', '1'); },
            { timeout: 8000 }
          );
        }
      })
      .catch((err) => {
        console.warn('Auth/API error:', err.message);
        State.bootError = err?.message || String(err);
        if (!State.user) {
          State.user = { firstName: 'Guest', lastName: '', username: 'guest', tier: 'standard', isSeller: false, walletPoints: 0 };
          this.showApp();
          this.render();
        }
        if (State.products.length === 0) {
          State.products = this._demoProducts();
          this.renderContent();
        }
        State.offlineMode = true;
        setTimeout(() => this.toast(`⚠️ ${State.bootError?.slice(0, 100) || 'Connection issue'}`, 'error'), 500);
      });
  },

  // Restore last-known data from localStorage so first paint is instant
  _restoreCache() {
    try {
      const cachedUser = localStorage.getItem('em_user');
      if (cachedUser) {
        State.user = JSON.parse(cachedUser);
      } else {
        // No cached user — set a minimal placeholder so showApp() works
        // Will be replaced by real user data after auth completes
        State.user = { firstName: 'Medebirr', lastName: '', username: '', tier: 'standard', isSeller: false };
      }

      const cachedProducts = localStorage.getItem('em_products_cache');
      if (cachedProducts) State.products = JSON.parse(cachedProducts);
      else State.products = this._demoProducts();

      const cachedStores = localStorage.getItem('em_stores_cache');
      if (cachedStores) State.allStores = JSON.parse(cachedStores);
    } catch (e) {
      State.user     = { firstName: 'Medebirr', lastName: '', username: '', tier: 'standard', isSeller: false };
      State.products = this._demoProducts();
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
      const savedId = localStorage.getItem('em_demo_user');
      if (savedId) {
        initData = `mock:${savedId}`;
      } else {
        // No session at all — show login screen
        // But first check if we have a cached user (avoids blocking UI)
        const hasCached = !!localStorage.getItem('em_user');
        if (!hasCached) {
          const userId = await this._showBrowserLoginScreen();
          localStorage.setItem('em_demo_user', userId);
          initData = `mock:${userId}`;
        } else {
          // Re-use cached Telegram ID for background re-auth
          try {
            const cached = JSON.parse(localStorage.getItem('em_user'));
            const tgId = cached.tgUserId || cached.tg_user_id || 12893412;
            initData = `mock:${tgId}`;
            localStorage.setItem('em_demo_user', String(tgId));
          } catch (e) {
            initData = `mock:12893412`;
            localStorage.setItem('em_demo_user', '12893412');
          }
        }
      }
    }

    const existingToken = Api.getToken();

    // ── Fast path: valid token + cached user ─────────────────────
    // Skip the API call entirely — verify in background without blocking
    if (existingToken && State.user && State.user.firstName !== 'Medebirr') {
      Api.users.me()
        .then(meData => {
          State.user   = meData.user;
          State.stores = meData.stores || [];
          if (State.stores.length > 0) State.currentStoreId = State.stores[0].store_id;
          try { localStorage.setItem('em_user', JSON.stringify(State.user)); } catch (e) {}
          this.showApp();
          this.renderRoleBar();
          this.renderNavigation();
        })
        .catch(() => Api.clearToken());
      return; // Don't block — UI is already shown with cached data
    }

    // ── Slow path: must hit the API ───────────────────────────────
    if (existingToken) {
      try {
        const meData = await Api.users.me();
        State.user   = meData.user;
        State.stores = meData.stores || [];
        if (State.stores.length > 0) State.currentStoreId = State.stores[0].store_id;
        try { localStorage.setItem('em_user', JSON.stringify(State.user)); } catch (e) {}
        return;
      } catch (err) {
        Api.clearToken();
      }
    }

    const authData = await Api.auth.telegram(initData);
    Api.setToken(authData.token);
    State.user   = authData.user;
    State.stores = authData.user.stores || [];
    if (State.stores.length > 0) State.currentStoreId = State.stores[0].store_id;
    try { localStorage.setItem('em_user', JSON.stringify(State.user)); } catch (e) {}
  },

  // Browser login screen — only shown outside Telegram
  _showBrowserLoginScreen() {
    return new Promise((resolve) => {
      document.getElementById('loadingScreen').innerHTML = `
        <div style="width:100%;max-width:400px;padding:24px 20px;text-align:center;">
          <div class="logo-mark" style="margin:0 auto 10px auto;">M</div>
          <div style="font-size:20px;font-weight:900;margin-bottom:4px;">መደብር | Medebirr</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:24px;">Ethiopia's Telegram Marketplace</div>

          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:18px;padding:20px;text-align:left;margin-bottom:16px;">
            <div style="background:var(--accent-soft);border:1px solid var(--accent-border);border-radius:10px;padding:12px;margin-bottom:16px;">
              <div style="font-size:13px;font-weight:800;color:var(--accent);margin-bottom:4px;">📱 Open in Telegram for full experience</div>
              <div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">Real users authenticate via Telegram automatically — no sign up needed. This browser preview is for testing only.</div>
            </div>

            <div style="font-size:11px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Test as a demo user</div>

            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
              <button onclick="App._loginAs(12893412)" style="background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;text-align:left;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
                <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#3B82F6,#1D4ED8);display:flex;align-items:center;justify-content:center;font-weight:800;color:white;font-size:14px;flex-shrink:0;">M</div>
                <div style="flex:1;"><div style="font-size:13px;font-weight:800;color:var(--text-primary);">Mike Fikadu</div><div style="font-size:10px;color:var(--text-secondary);">Buyer · Bole, Addis Ababa</div></div>
                <span style="font-size:10px;background:rgba(59,130,246,0.2);color:#60A5FA;padding:2px 8px;border-radius:20px;font-weight:700;">BUYER</span>
              </button>
              <button onclick="App._loginAs(98760002)" style="background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;text-align:left;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
                <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#FCCD04,#F59E0B);display:flex;align-items:center;justify-content:center;font-weight:800;color:#111;font-size:14px;flex-shrink:0;">A</div>
                <div style="flex:1;"><div style="font-size:13px;font-weight:800;color:var(--text-primary);">Abebe Girma</div><div style="font-size:10px;color:var(--text-secondary);">Seller · Bole Apple & Tech Hub</div></div>
                <span style="font-size:10px;background:var(--accent-soft);color:var(--accent);padding:2px 8px;border-radius:20px;font-weight:700;">SELLER</span>
              </button>
              <button onclick="App._loginAs(98760004)" style="background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;width:100%;text-align:left;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
                <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#10B981,#059669);display:flex;align-items:center;justify-content:center;font-weight:800;color:white;font-size:14px;flex-shrink:0;">D</div>
                <div style="flex:1;"><div style="font-size:13px;font-weight:800;color:var(--text-primary);">Dawit Alemu</div><div style="font-size:10px;color:var(--text-secondary);">Seller · Kaffa & Sidama Roastery</div></div>
                <span style="font-size:10px;background:var(--accent-soft);color:var(--accent);padding:2px 8px;border-radius:20px;font-weight:700;">SELLER</span>
              </button>
            </div>

            <div style="border-top:1px solid var(--border);padding-top:14px;">
              <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">Or enter any Telegram User ID</div>
              <div style="display:flex;gap:8px;">
                <input id="customTgId" type="number" placeholder="Telegram ID e.g. 12893412" style="flex:1;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--text-primary);font-size:12px;outline:none;"/>
                <button onclick="App._loginWithCustomId()" style="background:var(--accent);color:var(--accent-text);border:none;border-radius:8px;padding:9px 14px;font-weight:800;font-size:12px;cursor:pointer;">Go →</button>
              </div>
            </div>
          </div>

          <div style="font-size:10px;color:var(--text-muted);">
            <a href="https://t.me/medebirrbot" target="_blank" style="color:var(--accent);text-decoration:none;font-weight:700;">Open @medebirrbot in Telegram →</a>
          </div>
        </div>
      `;
      App._loginResolve = resolve;
    });
  },

  _loginAs(userId) {
    if (App._loginResolve) {
      document.getElementById('loadingScreen').innerHTML = `
        <div style="text-align:center;">
          <div class="logo-mark" style="margin:0 auto 16px auto;">M</div>
          <div class="loading-spinner"></div>
          <div style="margin-top:12px;font-size:13px;color:#9DA3AE;">Signing in...</div>
        </div>`;
      App._loginResolve(userId);
      App._loginResolve = null;
    }
  },

  _loginWithCustomId() {
    const id = parseInt(document.getElementById('customTgId')?.value, 10);
    if (!id || id < 1) { alert('Enter a valid Telegram User ID'); return; }
    this._loginAs(id);
  },

  _switchUser() {
    localStorage.removeItem('em_demo_user');
    localStorage.removeItem('em_token');
    location.reload();
  },

  async loadInitialData() {
    // Use the lightweight /featured endpoint for first paint — much faster
    const [productsData, addressesData] = await Promise.all([
      Api.products.featured(12),
      Api.users.addresses().catch(() => ({ addresses: [] }))
    ]);
    State.products     = productsData.products || [];
    State.productTotal = State.products.length;
    State.addresses    = addressesData.addresses || [];

    // Cache for instant next load
    try { localStorage.setItem('em_products_cache', JSON.stringify(State.products)); } catch (e) {}

    // Stores + full product list load silently in background
    Promise.all([
      Api.stores.list({ limit: 100 }).catch(() => ({ stores: [] })),
      Api.products.list({ sort: 'featured', limit: 20, page: 1 }).catch(() => ({ products: State.products }))
    ]).then(([storesData, fullProducts]) => {
      State.allStores    = storesData.stores || [];
      State.products     = fullProducts.products || State.products;
      State.productTotal = fullProducts.total || State.products.length;
      State.productPage  = 2;
      try {
        localStorage.setItem('em_stores_cache',   JSON.stringify(State.allStores));
        localStorage.setItem('em_products_cache', JSON.stringify(State.products));
      } catch (e) {}
      // Quietly refresh the explore grid if the user is still on it
      if (State.currentTab === 'explore') this.renderContent();
    }).catch(() => {});
  },

  showApp() {
    document.getElementById('loadingScreen').style.display = 'none';

    // ── First-time onboarding ──
    const hasOnboarded = localStorage.getItem('em_onboarded');
    if (!hasOnboarded) {
      this._showOnboarding();
      return;
    }

    this._revealApp();
  },

  _revealApp() {
    document.getElementById('app').style.display = 'flex';
    document.getElementById('app').style.flexDirection = 'column';

    const u = State.user;
    if (u) {
      // Normalise field names
      const firstName = u.firstName || u.first_name || 'User';
      const lastName  = u.lastName  || u.last_name  || '';
      const username  = u.username  || '';
      u.firstName = firstName;
      u.lastName  = lastName;
      u.username  = username;
      u.isSeller  = (u.isSeller !== undefined) ? u.isSeller : State.stores.length > 0;
    }

    // Check notifications
    this._refreshNotificationDot();
    this._refreshSellerUnread();

    // Handle deep links from Telegram (e.g. ?start=complete_{pendingId})
    this._handleDeepLink();
  },

  _handleDeepLink() {
    try {
      const params = new URLSearchParams(window.location.search);
      const startParam = params.get('start');
      if (!startParam) return;

      if (startParam.startsWith('complete_')) {
        const pendingId = startParam.replace('complete_', '');
        // Switch to seller mode and open the pending product
        if (State.role !== 'seller') {
          State.role = 'seller';
          State.currentTab = 'pending';
          this.render();
        }
        // Wait for data to load then open modal
        setTimeout(() => {
          const pending = State.pendingProducts.find(p => p.pending_id === pendingId);
          if (pending) {
            Modals.openCompletePending(pendingId);
          } else {
            this.toast('Pending product not found. Refreshing...', 'info');
            this.refreshPendingProducts().then(() => {
              const p2 = State.pendingProducts.find(p => p.pending_id === pendingId);
              if (p2) Modals.openCompletePending(pendingId);
            });
          }
        }, 1000);

        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
      } else if (startParam.startsWith('product_')) {
        const productId = startParam.replace('product_', '');
        setTimeout(() => this.openProduct(productId), 500);
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch (e) {}
  },

  // ── Onboarding Splash ────────────────────────────────
  _showOnboarding() {
    const screen = document.getElementById('onboardingScreen');
    screen.style.display = 'flex';

    const thumb  = document.getElementById('slideThumb');
    const track  = thumb.parentElement;
    const label  = document.getElementById('slideLabel');
    const maxSlide = track.offsetWidth - thumb.offsetWidth - 8;

    let dragging = false, startX = 0, thumbLeft = 4;

    const onStart = (e) => {
      dragging = true;
      startX = (e.touches ? e.touches[0].clientX : e.clientX) - thumbLeft;
      thumb.style.transition = 'none';
    };
    const onMove = (e) => {
      if (!dragging) return;
      e.preventDefault();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - startX;
      thumbLeft = Math.max(4, Math.min(x, maxSlide));
      thumb.style.left = thumbLeft + 'px';
      // Fade label
      const pct = Math.min(thumbLeft / maxSlide, 1);
      label.style.opacity = 1 - pct * 1.5;
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      thumb.style.transition = 'left 0.2s ease';
      if (thumbLeft >= maxSlide * 0.8) {
        // Completed
        thumb.style.left = maxSlide + 'px';
        track.classList.add('done');
        label.textContent = '✓ Welcome!';
        label.style.opacity = 1;
        setTimeout(() => this._onboardFinish(), 400);
      } else {
        // Snap back
        thumbLeft = 4;
        thumb.style.left = '4px';
        label.style.opacity = 1;
      }
    };

    thumb.addEventListener('mousedown', onStart);
    thumb.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
  },

  _onboardFinish() {
    localStorage.setItem('em_onboarded', '1');
    document.getElementById('onboardingScreen').style.display = 'none';
    this._revealApp();
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
    const sub   = document.getElementById('roleSub');
    const btn   = document.getElementById('roleSwitchBtn');
    const shopName = document.getElementById('roleShopName');
    const menuBtn = document.getElementById('roleMenuBtn');
    const searchWrap = document.getElementById('roleSearchWrap');
    const isSeller = State.stores.length > 0;

    if (State.role === 'buyer') {
      // Show search bar, hide seller-only bits
      if (searchWrap) searchWrap.style.display = 'flex';
      if (badge) badge.style.display = 'none';
      if (sub) sub.style.display = 'none';
      if (shopName) shopName.style.display = 'none';
      if (menuBtn) menuBtn.style.display = 'none';

      if (isSeller) {
        btn.innerHTML = `🏬 ${State.t('shared.badgeSeller')} →`;
        btn.style.cssText = 'display:flex;align-items:center;gap:6px;background:rgba(252,205,4,0.15);border:1px solid rgba(252,205,4,0.5);color:#FCCD04;padding:7px 13px;border-radius:20px;font-size:12px;font-weight:800;cursor:pointer;';
        btn.onclick = () => App.toggleRole();
      } else {
        btn.style.display = 'none';
      }

    } else {
      // Seller mode: hide search + old badge; show shop name + Explore Hub + menu
      if (searchWrap) searchWrap.style.display = 'none';
      if (badge) badge.style.display = 'none';
      if (sub) sub.style.display = 'none';

      if (shopName) {
        shopName.textContent = State.stores[0]?.store_name || 'Your Shop';
        shopName.style.display = '';
      }
      if (menuBtn) menuBtn.style.display = '';

      btn.innerHTML = `🛒 ${State.t('shared.tabExplore')} Hub →`;
      btn.style.cssText = 'display:flex;align-items:center;gap:6px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.4);color:#60A5FA;padding:7px 13px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;';
      btn.onclick = () => App.toggleRole();
    }

    // Sync search input value
    const searchInput = document.getElementById('searchInput');
    if (searchInput && searchInput.value !== State.searchQuery) {
      searchInput.value = State.searchQuery;
    }
  },

  // Open the Store Policy & Settings page (3-dots menu in the seller header)
  openSellerSettings() {
    if (!State.currentStoreId) {
      this.toast('No store selected', 'error');
      return;
    }
    State.sellerSettingsGroup = null;
    State.sellerSettingsSection = null;
    this.switchTab('policy');
  },

  renderNavigation() {
    const nav = document.getElementById('bottomNav');
    const cartCount = State.cartCount();

    if (State.role === 'buyer') {
      const isActive = (tab) => State.currentTab === tab;
      const hasWishlist = State.wishlist && State.wishlist.size > 0;
      const u = State.user || {};
      const initial = (u.firstName || 'U')[0].toUpperCase();
      const gradients = ['linear-gradient(135deg,#FCCD04,#F59E0B)','linear-gradient(135deg,#3B82F6,#1D4ED8)','linear-gradient(135deg,#10B981,#059669)'];
      const grad = gradients[(u.firstName||'U').charCodeAt(0) % gradients.length];

      nav.innerHTML = `
        <button class="nav-item ${isActive('explore')?'active':''}" onclick="App.switchTab('explore')">
          <div class="nav-icon-wrap">
            ${isActive('explore')
              ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" fill="rgba(252,205,4,0.15)"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" opacity="0.3"/><circle cx="12" cy="12" r="4"/></svg>'
              : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>'}
          </div>
          <span class="nav-label">${State.t('shared.tabExplore')}</span>
        </button>
        <button class="nav-item ${isActive('wishlist')?'active':''}" onclick="App.switchTab('wishlist')">
          <div class="nav-icon-wrap">
            ${isActive('wishlist') || hasWishlist
              ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
              : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'}
          </div>
          <span class="nav-label">${State.t('shared.tabWishlist')}</span>
        </button>
        <button class="nav-item ${isActive('cart')?'active':''}" onclick="App.switchTab('cart')">
          <div class="nav-icon-wrap">
            ${cartCount > 0 ? `<span class="nav-badge">${cartCount}</span>` : ''}
            ${isActive('cart')
              ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 1 2 2h14a2 2 0 0 1 2-2V6l-3-4z" fill="rgba(252,205,4,0.15)"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>'
              : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 1 2 2h14a2 2 0 0 1 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>'}
          </div>
          <span class="nav-label">${State.t('shared.tabCart')}</span>
        </button>
        <button class="nav-item ${isActive('profile')?'active':''}" onclick="App.switchTab('profile')">
          ${State.unreadCount > 0 ? `<span class="nav-badge" style="top:2px;right:2px;">${State.unreadCount}</span>` : ''}
          <div class="nav-icon-wrap nav-avatar-wrap">
            ${u.photo_url
              ? `<img src="${u.photo_url}" class="nav-avatar-img ${isActive('profile')?'active':''}" />`
              : `<div class="nav-avatar-placeholder ${isActive('profile')?'active':''}" style="background:${grad};">${initial}</div>`}
          </div>
          <span class="nav-label">${State.t('shared.tabProfile')}</span>
        </button>
      `;
    } else {
      const pendingCount = State.storeOrders.filter(o => o.order_status === 'confirmed' && o.payment_status === 'paid').length;
      const pendingProductsCount = (State.pendingProducts || []).length;
      nav.innerHTML = `
        <button class="nav-item ${State.currentTab==='dashboard'?'active':''}" onclick="App.switchTab('dashboard')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          ${State.t('seller.nav.hub')}
        </button>
        <button class="nav-item ${State.currentTab==='pending'?'active':''}" onclick="App.switchTab('pending')">
          ${pendingProductsCount > 0 ? `<span class="nav-badge">${pendingProductsCount}</span>` : ''}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
          ${State.t('seller.nav.fromTg')}
        </button>
        <button class="nav-item ${State.currentTab==='inventory'?'active':''}" onclick="App.switchTab('inventory')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
          ${State.t('seller.nav.items')}
        </button>
        <button class="nav-item ${State.currentTab==='dispatch'?'active':''}" onclick="App.switchTab('dispatch')">
          ${pendingCount > 0 ? `<span class="nav-badge">${pendingCount}</span>` : ''}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          ${State.t('seller.nav.orders')}
        </button>
      `;
    }
  },

  renderContent() {
    const body = document.getElementById('appBody');
    if (State.role === 'buyer') {
      if (State.currentTab === 'explore')        BuyerViews.renderExplore(body);
      else if (State.currentTab === 'wishlist')  BuyerViews.renderWishlist(body);
      else if (State.currentTab === 'cart')      BuyerViews.renderCart(body);
      else if (State.currentTab === 'profile')   BuyerViews.renderProfile(body);
      else if (State.currentTab === 'orders')    BuyerViews.renderOrders(body);
    } else {
      if (State.currentTab === 'dashboard')  SellerViews.renderDashboard(body);
      else if (State.currentTab === 'pending')    SellerViews.renderPending(body);
      else if (State.currentTab === 'inventory')  SellerViews.renderInventory(body);
      else if (State.currentTab === 'policy')     SellerViews.renderSellerMenu(body);
      else if (State.currentTab === 'dispatch')   SellerViews.renderDispatch(body);
      if (State.sellerNotifView)                  SellerViews.renderSellerNotifications(body);
    }
    document.getElementById('appBody').scrollTop = 0;
  },

  // ── Navigation ────────────────────────────────────
  async switchTab(tab) {
    State.currentTab = tab;
    State.profileSubSection = null;
    State.sellerSettingsGroup = null;
    State.sellerSettingsSection = null;
    if (tab === 'orders' && !State.myOrders.length) {
      await this.refreshOrders();
    }
    if (tab === 'profile' && State.role === 'seller') {
      // Load store detail for profile page
      if (!State.storeDetail && State.currentStoreId) {
        try {
          const d = await Api.stores.get(State.currentStoreId);
          State.storeDetail = d.store;
        } catch (e) {}
      }
    } else if (tab === 'profile' && !State.addresses.length) {
      try {
        const data = await Api.users.addresses();
        State.addresses = data.addresses || [];
      } catch (e) {}
    }
    if (tab === 'wishlist') {
      try {
        const data = await Api.users.wishlist();
        State.wishlistItems = data.wishlist || [];
        State.wishlist = new Set(State.wishlistItems.map(p => p.product_id));
      } catch (e) { State.wishlistItems = State.wishlistItems || []; }
    }
    if (tab === 'profile') {
      if (!State.paymentMethods) this._loadPaymentMethods();
      if (!State.userCoupons) this._loadUserCoupons();
      if (!State.userSettings) this._loadUserSettings();
    }
    if (tab === 'dispatch' && State.role === 'seller') {
      if (!State.storeOrders.length) await this.loadSellerData();
      this.loadCouponPolicy();
    }
    if (tab === 'policy' && State.role === 'seller') {
      if (!State.storeDetail && State.currentStoreId) {
        try {
          const d = await Api.stores.get(State.currentStoreId);
          State.storeDetail = d.store;
        } catch (e) {}
      }
      this.loadCouponPolicy();
    }
    this.render();
  },

  async openProfileSubSection(section) {
    State.profileSubSection = section;
    if (section === 'orders' && !State.myOrders.length) {
      await this.refreshOrders();
    }
    if (section === 'address' && !State.addresses.length) {
      try {
        const data = await Api.users.addresses();
        State.addresses = data.addresses || [];
      } catch (e) {}
    }
    if (section === 'payment' && !State.paymentMethods) {
      await this._loadPaymentMethods();
    }
    if (section === 'coupons' && !State.userCoupons) {
      await this._loadUserCoupons();
    }
    if (section === 'settings' && !State.userSettings) {
      await this._loadUserSettings();
    }
    if (section === 'notifications') {
      await this._refreshNotificationDot();
    }
    this.renderContent();
  },

  backToProfileHub() {
    State.profileSubSection = null;
    this.renderContent();
  },

  async openSellerNotifications() {
    if (!State.currentStoreId) return;
    try {
      const data = await Api.stores.notifications(State.currentStoreId, true);
      State.sellerNotifications = data.notifications || [];
      State.sellerUnread = 0;
      // Persist read-state back to the server
      Api.stores.markNotificationsRead(State.currentStoreId).catch(() => {});
    } catch (_) {
      State.sellerNotifications = [];
    }
    State.sellerNotifView = true;
    this.renderContent();
  },

  backToSellerHub() {
    State.sellerNotifView = false;
    this.renderContent();
  },

  async _refreshSellerUnread() {
    if (State.role !== 'seller' || !State.currentStoreId) return;
    try {
      const data = await Api.stores.notifications(State.currentStoreId, false);
      const list = data.notifications || [];
      State.sellerUnread = list.filter(n => !n.is_read).length;
      State.sellerNotifications = list;
      this._refreshBellBadge();
    } catch (_) {}
  },

  async _loadPaymentMethods() {
    try {
      const data = await Api.users.paymentMethods();
      State.paymentMethods = data.methods || [];
    } catch (e) { State.paymentMethods = []; }
  },

  async _loadUserCoupons() {
    try {
      const data = await Api.users.coupons();
      State.userCoupons = data.coupons || [];
    } catch (e) { State.userCoupons = []; }
  },

  async _loadUserSettings() {
    try {
      const data = await Api.users.settings();
      State.userSettings = data.settings || { dark_mode: false, notif_orders: true, notif_promos: true, notif_chat: true, biometric_login: false };
    } catch (e) { State.userSettings = { dark_mode: false, notif_orders: true, notif_promos: true, notif_chat: true, biometric_login: false }; }
    this.applyTheme();
  },

  async _loadAllStores() {
    try {
      const data = await Api.stores.list({ limit: 100 });
      State.allStores = data.stores || [];
    } catch (e) {
      State.allStores = [];
    }
  },

  handleShopSearch(val) {
    const q = val.toLowerCase();
    const filtered = (State.allStores || []).filter(s =>
      s.store_name.toLowerCase().includes(q) ||
      (s.location_sub_city || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q)
    );
    State._filteredStores = filtered;
    // Re-render shops with filtered list
    const prev = State.allStores;
    State.allStores = filtered;
    BuyerViews.renderShops(document.getElementById('appBody'));
    State.allStores = prev;
  },

  async openStorePage(storeId) {
    try {
      const [storeData, productsData] = await Promise.all([
        Api.stores.get(storeId),
        Api.products.list({ store_id: storeId, limit: 20, sort: 'popular' })
      ]);
      const store = storeData.store;
      const products = productsData.products || [];
      const policyLabel = { '7_day_free':'7-Day Free Return','3_day_warranty':'3-Day Warranty','size_exchange':'Size Exchange','fresh_guarantee':'Freshness Guarantee','no_return':'No Returns' };
      const gradients = ['linear-gradient(135deg,#FCCD04,#F59E0B)','linear-gradient(135deg,#3B82F6,#1D4ED8)','linear-gradient(135deg,#10B981,#059669)','linear-gradient(135deg,#EC4899,#F43F5E)'];
      const grad = gradients[(store.store_name||'S').charCodeAt(0) % gradients.length];

      Modals.open(`
        <div class="modal-handle"></div>

        <!-- Store Header -->
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
          <div style="width:56px;height:56px;border-radius:16px;background:${grad};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#111;flex-shrink:0;">
            ${(store.store_name||'S')[0].toUpperCase()}
          </div>
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:6px;">
              <div style="font-size:17px;font-weight:900;">${store.store_name}</div>
              ${store.verified_badge ? '<span style="color:var(--success);font-size:14px;">✓</span>' : ''}
            </div>
            <div style="font-size:12px;color:var(--text-secondary);">📍 ${store.location_sub_city || 'Addis Ababa'}${store.location_woreda ? ', '+store.location_woreda : ''}</div>
            ${store.rating ? `<div style="font-size:11px;color:var(--warning);">⭐ ${Number(store.rating).toFixed(1)} · ${store.rating_count||0} reviews · ${store.total_orders||0} orders</div>` : ''}
          </div>
        </div>

        <!-- Telegram + actions -->
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          ${store.tg_channel_username
            ? `<a href="https://t.me/${store.tg_channel_username}" target="_blank"
                 style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#60A5FA;padding:10px;border-radius:var(--radius-sm);font-size:13px;font-weight:800;text-decoration:none;">
                 💬 Join Telegram Group
               </a>`
            : ''}
          <button onclick="App.switchTab('explore');App.handleFilter('all');Modals.close();"
            style="flex:1;background:var(--bg-surface);border:1px solid var(--border);color:white;padding:10px;border-radius:var(--radius-sm);font-size:12px;font-weight:700;cursor:pointer;">
            ← Back to Hub
          </button>
        </div>

        ${store.description ? `<p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:14px;">${store.description}</p>` : ''}

        <!-- Policy + delivery info -->
        ${store.return_policy_type ? `
        <div class="policy-box" style="margin-bottom:14px;">
          🛡️ <strong>${policyLabel[store.return_policy_type]||'Store Policy'}</strong>
          ${store.custom_policy_text ? `<br/><span style="color:var(--text-secondary);">${store.custom_policy_text}</span>` : ''}
        </div>` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
          <div style="background:var(--bg-surface);border-radius:var(--radius-sm);padding:10px;text-align:center;">
            <div style="font-size:15px;font-weight:900;color:var(--accent);">Br ${Number(store.addis_delivery_fee||150).toLocaleString()}</div>
            <div style="font-size:10px;color:var(--text-secondary);">Addis Delivery</div>
          </div>
          <div style="background:var(--bg-surface);border-radius:var(--radius-sm);padding:10px;text-align:center;">
            <div style="font-size:15px;font-weight:900;color:var(--accent);">Br ${Number(store.regional_dispatch_fee||400).toLocaleString()}</div>
            <div style="font-size:10px;color:var(--text-secondary);">Regional Dispatch</div>
          </div>
        </div>

        <!-- Products -->
        <div style="font-size:13px;font-weight:800;margin-bottom:10px;">
          Products (${products.length})
        </div>
        <div class="item-grid">
          ${products.length
            ? products.map(p => BuyerViews._itemCard(p)).join('')
            : '<div style="grid-column:span 2;text-align:center;padding:20px;color:var(--text-secondary);font-size:13px;">No products listed yet.</div>'}
        </div>
      `);
    } catch (err) {
      this.toast('Could not load store page', 'error');
    }
  },

  async toggleRole() {
    const switchingToSeller = State.role === 'buyer';
    if (switchingToSeller && !State.sellerUnlocked) {
      const store = State.stores[0];
      if (store) {
        Modals.openSellerPassword(store);
        return;
      }
    }
    State.role = switchingToSeller ? 'seller' : 'buyer';
    State.currentTab = switchingToSeller ? 'dashboard' : 'explore';
    if (State.role === 'seller') {
      await this.loadSellerData();
    }
    this.render();
  },

  async _sellerPasswordVerified() {
    State.sellerUnlocked = true;
    Modals.close();
    await this.toggleRole();
  },

  async _sellerPasswordSetup() {
    State.sellerUnlocked = true;
    Modals.close();
    await this.toggleRole();
  },

  async loadSellerData() {
    if (!State.currentStoreId) return;
    try {
      const [statsData, productsData, ordersData, reviewsData, pendingData] = await Promise.all([
        Api.stores.stats(State.currentStoreId),
        Api.products.sellerList(State.currentStoreId, { limit: 200 }),
        Api.orders.storeOrders(State.currentStoreId, { limit: 200 }),
        Api.orders.reviews(State.currentStoreId).catch(() => ({ reviews: [] })),
        Api.pending.list(State.currentStoreId).catch(() => ({ pending_products: [] }))
      ]);
      State.sellerStats = statsData;
      State.sellerProducts = productsData.products || [];
      State.storeOrders = ordersData.orders || [];
      State.storeReviews = reviewsData.reviews || [];
      State.pendingProducts = pendingData.pending_products || [];
    } catch (err) {
      this.toast('Failed to load seller data', 'error');
    }
    this._refreshSellerUnread();
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
    if (!productId) { this.toast('Invalid product', 'error'); return; }
    let product;
    try {
      const data = await Api.products.get(productId);
      product = data?.product;
    } catch (err) {
      // Fallback: find in local state (demo products or cached)
      product = State.products.find(p => p.product_id === productId);
      if (!product) console.warn('Product not found in API or local state:', productId, err?.message);
    }
    if (!product) { this.toast('Product not found', 'error'); return; }
    Modals.openProductDetail(product);
  },

  handleSearch(val) {
    State.searchQuery = val;
    this._cancelInfiniteScroll();
    this._fetchProducts();
  },

  handleFilter(filter) {
    State.activeFilter = filter;
    State.searchQuery = '';
    const si = document.getElementById('searchInput');
    if (si) si.value = '';
    this._cancelInfiniteScroll();
    this._fetchProducts();
  },

  handleSort(sort) {
    State.sortBy = sort;
    this._cancelInfiniteScroll();
    this._fetchProducts();
  },

  async _fetchProducts(append = false) {
    if (this._loadingProducts) return;
    if (!append) State.productPage = 1;
    const params = { sort: State.sortBy, limit: 20, page: State.productPage };
    if (State.activeFilter !== 'all') params.category = State.activeFilter;
    if (State.searchQuery) params.search = State.searchQuery;
    this._loadingProducts = true;
    try {
      const data = await Api.products.list(params);
      const newProducts = data.products || [];
      if (append) {
        State.products = [...State.products, ...newProducts];
      } else {
        State.products = newProducts;
      }
      State.productTotal = data.total || State.products.length;
      if (newProducts.length > 0) State.productPage++;
      this.renderContent();
    } catch (err) {
      if (!append) this.toast('Search failed', 'error');
    } finally {
      this._loadingProducts = false;
    }
  },

  async _loadMore() {
    if (this._loadingProducts) return;
    if (State.products.length >= State.productTotal) return;
    await this._fetchProducts(true);
  },

  _cancelInfiniteScroll() {
    if (this._scrollObserver) {
      this._scrollObserver.disconnect();
      this._scrollObserver = null;
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
    const wasSaved = State.wishlist.has(productId);
    if (wasSaved) {
      State.wishlist.delete(productId);
      if (State.wishlistItems) {
        State.wishlistItems = State.wishlistItems.filter(p => p.product_id !== productId);
      }
      await Api.users.removeWishlist(productId).catch(() => {});
      this.toast('Removed from saved', 'info');
    } else {
      State.wishlist.add(productId);
      // Add to wishlistItems if we can find the product data
      if (State.wishlistItems) {
        const prod = State.products?.find(p => p.product_id === productId)
          || State.wishlistItems.find(p => p.product_id === productId);
        if (prod) State.wishlistItems.unshift(prod);
      }
      await Api.users.addWishlist(productId).catch(() => {});
      this.toast('Saved!', 'success');
    }
    this._syncHeartIcons(productId, !wasSaved);
  },

  // Live-update heart icons across any visible card without a full re-render
  _syncHeartIcons(productId, saved) {
    document.querySelectorAll(`.item-heart-btn[data-pid="${productId}"]`).forEach(btn => {
      btn.classList.toggle('saved', saved);
      btn.innerHTML = saved ? '♥' : '♡';
    });
  },

  // ── Order Placement ───────────────────────────────
  async placeOrder(shopId) {
    const policyAgreement = document.getElementById('policyAgreement');
    if (!policyAgreement?.checked) {
      this.toast('Please agree to the store policy to proceed', 'error');
      return;
    }

    const pkg = State.cart[shopId];
    const payMethod = document.querySelector('input[name="payMethod"]:checked')?.value || 'telebirr';
    const contactPhone = document.getElementById('contactPhone')?.value?.trim();
    if (!contactPhone) {
      this.toast('Please enter your phone number', 'error');
      return;
    }

    // ── Read delivery method & build address ──────────
    const selectedDelivery = document.querySelector('input[name="deliveryMethod"]:checked')?.value || 'delivery';
    const isPickup = selectedDelivery === 'pickup';
    const deliveryFee = isPickup ? 0 : (Modals._currentDeliveryFee ?? pkg.deliveryFee);
    let deliveryAddress = {};
    let deliveryNote = '';

    if (selectedDelivery.startsWith('saved_')) {
      const addressId = selectedDelivery.replace('saved_', '');
      const addr = State.addresses.find(a => a.address_id === addressId);
      if (addr) {
        deliveryAddress = { sub_city: addr.sub_city, woreda: addr.woreda, house_number: addr.house_number, landmark: addr.landmark, phone: addr.phone || contactPhone };
      }
    } else if (selectedDelivery === 'delivery') {
      const subCity = document.getElementById('addrSubCity')?.value?.trim();
      const woreda = document.getElementById('addrWoreda')?.value?.trim();
      const house = document.getElementById('addrHouse')?.value?.trim();
      if (!subCity) { this.toast('Please select your sub-city', 'error'); return; }
      deliveryAddress = { sub_city: subCity, woreda, house_number: house, phone: contactPhone };
      if (document.getElementById('saveThisAddress')?.checked && subCity) {
        Api.users.addAddress({ label: 'Home', sub_city: subCity, woreda, house_number: house, phone: contactPhone, is_default: false }).catch(() => {});
      }
    } else if (isPickup) {
      deliveryAddress = { sub_city: pkg.location || 'Store', house_number: 'Customer collects from store', phone: contactPhone };
      deliveryNote = 'STORE_PICKUP';
    }

    // ── Read transaction code for Telebirr/CBE (optional for testing) ────────
    const txCode = document.getElementById('txCodeInput')?.value?.trim() || `TXN-${Date.now()}`;

    const items = pkg.items.map(i => ({ product_id: i.product.product_id, quantity: i.qty }));
    const couponCode = document.getElementById('couponCodeInput')?.value?.trim() || '';

    try {
      this.toast('Placing order...', 'info');
      const orderData = await Api.orders.create({
        store_id: shopId,
        items,
        delivery_address: { ...deliveryAddress, delivery_note: deliveryNote },
        delivery_method: isPickup ? 'pickup' : 'delivery',
        payment_method: payMethod,
        ...(couponCode ? { coupon_code: couponCode } : {})
      });
      const order = orderData.order;

      if (payMethod === 'telebirr' || payMethod === 'cbe') {
        // Submit transaction code for manual verification
        await Api.payments.confirmTx(order.order_id, txCode);
        State.clearStoreCart(shopId);
        this.renderNavigation();
        Modals.showOrderConfirmed(order.order_ref, order.store?.store_name || pkg.shopName, order.order_id);
        App.refreshOrders();
      } else {
        // Cash on delivery
        await Api.payments.confirmCash(order.order_id);
        State.clearStoreCart(shopId);
        this.renderNavigation();
        Modals.showOrderConfirmed(order.order_ref, order.store?.store_name || pkg.shopName, order.order_id);
        App.refreshOrders();
      }
    } catch (err) {
      this.toast(err.message || 'Order failed — please try again', 'error');
    }
  },

  async simulatePaymentSuccess(txRef) {
    if (this._pendingOrderId) {
      try {
        await fetch('/api/v1/payments/telebirr/webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outTradeNo: txRef, transactionNo: `TX-${Date.now()}`, tradeStatus: 'SUCCESS', sign: 'demo' })
        });
        State.clearStoreCart(this._pendingStoreId);
        this.renderNavigation();
        Modals.showOrderConfirmed(this._pendingOrderRef, this._pendingStoreName || 'Store', this._pendingOrderId);
        App.refreshOrders();
      } catch (err) {
        this.toast('Payment confirmation failed', 'error');
      }
    }
  },

  _startPaymentPolling() {
    clearInterval(this._paymentPollTimer);
    let attempts = 0;
    this._paymentPollTimer = setInterval(async () => {
      attempts++;
      if (attempts > 60) {
        clearInterval(this._paymentPollTimer);
        this.toast('Payment confirmation timed out — tap "Check Status" to retry', 'error');
        return;
      }
      if (!this._pendingOrderId) { clearInterval(this._paymentPollTimer); return; }
      try {
        const data = await Api.orders.get(this._pendingOrderId);
        const order = data.order;
        if (order.payment_status === 'completed' || order.order_status === 'confirmed' || order.order_status === 'dispatched') {
          clearInterval(this._paymentPollTimer);
          State.clearStoreCart(this._pendingStoreId);
          this.renderNavigation();
          Modals.showOrderConfirmed(this._pendingOrderRef, this._pendingStoreName || 'Store', this._pendingOrderId);
          App.refreshOrders();
          this._pendingOrderId = null;
        }
      } catch (_) {}
    }, 5000);
  },

  async checkOrderStatus() {
    if (!this._pendingOrderId) { this.toast('No pending order', 'error'); return; }
    try {
      const data = await Api.orders.get(this._pendingOrderId);
      const order = data.order;
      if (order.payment_status === 'completed' || order.order_status === 'confirmed' || order.order_status === 'dispatched') {
        clearInterval(this._paymentPollTimer);
        State.clearStoreCart(this._pendingStoreId);
        this.renderNavigation();
        Modals.showOrderConfirmed(this._pendingOrderRef, this._pendingStoreName || 'Store', this._pendingOrderId);
        App.refreshOrders();
        this._pendingOrderId = null;
      } else {
        this.toast('Payment still pending — please complete the payment', 'info');
      }
    } catch (err) {
      this.toast('Could not check order status', 'error');
    }
  },

  // ── Seller Actions ────────────────────────────────
  async createProduct() {
    const data = this._getProductFormData();
    if (!data) return;
    data.store_id = State.currentStoreId;
    try {
      const resp = await Api.products.create(data);
      this.toast('Item published to hub!', 'success');
      if (resp.telegram_warning) this.toast(resp.telegram_warning, 'warning');
      Modals.close();
      const result = await Api.products.sellerList(State.currentStoreId, { limit: 200 });
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
      const resp = await Api.products.update(productId, data);
      this.toast('Item updated!', 'success');
      if (resp.telegram_warning) this.toast(resp.telegram_warning, 'warning');
      Modals.close();
      const result = await Api.products.sellerList(State.currentStoreId, { limit: 200 });
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
    const specifications = document.getElementById('prodSpecs')?.value?.trim();
    const materials = document.getElementById('prodMaterials')?.value?.trim();
    if (!specifications) { this.toast('Specifications are required', 'error'); return null; }
    if (!materials) { this.toast('Materials are required', 'error'); return null; }
    const image_urls = [...document.querySelectorAll('.prod-img-url')].map(i => i.value.trim()).filter(Boolean);
    const tagsRaw = document.getElementById('prodTags')?.value?.trim();
    return {
      title,
      description: document.getElementById('prodDesc')?.value || '',
      price_etb: price,
      compare_price: parseFloat(document.getElementById('prodComparePrice')?.value) || null,
      stock_quantity: stock,
      category: document.getElementById('prodCategory')?.value,
      sub_category: document.getElementById('prodSubCategory')?.value?.trim() || null,
      tags: tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : null,
      sku: document.getElementById('prodSku')?.value || null,
      image_urls: image_urls.length ? image_urls : null,
      is_published: document.getElementById('prodPublish')?.checked || false,
      specifications,
      materials,
      shipping_info: document.getElementById('prodShipping')?.value?.trim() || null,
      duty_info: document.getElementById('prodDuty')?.value?.trim() || null,
      return_info: document.getElementById('prodReturn')?.value?.trim() || null
    };
  },

  async togglePublish(productId, currentState) {
    try {
      const resp = await Api.products.update(productId, { is_published: !currentState });
      this.toast(currentState ? 'Item unpublished' : 'Item is now live!', 'success');
      if (resp.telegram_warning) this.toast(resp.telegram_warning, 'warning');
      const result = await Api.products.sellerList(State.currentStoreId, { limit: 200 });
      State.sellerProducts = result.products || [];
      this.renderContent();
    } catch (err) {
      this.toast('Failed to update status', 'error');
    }
  },

  // toggleAutoDetect, toggleTelegramNotifs, _storeToggle, toggles, saveDeliveryRules,
  // saveTaxConfig, savePolicy, _startProgress, savePaymentAccounts,
  // saveCouponPolicy, _verifyGroupFromPolicy — extracted to store-settings.js

  async loadConversations() {
    try {
      const data = await Api.social.conversations();
      State.conversations = data.conversations || [];
      State.unreadCount = State.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      const inbox = document.getElementById('chatInbox');
      const badge = document.getElementById('unreadBadge');
      if (badge) badge.textContent = State.unreadCount > 0 ? `🔴 ${State.unreadCount} new` : '';
      if (!inbox) return;
      if (!State.conversations.length) {
        inbox.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-secondary);font-size:12px;">No conversations yet. Tap Chat on any product to start one.</div>';
        return;
      }
      inbox.innerHTML = State.conversations.map(c => `
        <div onclick="Modals.openChat('${c.conv_id}','${c.store_id}',null,'${(c.product_title||'').replace(/'/g,"\\'")}')" style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;">
          <div style="width:36px;height:36px;border-radius:50%;background:rgba(59,130,246,0.15);display:flex;align-items:center;justify-content:center;font-size:16px;">💬</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;color:white;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.other_party_name || 'Chat'}</div>
            <div style="font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.last_message || ''}</div>
          </div>
          ${c.unread_count > 0 ? `<span style="background:var(--danger);color:white;font-size:10px;font-weight:800;padding:2px 7px;border-radius:10px;">${c.unread_count}</span>` : ''}
          <span style="font-size:10px;color:var(--text-muted);">${new Date(c.last_message_at).toLocaleDateString()}</span>
        </div>
      `).join('');
    } catch (e) {
      console.warn('Failed to load conversations', e);
      const inbox = document.getElementById('chatInbox');
      if (inbox) inbox.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-secondary);font-size:12px;">No conversations yet. Tap Chat on any product to start one.</div>';
    }
  },

  async loadCouponPolicy() {
    if (!State.currentStoreId) return;
    try {
      const data = await Api.stores.couponPolicy(State.currentStoreId);
      State.couponPolicy = data.policy;
    } catch (e) {}
  },

  // assignRider extracted to order-actions.js

  // ── Product Delete ────────────────────────────────
  confirmDeleteProduct(productId, title) {
    Modals.open(`
      <div class="modal-handle"></div>
      <div class="modal-title" style="color:var(--danger);">🗑 Delete Product</div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
        Are you sure you want to delete <strong style="color:white;">"${title}"</strong>? This action cannot be undone.
      </p>
      <div style="display:flex;gap:10px;">
        <button class="btn-secondary" style="flex:1;" onclick="Modals.close()">Cancel</button>
        <button class="btn-danger" style="flex:1;" onclick="App.deleteProduct('${productId}')">Delete</button>
      </div>
    `);
  },

  async deleteProduct(productId) {
    try {
      await Api.products.delete(productId);
      this.toast('Product deleted', 'success');
      Modals.close();
      const result = await Api.products.list({ store_id: State.currentStoreId, limit: 200 });
      State.sellerProducts = result.products || [];
      this.renderContent();
    } catch (err) {
      this.toast(err.message || 'Delete failed', 'error');
    }
  },

  // ── Pending Products ──────────────────────────────
  async discardPending(pendingId) {
    try {
      await Api.pending.discard(pendingId);
      State.pendingProducts = State.pendingProducts.filter(p => p.pending_id !== pendingId);
      this.toast('Product discarded', 'success');
      this.renderContent();
    } catch (err) {
      this.toast(err.message || 'Discard failed', 'error');
    }
  },

  async refreshPendingProducts() {
    if (!State.currentStoreId) return;
    try {
      const data = await Api.pending.list(State.currentStoreId);
      State.pendingProducts = data.pending_products || [];
      this.renderContent();
    } catch (err) {}
  },

  _getPendingFormData() {
    return {
      title: document.getElementById('pendingTitle')?.value?.trim(),
      description: document.getElementById('pendingDesc')?.value?.trim(),
      category: document.getElementById('pendingCategory')?.value,
      sub_category: document.getElementById('pendingSubCategory')?.value?.trim(),
      price_etb: parseFloat(document.getElementById('pendingPrice')?.value) || null,
      compare_price: parseFloat(document.getElementById('pendingComparePrice')?.value) || null,
      stock_quantity: parseInt(document.getElementById('pendingStock')?.value) || 1,
      tags: document.getElementById('pendingTags')?.value?.split(',').map(t => t.trim()).filter(Boolean),
      image_urls: [...document.querySelectorAll('.pending-img-url')].map(i => i.value.trim()).filter(Boolean)
    };
  },

  async completeAndPublishPending(pendingId) {
    const data = this._getPendingFormData();
    if (!data.description) { this.toast('Description is required', 'error'); return; }
    if (!data.category) { this.toast('Please select a category', 'error'); return; }

    try {
      // Complete the pending product
      await Api.pending.complete(pendingId, data);
      // Publish it (creates product + broadcasts to Telegram group)
      const result = await Api.pending.publish(pendingId, data);
      this.toast(result.message || 'Product published!', 'success');
      Modals.close();
      // Refresh seller data
      await this.loadSellerData();
      this.renderContent();
    } catch (err) {
      this.toast(err.message || 'Failed to publish', 'error');
    }
  },

  async savePendingDraft(pendingId) {
    const data = this._getPendingFormData();
    try {
      await Api.pending.complete(pendingId, data);
      this.toast('Draft saved. Complete later to publish.', 'success');
      Modals.close();
      await this.refreshPendingProducts();
    } catch (err) {
      this.toast(err.message || 'Save failed', 'error');
    }
  },

  // ── Seller Cancel Order (extracted to order-actions.js) ─

  async saveProfile() {
    const firstName = document.getElementById('editFirstName')?.value?.trim();
    const lastName  = document.getElementById('editLastName')?.value?.trim();
    const phone     = document.getElementById('editPhone')?.value?.trim();
    const city      = document.getElementById('editCity')?.value?.trim();
    if (!firstName) { this.toast('First name is required', 'error'); return; }
    State.user.firstName = firstName;
    State.user.lastName  = lastName;
    if (phone) State.user.phone = phone;
    if (city)  State.user.city  = city;
    this.toast('Profile saved!', 'success');
  },

  _openAddressModal(opts) {
    const subCities = ['Bole','Kirkos','Yeka','Lideta','Gulele','Nifas Silk','Addis Ketema','Akaki Kality','Lemi Kura','Kolfe Keranio'];
    Modals.open(`
      <div class="modal-handle"></div>
      <div class="modal-title">${opts.title || 'Add Address'}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        <div class="form-group">
          <label class="form-label">Label</label>
          <select class="form-select" id="modalAddrLabel">
            <option ${opts.label==='Home'?'selected':''}>Home</option>
            <option ${opts.label==='Work'?'selected':''}>Work</option>
            <option ${opts.label==='Other'?'selected':''}>Other</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Sub-City</label>
          <select class="form-select" id="modalAddrSubCity">
            ${subCities.map(s=>`<option ${opts.sub_city===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Woreda</label><input class="form-input" id="modalAddrWoreda" value="${opts.woreda||''}" placeholder="e.g. Woreda 03"/></div>
      <div class="form-group"><label class="form-label">House / Landmark</label><input class="form-input" id="modalAddrHouse" value="${opts.house_number||''}" placeholder="e.g. Near Edna Mall, House 412"/></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="modalAddrPhone" type="tel" value="${opts.phone||''}" placeholder="+251 9XX XXX XXX"/></div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:16px;cursor:pointer;">
        <input type="checkbox" id="modalAddrDefault" style="accent-color:var(--accent);" ${opts.is_default?'checked':''}> Set as default address
      </label>
      <button class="btn-primary" onclick="App._saveModalAddress(${opts.onSave ? 'true' : 'false'})">Save Address</button>
    `);
    App._modalAddressOnSave = opts.onSave || null;
  },

  async _saveModalAddress(hasCustomSave) {
    const data = {
      label: document.getElementById('modalAddrLabel')?.value,
      sub_city: document.getElementById('modalAddrSubCity')?.value,
      woreda: document.getElementById('modalAddrWoreda')?.value?.trim(),
      house_number: document.getElementById('modalAddrHouse')?.value?.trim(),
      phone: document.getElementById('modalAddrPhone')?.value?.trim(),
      is_default: document.getElementById('modalAddrDefault')?.checked,
    };
    if (!data.phone) { this.toast('Phone number is required', 'error'); return; }
    if (App._modalAddressOnSave) {
      App._modalAddressOnSave(data);
    } else {
      try {
        const result = await Api.users.addAddress(data);
        State.addresses.push(result.address);
        Modals.close();
        this.renderContent();
        this.toast('Address saved!', 'success');
      } catch (err) {
        this.toast('Could not save address', 'error');
      }
    }
  },

  clearToken() {
    Api.clearToken();
    localStorage.removeItem('em_user');
    localStorage.removeItem('em_demo_user');
    State.user = null;
  },

  async deleteAddress(addressId) {
    try {
      await Api.users.deleteAddress(addressId);
      State.addresses = State.addresses.filter(a => a.address_id !== addressId);
      this.renderContent();
      this.toast('Address removed', 'info');
    } catch (err) {
      this.toast('Could not remove address', 'error');
    }
  },

  openAddAddressModal() {
    Modals.open(`
      <div class="modal-handle"></div>
      <div class="modal-title">+ Add Address</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
        <div class="form-group">
          <label class="form-label">Label</label>
          <select class="form-select" id="newAddrLabel">
            <option>Home</option><option>Work</option><option>Other</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Sub-City</label>
          <select class="form-select" id="newAddrSubCity">
            ${['Bole','Kirkos','Yeka','Lideta','Gulele','Nifas Silk','Addis Ketema','Akaki Kality','Lemi Kura','Kolfe Keranio'].map(s=>`<option>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Woreda</label><input class="form-input" id="newAddrWoreda" placeholder="e.g. Woreda 03"/></div>
      <div class="form-group"><label class="form-label">House / Landmark</label><input class="form-input" id="newAddrHouse" placeholder="e.g. Near Edna Mall, House 412"/></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="newAddrPhone" type="tel" placeholder="+251 9XX XXX XXX"/></div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:16px;cursor:pointer;">
        <input type="checkbox" id="newAddrDefault" style="accent-color:var(--accent);"> Set as default address
      </label>
      <button class="btn-primary" onclick="App._saveNewAddress()">Save Address</button>
    `);
  },

  async _saveNewAddress() {
    const label    = document.getElementById('newAddrLabel')?.value;
    const subCity  = document.getElementById('newAddrSubCity')?.value;
    const woreda   = document.getElementById('newAddrWoreda')?.value?.trim();
    const house    = document.getElementById('newAddrHouse')?.value?.trim();
    const phone    = document.getElementById('newAddrPhone')?.value?.trim();
    const isDefault = document.getElementById('newAddrDefault')?.checked;
    if (!phone) { this.toast('Phone number is required', 'error'); return; }
    try {
      const data = await Api.users.addAddress({ label, sub_city: subCity, woreda, house_number: house, phone, is_default: isDefault });
      State.addresses.push(data.address);
      Modals.close();
      this.renderContent();
      this.toast('Address saved!', 'success');
    } catch (err) {
      this.toast('Could not save address', 'error');
    }
  },
  confirmDeleteStore(storeId, storeName) {
    Modals.open(`
      <div class="modal-handle"></div>
      <div style="text-align:center;padding:8px 0 16px 0;">
        <div style="font-size:40px;margin-bottom:14px;">⚠️</div>
        <div style="font-size:17px;font-weight:900;margin-bottom:8px;color:var(--danger);">Delete Store?</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-bottom:20px;">
          You are about to permanently delete<br/>
          <strong style="color:white;">${storeName}</strong><br/>
          This will unpublish all products and disconnect the Telegram group.<br/>
          <strong style="color:var(--danger);">This cannot be undone.</strong>
        </div>

        <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:var(--radius-sm);padding:12px;margin-bottom:20px;font-size:12px;color:var(--text-secondary);text-align:left;line-height:1.8;">
          ✗ All products will be unpublished<br/>
          ✗ Telegram group will be disconnected<br/>
          ✓ Order history is preserved for reference<br/>
          ✓ You can open a new store anytime
        </div>

        <div style="display:flex;gap:10px;">
          <button class="btn-secondary" onclick="Modals.close();App.openProfileModal();" style="flex:1;">
            Cancel
          </button>
          <button onclick="App.deleteStore('${storeId}','${storeName.replace(/'/g,'\\\'')}')"
            style="flex:1;background:var(--danger);color:white;border:none;padding:13px;border-radius:var(--radius-md);font-size:14px;font-weight:800;cursor:pointer;">
            🗑️ Delete Store
          </button>
        </div>
      </div>
    `);
  },

  async deleteStore(storeId, storeName) {
    try {
      this.toast('Deleting store...', 'info');
      await Api.stores.delete(storeId);

      // Remove from state
      State.stores = State.stores.filter(s => s.store_id !== storeId);
      if (State.currentStoreId === storeId) {
        State.currentStoreId = State.stores[0]?.store_id || null;
      }
      // Switch back to buyer mode if no stores left
      if (State.stores.length === 0) {
        State.role = 'buyer';
        State.currentTab = 'explore';
      }

      Modals.open(`
        <div class="modal-handle"></div>
        <div style="text-align:center;padding:20px 0;">
          <div style="font-size:48px;margin-bottom:14px;">✅</div>
          <div style="font-size:17px;font-weight:900;margin-bottom:8px;">Store Deleted</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.6;">
            <strong style="color:white;">${storeName}</strong> has been deleted.<br/>
            All products have been unpublished.
          </div>
          <button class="btn-primary" onclick="Modals.close();">Done</button>
        </div>
      `);
      this.render();
    } catch (err) {
      Modals.close();
      this.toast(err.message || 'Failed to delete store', 'error');
    }
  },

  // _verifyGroupFromPolicy extracted to store-settings.js
  openProfileModal() {
    const u = State.user;
    if (!u) return;
    const isSeller = State.stores.length > 0;
    Modals.open(`
      <div class="modal-handle"></div>

      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
        <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#FCCD04,#F59E0B);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#111;flex-shrink:0;">
          ${(u.firstName||'U')[0].toUpperCase()}
        </div>
        <div>
          <div style="font-size:17px;font-weight:900;">${u.firstName} ${u.lastName||''}</div>
          <div style="font-size:12px;color:var(--text-secondary);">${u.username ? '@'+u.username : 'Telegram User'}</div>
          <div style="margin-top:4px;">
            <span style="font-size:10px;padding:2px 8px;border-radius:20px;font-weight:800;${isSeller ? 'background:rgba(252,205,4,0.2);color:#FCCD04;' : 'background:rgba(59,130,246,0.2);color:#60A5FA;'}">
              ${isSeller ? '🏬 Verified Seller' : '🛒 Buyer'}
            </span>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      ${isSeller ? `
      <div style="margin:14px 0;">
        <div style="font-size:11px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;">Your Stores</div>
        ${State.stores.map(s => `
          <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
              <div>
                <div style="font-size:13px;font-weight:800;">${s.store_name}</div>
                <div style="font-size:11px;color:${s.status==='verified'?'var(--success)':'var(--warning)'};">
                  ${s.status==='verified'?'✓ Verified':'⏳ Pending Verification'}
                </div>
                ${s.tg_channel_username ? `<div style="font-size:11px;color:var(--text-secondary);">📢 @${s.tg_channel_username}</div>` : ''}
              </div>
              <button onclick="App.toggleRole();Modals.close();" style="background:rgba(252,205,4,0.15);border:1px solid rgba(252,205,4,0.3);color:#FCCD04;padding:7px 12px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;">
                Open Studio →
              </button>
            </div>
            <button onclick="App.confirmDeleteStore('${s.store_id}','${s.store_name.replace(/'/g,'\\\'')}')"
              style="width:100%;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:var(--danger);padding:8px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">
              🗑️ Delete this store
            </button>
          </div>`).join('')}
      </div>
      <div class="divider"></div>` : ''}

      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">
        ${!isSeller ? `
        <button onclick="Modals.close();App.openRegisterStoreModal();" class="btn-primary" style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.35);color:var(--success);">
          🏪 Open a Shop on Medebirr — Free
        </button>` : ''}

        <button onclick="App.switchTab('orders');Modals.close();" class="btn-secondary">
          📦 My Orders & Deliveries
        </button>

        ${!window.Telegram?.WebApp?.initData ? `
        <button onclick="App._switchUser();Modals.close();" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:var(--danger);padding:11px;border-radius:var(--radius-sm);font-size:13px;font-weight:700;cursor:pointer;width:100%;">
          ⇄ Switch Account
        </button>` : ''}
      </div>
    `);
  },

  // ── Register Store Modal (extracted to seller-registration.js) ─
  openRegisterStoreModal() {
    // Defined in seller-registration.js
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
  },

  // ── Language ──────────────────────────────────────
  cycleLanguage() {
    const langs = State.languages;
    const idx = langs.indexOf(State.language);
    State.language = langs[(idx + 1) % langs.length];
    localStorage.setItem('em_lang', State.language);
    const langLabel = document.getElementById('langLabel');
    if (langLabel) langLabel.textContent = { en: 'EN', am: 'አማ', or: 'OR' }[State.language] || 'EN';
    this.render();
    this.toast(`Language: ${State.language.toUpperCase()}`, 'info');
    // Re-render settings if open so the picker updates
    if (State.profileSubSection === 'settings') {
      const body = document.getElementById('appBody');
      if (body) BuyerViews._renderSettings(body);
    }
  },

  // ── Notifications ─────────────────────────────────
  async toggleNotifications() {
    this.switchTab('profile');
    State.profileSubSection = 'notifications';
    await this._refreshNotificationDot();
    this.renderContent();
  },

  async _refreshNotificationDot() {
    try {
      const data = await Api.users.notifications();
      State.notifications = data.notifications || [];
      // Backend column is `is_read`; GET marks read on fetch, so unread reflects
      // items present in the response that haven't been seen yet this session.
      const unread = State.notifications.filter(n => !n.is_read && !n.read_at).length;
      State.notifUnread = unread;
      this._refreshBellBadge();
    } catch (_) {}
  },

  // Update the red dot / count on both the buyer notifications row and the
  // seller hub bell without a full re-render.
  _refreshBellBadge() {
    // Buyer: the "Notifications" row badge lives inside the profile hub.
    const notifRowBadge = document.querySelector('.profile-menu-row[onclick*="\'notifications\'"] .profile-menu-badge');
    if (notifRowBadge) notifRowBadge.style.display = State.notifUnread > 0 ? 'flex' : 'none';
    // Seller: bell lives in the hub header.
    if (State.role === 'seller') {
      const bell = document.querySelector('.hub-bell-btn .nav-badge');
      if (State.sellerUnread > 0 && !bell) {
        const btn = document.querySelector('.hub-bell-btn');
        if (btn) btn.insertAdjacentHTML('beforeend',
          `<span class="nav-badge" style="top:-4px;right:-4px;">${State.sellerUnread > 9 ? '9+' : State.sellerUnread}</span>`);
      } else if (bell) {
        if (State.sellerUnread > 0) bell.textContent = State.sellerUnread > 9 ? '9+' : State.sellerUnread;
        else bell.remove();
      }
    }
  }
};

// Boot the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
