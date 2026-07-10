/* ═══════════════════════════════════════════════════
   Buyer Views: Explore, Shops, Cart, Wishlist, Orders
═══════════════════════════════════════════════════ */

const BuyerViews = {

  // ── Explore Hub ──────────────────────────────────
  renderExplore(container) {
    const filtered = State.products;
    container.innerHTML = `
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" id="searchInput"
               placeholder="Search shops, items, or locations..."
               value="${State.searchQuery}"
               oninput="App.handleSearch(this.value)" />
      </div>
      <div class="filter-bar" id="filterBar">
        ${this._filterPills()}
      </div>
      <div class="section-header">
        <span style="font-size:12px;color:var(--text-secondary);">
          <strong style="color:white;">${filtered.length}</strong> items from verified sellers
        </span>
        <select style="background:var(--bg-surface);border:1px solid var(--border);color:white;padding:5px 8px;border-radius:8px;font-size:11px;cursor:pointer;" onchange="App.handleSort(this.value)">
          <option value="featured" ${State.sortBy==='featured'?'selected':''}>⭐ Featured</option>
          <option value="newest" ${State.sortBy==='newest'?'selected':''}>🆕 Newest</option>
          <option value="price_asc" ${State.sortBy==='price_asc'?'selected':''}>💰 Price ↑</option>
          <option value="price_desc" ${State.sortBy==='price_desc'?'selected':''}>💰 Price ↓</option>
          <option value="popular" ${State.sortBy==='popular'?'selected':''}>🔥 Popular</option>
        </select>
      </div>
      <div class="item-grid" id="itemGrid">
        ${filtered.length ? filtered.map(p => this._itemCard(p)).join('') : this._emptyState('🔍','No items found','Try different keywords or clear filters.')}
      </div>
      <div id="scrollSentinel" style="height:1px;"></div>
    `;
    this._setupInfiniteScroll();
  },

  _setupInfiniteScroll() {
    App._cancelInfiniteScroll();
    const sentinel = document.getElementById('scrollSentinel');
    if (!sentinel) return;
    App._scrollObserver = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) App._loadMore();
    }, { rootMargin: '200px' });
    App._scrollObserver.observe(sentinel);
  },

  _filterPills() {
    const filters = [
      { key: 'all',         label: '🌐 All'         },
      { key: 'electronics', label: '📱 Electronics'  },
      { key: 'fashion',     label: '👗 Fashion'      },
      { key: 'groceries',   label: '☕ Food & Coffee' },
      { key: 'footwear',    label: '👟 Footwear'     },
    ];
    return filters.map(f => `
      <button class="filter-pill ${State.activeFilter === f.key ? 'active' : ''}" onclick="App.handleFilter('${f.key}')">${f.label}</button>
    `).join('');
  },

  _itemCard(p) {
    const gradient = this._categoryGradient(p.category);
    const compare = p.compare_price ? `<span class="item-compare">${State.formatETB(p.compare_price)}</span>` : '';
    return `
      <div class="item-card" onclick="App.openProduct('${p.product_id}')">
        <div class="item-thumb" style="background:${gradient};">
          ${p.return_policy_type ? `<span class="item-policy-tag">${State.policyLabel(p.return_policy_type).split('-')[0]}</span>` : ''}
          <div class="item-store-badge" onclick="event.stopPropagation();App.openStorePage('${p.store_id}')">🏪 ${p.store_name}</div>
        </div>
        <div class="item-body">
          <div>
            <div class="item-title">${p.title}</div>
            <div class="item-location">📍 ${p.location_sub_city || 'Addis Ababa'} ${p.verified_badge ? '<span class="verified-check">✓</span>' : ''}</div>
          </div>
          <div>
            <div style="display:flex;align-items:baseline;gap:4px;">
              <span class="item-price">${State.formatETB(p.price_etb)}</span>${compare}
            </div>
            <button class="btn-add-cart" onclick="event.stopPropagation();App.addToCart('${p.product_id}')">+ Add to Cart</button>
          </div>
        </div>
      </div>
    `;
  },

  _categoryGradient(cat) {
    const map = {
      electronics: 'linear-gradient(135deg,#1f4037,#99f2c8)',
      fashion:     'linear-gradient(135deg,#f857a6,#ff5858)',
      groceries:   'linear-gradient(135deg,#fa709a,#fee140)',
      footwear:    'linear-gradient(135deg,#4facfe,#00f2fe)',
      furniture:   'linear-gradient(135deg,#a18cd1,#fbc2eb)',
      beauty:      'linear-gradient(135deg,#ffecd2,#fcb69f)',
      default:     'linear-gradient(135deg,#667eea,#764ba2)'
    };
    return map[cat] || map.default;
  },

  _emptyState(icon, title, desc) {
    return `<div class="empty-state" style="grid-column:span 2;">
      <div class="empty-icon">${icon}</div>
      <div class="empty-title">${title}</div>
      <div class="empty-desc">${desc}</div>
    </div>`;
  },

  // ── Shops Directory ───────────────────────────────
  renderShops(container) {
    const shops = State.allStores || [];
    container.innerHTML = `
      <div class="search-wrap">
        <span class="search-icon">🏪</span>
        <input type="text" class="search-input" id="shopSearchInput"
               placeholder="Search stores by name or location..."
               oninput="App.handleShopSearch(this.value)" />
      </div>
      <div class="section-header">
        <span class="section-title">All Shops</span>
        <span style="font-size:11px;color:var(--text-secondary);">${shops.length} stores</span>
      </div>
      ${!shops.length
        ? `<div class="empty-state"><div class="empty-icon">🏪</div><div class="empty-title">Loading shops...</div></div>`
        : shops.map(s => this._shopCard(s)).join('')}
    `;
  },

  _shopCard(s) {
    const initial = (s.store_name||'S')[0].toUpperCase();
    const gradients = ['linear-gradient(135deg,#FCCD04,#F59E0B)','linear-gradient(135deg,#3B82F6,#1D4ED8)','linear-gradient(135deg,#10B981,#059669)','linear-gradient(135deg,#EC4899,#F43F5E)','linear-gradient(135deg,#8B5CF6,#6D28D9)'];
    const grad = gradients[s.store_name.charCodeAt(0) % gradients.length];
    const policyLabel = { '7_day_free':'7-Day Returns','3_day_warranty':'3-Day Warranty','size_exchange':'Size Exchange','fresh_guarantee':'Fresh Guarantee','no_return':'No Returns' };
    return `
      <div class="card" style="margin-bottom:10px;cursor:pointer;" onclick="App.openStorePage('${s.store_id}')">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:48px;height:48px;border-radius:14px;background:${grad};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#111;flex-shrink:0;">${initial}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;">
              <div style="font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.store_name}</div>
              ${s.verified_badge ? '<span style="font-size:10px;color:var(--success);">✓</span>' : ''}
            </div>
            <div style="font-size:11px;color:var(--text-secondary);">📍 ${s.location_sub_city || 'Addis Ababa'} · ${s.rating ? `⭐ ${Number(s.rating).toFixed(1)}` : 'New'}</div>
            ${s.return_policy_type ? `<div style="font-size:10px;color:var(--success);margin-top:2px;">🛡️ ${policyLabel[s.return_policy_type]||''}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0;">
            ${s.tg_channel_username
              ? `<a href="https://t.me/${s.tg_channel_username}" target="_blank" onclick="event.stopPropagation();"
                   style="display:flex;align-items:center;gap:4px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#60A5FA;padding:5px 10px;border-radius:20px;font-size:11px;font-weight:700;text-decoration:none;white-space:nowrap;">
                   💬 Group
                 </a>`
              : ''}
          </div>
        </div>
        ${s.description ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${s.description}</div>` : ''}
      </div>
    `;
  },

  // ── Profile Hub + Sub-Sections ──────────────────────
  renderProfile(container) {
    if (State.profileSubSection) {
      const section = State.profileSubSection;
      if (section === 'profile')  return this._renderProfileDetail(container);
      if (section === 'address')  return this._renderAddressManager(container);
      if (section === 'payment')  return this._renderPaymentMethods(container);
      if (section === 'orders')   return this._renderOrdersDetail(container);
      if (section === 'coupons')  return this._renderCoupons(container);
      if (section === 'settings') return this._renderSettings(container);
      if (section === 'help')     return this._renderHelpCenter(container);
      if (section === 'privacy')  return this._renderPrivacy(container);
    }

    const u = State.user;
    if (!u) return;
    const isSeller = State.stores.length > 0;
    const gradients = ['linear-gradient(135deg,#FCCD04,#F59E0B)','linear-gradient(135deg,#3B82F6,#1D4ED8)','linear-gradient(135deg,#10B981,#059669)'];
    const grad = gradients[(u.firstName||'U').charCodeAt(0) % gradients.length];
    const orderCount = State.myOrders.length;
    const couponCount = (State.userCoupons || []).filter(c => !c.is_redeemed).length;

    const menuItems = [
      { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`, label: 'Your Profile', desc: 'Name, email, phone & security', section: 'profile' },
      { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`, label: 'Manage Address', desc: 'Delivery locations & map', section: 'address' },
      { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`, label: 'Payment Methods', desc: 'Cards & digital wallet', section: 'payment' },
      { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`, label: 'My Orders', desc: orderCount ? `${orderCount} orders` : 'Track purchases & deliveries', section: 'orders', badge: orderCount || null },
      { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`, label: 'My Coupons', desc: couponCount ? `${couponCount} available` : 'Discounts & promo codes', section: 'coupons', badge: couponCount || null },
      { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`, label: 'Settings', desc: 'Dark mode, notifications, biometrics', section: 'settings' },
      { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`, label: 'Help Center', desc: 'FAQs, chat support & contact', section: 'help' },
      { icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`, label: 'Privacy Policy', desc: 'Data usage & legal terms', section: 'privacy' },
    ];

    container.innerHTML = `
      <!-- Profile Header Card -->
      <div class="profile-hub-header">
        <div class="profile-avatar-lg" style="background:${grad};">
          ${(u.firstName||'U')[0].toUpperCase()}
        </div>
        <div class="profile-identity">
          <div class="profile-name">${u.firstName} ${u.lastName||''}</div>
          <div class="profile-email">${u.email || u.username ? '@'+(u.username||u.email) : 'Telegram User'}</div>
          <div class="profile-badges">
            <span class="profile-badge ${isSeller?'badge-seller':'badge-buyer'}">${isSeller ? 'Seller' : 'Buyer'}</span>
            ${u.tier && u.tier !== 'standard' ? `<span class="profile-badge badge-tier">${u.tier}</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Menu Grid -->
      <div class="profile-menu-grid">
        ${menuItems.map(m => `
          <button class="profile-menu-row" onclick="App.openProfileSubSection('${m.section}')">
            <div class="profile-menu-icon">${m.icon}</div>
            <div class="profile-menu-text">
              <div class="profile-menu-label">${m.label}</div>
              <div class="profile-menu-desc">${m.desc}</div>
            </div>
            ${m.badge ? `<span class="profile-menu-badge">${m.badge}</span>` : ''}
            <svg class="profile-menu-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        `).join('')}
      </div>

      <!-- Store Section -->
      ${isSeller ? `
      <div class="profile-store-section">
        <div class="profile-section-label">Your Stores</div>
        ${State.stores.map(s => `
          <div class="profile-store-card">
            <div>
              <div style="font-size:13px;font-weight:800;">${s.store_name}</div>
              <div style="font-size:11px;color:${s.status==='verified'?'var(--success)':'var(--warning)'};">${s.status==='verified'?'Verified':'Pending'}</div>
            </div>
            <button onclick="App.toggleRole();App.switchTab('dashboard');" class="profile-store-btn">Studio →</button>
          </div>`).join('')}
      </div>` : `
      <button class="profile-open-shop-btn" onclick="App.openRegisterStoreModal()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Open a Shop on Medebirr — Free
      </button>`}

      <!-- Switch Account -->
      ${!window.Telegram?.WebApp?.initData ? `
      <button class="profile-switch-btn" onclick="App._switchUser()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        Switch Account
      </button>` : ''}
    `;
  },

  // ── Sub-Section: Your Profile ───────────────────────
  _renderProfileDetail(container) {
    const u = State.user;
    if (!u) return;
    const gradients = ['linear-gradient(135deg,#FCCD04,#F59E0B)','linear-gradient(135deg,#3B82F6,#1D4ED8)','linear-gradient(135deg,#10B981,#059669)'];
    const grad = gradients[(u.firstName||'U').charCodeAt(0) % gradients.length];

    container.innerHTML = `
      <div class="subsection-header">
        <button class="subsection-back-btn" onclick="App.backToProfileHub()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="subsection-title">Your Profile</span>
      </div>

      <!-- Avatar Card -->
      <div class="profile-detail-avatar-card">
        <div class="profile-avatar-xl" style="background:${grad};">
          ${(u.firstName||'U')[0].toUpperCase()}
        </div>
        <div class="profile-detail-name">${u.firstName} ${u.lastName||''}</div>
        <div class="profile-detail-meta">
          ${u.username ? `<span>@${u.username}</span>` : ''}
          <span class="profile-badge badge-buyer">Buyer</span>
        </div>
      </div>

      <!-- Editable Fields -->
      <div class="profile-detail-fields">
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input class="form-input" id="profileEditName" type="text" value="${u.firstName||''} ${u.lastName||''}" placeholder="Your full name"/>
        </div>
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input class="form-input" id="profileEditEmail" type="email" value="${u.email||''}" placeholder="you@example.com"/>
        </div>
        <div class="form-group">
          <label class="form-label">Phone Number</label>
          <input class="form-input" id="profileEditPhone" type="tel" value="${u.phone||''}" placeholder="+251 9XX XXX XXX"/>
        </div>
      </div>

      <button class="btn-primary" onclick="BuyerViews._saveProfileDetail()" style="margin-bottom:16px;">Save Changes</button>

      <!-- MFA Section -->
      <div class="profile-detail-section">
        <div class="profile-detail-section-title">Security</div>
        <div class="profile-toggle-row">
          <div>
            <div class="profile-toggle-label">Multi-Factor Authentication</div>
            <div class="profile-toggle-desc">Add an extra layer of security to your account</div>
          </div>
          <button class="toggle-switch ${u.mfa_enabled ? 'active' : ''}" onclick="BuyerViews._toggleMFA()">
            <div class="toggle-thumb"></div>
          </button>
        </div>
      </div>
    `;
  },

  async _saveProfileDetail() {
    const fullName = document.getElementById('profileEditName')?.value?.trim();
    const email = document.getElementById('profileEditEmail')?.value?.trim();
    const phone = document.getElementById('profileEditPhone')?.value?.trim();
    if (!fullName) { App.toast('Name is required', 'error'); return; }

    const parts = fullName.split(' ');
    const first_name = parts.shift();
    const last_name = parts.join(' ');

    try {
      const data = await Api.users.updateMe({ first_name, last_name, email, phone });
      State.user = { ...State.user, ...data.user };
      document.getElementById('userAvatar').textContent = first_name[0].toUpperCase();
      document.getElementById('headerUsername').textContent = fullName;
      App.toast('Profile updated!', 'success');
      App.backToProfileHub();
    } catch (err) {
      App.toast(err.message || 'Failed to update profile', 'error');
    }
  },

  async _toggleMFA() {
    const newVal = !State.user.mfa_enabled;
    try {
      await Api.users.updateMe({ mfa_enabled: newVal });
      State.user.mfa_enabled = newVal;
      App.toast(newVal ? 'MFA enabled' : 'MFA disabled', 'success');
      this._renderProfileDetail(document.getElementById('appBody'));
    } catch (err) {
      App.toast('Failed to update MFA setting', 'error');
    }
  },

  // ── Sub-Section: Manage Address ─────────────────────
  _renderAddressManager(container) {
    const addrs = State.addresses || [];
    container.innerHTML = `
      <div class="subsection-header">
        <button class="subsection-back-btn" onclick="App.backToProfileHub()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="subsection-title">Manage Address</span>
      </div>

      <!-- Map Container -->
      <div id="addressMap" class="address-map-container"></div>

      <!-- Address List -->
      <div class="address-list">
        ${addrs.length ? addrs.map(a => `
          <div class="address-card ${a.is_default ? 'default' : ''}" onclick="BuyerViews._selectAddress('${a.address_id}')">
            <div class="address-card-icon">${a.label === 'Home' ? '🏠' : a.label === 'Work' ? '🏢' : '📍'}</div>
            <div class="address-card-info">
              <div class="address-card-label">
                ${a.label}
                ${a.is_default ? '<span class="address-default-tag">Default</span>' : ''}
              </div>
              <div class="address-card-detail">${a.sub_city}${a.woreda ? ', '+a.woreda : ''} ${a.house_number ? '· '+a.house_number : ''}</div>
              <div class="address-card-phone">📞 ${a.phone}</div>
            </div>
            <div class="address-card-actions">
              <button class="address-action-btn" onclick="event.stopPropagation();BuyerViews._editAddress('${a.address_id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="address-action-btn danger" onclick="event.stopPropagation();App.deleteAddress('${a.address_id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        `).join('') : `
          <div class="empty-state" style="padding:30px 20px;">
            <div class="empty-icon">📍</div>
            <div class="empty-title">No saved addresses</div>
            <div class="empty-desc">Add a delivery address for faster checkout.</div>
          </div>
        `}
      </div>

      <button class="btn-primary" onclick="BuyerViews._openAddAddressModal()" style="margin-top:12px;">
        <span style="display:flex;align-items:center;justify-content:center;gap:8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add New Address
        </span>
      </button>
    `;

    setTimeout(() => this._initAddressMap(), 100);
  },

  _initAddressMap() {
    if (typeof L === 'undefined') return;
    const mapEl = document.getElementById('addressMap');
    if (!mapEl) return;
    const map = L.map(mapEl).setView([9.0192, 38.7525], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    const addrs = State.addresses || [];
    addrs.forEach(a => {
      if (a.latitude && a.longitude) {
        L.marker([a.latitude, a.longitude]).addTo(map).bindPopup(a.label);
      }
    });

    setTimeout(() => map.invalidateSize(), 200);
  },

  _selectAddress(addressId) {
    const a = State.addresses.find(addr => addr.address_id === addressId);
    if (a && a.latitude && a.longitude) {
      const map = document.getElementById('addressMap');
      if (map && map._leaflet_id) {
        L.map(map).setView([a.latitude, a.longitude], 16);
      }
    }
  },

  _openAddAddressModal() {
    const subCities = ['Bole','Kirkos','Yeka','Lideta','Gulele','Nifas Silk','Addis Ketema','Akaki Kality','Lemi Kura','Kolfe Keranio'];
    App._openAddressModal({
      title: 'Add New Address',
      label: 'Home',
      sub_city: subCities[0],
      woreda: '',
      house_number: '',
      landmark: '',
      phone: '',
      is_default: false,
      onSave: async (data) => {
        try {
          const result = await Api.users.addAddress(data);
          State.addresses.push(result.address);
          App.closeModalOnBg({ target: document.getElementById('modalBackdrop') });
          App.renderContent();
          App.toast('Address saved!', 'success');
        } catch (err) {
          App.toast('Could not save address', 'error');
        }
      }
    });
  },

  _editAddress(addressId) {
    const a = State.addresses.find(addr => addr.address_id === addressId);
    if (!a) return;
    const subCities = ['Bole','Kirkos','Yeka','Lideta','Gulele','Nifas Silk','Addis Ketema','Akaki Kality','Lemi Kura','Kolfe Keranio'];
    App._openAddressModal({
      title: 'Edit Address',
      label: a.label,
      sub_city: a.sub_city,
      woreda: a.woreda || '',
      house_number: a.house_number || '',
      landmark: a.landmark || '',
      phone: a.phone,
      is_default: a.is_default,
      onSave: async (data) => {
        try {
          const result = await Api.users.updateAddress(a.address_id, data);
          const idx = State.addresses.findIndex(addr => addr.address_id === a.address_id);
          if (idx >= 0) State.addresses[idx] = result.address;
          Modals.close();
          App.renderContent();
          App.toast('Address updated!', 'success');
        } catch (err) {
          App.toast('Could not update address', 'error');
        }
      }
    });
  },

  // ── Sub-Section: Payment Methods ────────────────────
  _renderPaymentMethods(container) {
    const methods = State.paymentMethods || [];
    const brandColors = { visa: '#1A1F71', mastercard: '#EB001B', amex: '#006FCF' };
    const brandGradients = {
      visa: 'linear-gradient(135deg, #1A1F71, #2D3FB5)',
      mastercard: 'linear-gradient(135deg, #EB001B, #F79E1B)',
      amex: 'linear-gradient(135deg, #006FCF, #00A3E0)',
    };

    container.innerHTML = `
      <div class="subsection-header">
        <button class="subsection-back-btn" onclick="App.backToProfileHub()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="subsection-title">Payment Methods</span>
      </div>

      <!-- Saved Cards -->
      <div class="payment-cards-list">
        ${methods.length ? methods.map(m => `
          <div class="payment-card" style="background:${brandGradients[m.card_brand] || brandGradients.visa};">
            <div class="payment-card-top">
              <span class="payment-card-brand">${m.card_brand.toUpperCase()}</span>
              ${m.is_default ? '<span class="payment-card-default">Default</span>' : ''}
            </div>
            <div class="payment-card-number">•••• •••• •••• ${m.last_four}</div>
            <div class="payment-card-bottom">
              <div>
                <div class="payment-card-label">Cardholder</div>
                <div class="payment-card-value">${m.cardholder_name || 'N/A'}</div>
              </div>
              <div>
                <div class="payment-card-label">Expires</div>
                <div class="payment-card-value">${String(m.exp_month).padStart(2,'0')}/${String(m.exp_year).slice(-2)}</div>
              </div>
              <div class="payment-card-actions">
                ${!m.is_default ? `<button class="payment-card-action" onclick="BuyerViews._setDefaultPayment('${m.method_id}')">Set Default</button>` : ''}
                <button class="payment-card-action danger" onclick="BuyerViews._deletePayment('${m.method_id}')">Remove</button>
              </div>
            </div>
          </div>
        `).join('') : `
          <div class="empty-state" style="padding:30px 20px;">
            <div class="empty-icon">💳</div>
            <div class="empty-title">No saved cards</div>
            <div class="empty-desc">Add a payment method for faster checkout.</div>
          </div>
        `}
      </div>

      <!-- Alternative Methods -->
      <div class="payment-alt-section">
        <div class="profile-detail-section-title">Other Payment Methods</div>
        <div class="payment-alt-grid">
          <div class="payment-alt-badge"><span style="font-size:20px;">📱</span> Telebirr</div>
          <div class="payment-alt-badge"><span style="font-size:20px;">🏦</span> CBE Birr</div>
          <div class="payment-alt-badge"><span style="font-size:20px;">💵</span> Cash on Delivery</div>
        </div>
      </div>

      <button class="btn-primary" onclick="BuyerViews._openAddCardModal()" style="margin-top:12px;">
        <span style="display:flex;align-items:center;justify-content:center;gap:8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add New Card
        </span>
      </button>
    `;
  },

  _detectCardBrand(number) {
    const cleaned = number.replace(/\s/g, '');
    if (/^4/.test(cleaned)) return 'visa';
    if (/^5[1-5]/.test(cleaned) || /^2[2-7]/.test(cleaned)) return 'mastercard';
    if (/^3[47]/.test(cleaned)) return 'amex';
    return 'visa';
  },

  _luhnCheck(num) {
    const digits = num.replace(/\s/g, '');
    if (!/^\d{13,19}$/.test(digits)) return false;
    let sum = 0;
    let alternate = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = parseInt(digits[i], 10);
      if (alternate) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
      alternate = !alternate;
    }
    return sum % 10 === 0;
  },

  _openAddCardModal() {
    Modals.open(`
      <div class="modal-handle"></div>
      <div class="modal-title">Add Payment Card</div>
      <div class="modal-sub" style="color:var(--text-secondary);">Your card details are encrypted. Only the last 4 digits are stored.</div>

      <div class="form-group">
        <label class="form-label">Card Number</label>
        <input class="form-input" id="addCardNumber" type="text" maxlength="19" placeholder="1234 5678 9012 3456"
               oninput="BuyerViews._formatCardNumber(this)" />
        <div id="cardBrandDisplay" style="font-size:11px;margin-top:4px;color:var(--text-secondary);"></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="form-group">
          <label class="form-label">Expiry</label>
          <input class="form-input" id="addCardExpiry" type="text" maxlength="5" placeholder="MM/YY"
                 oninput="BuyerViews._formatExpiry(this)" />
        </div>
        <div class="form-group">
          <label class="form-label">CVV</label>
          <input class="form-input" id="addCardCVV" type="password" maxlength="4" placeholder="•••"/>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Cardholder Name</label>
        <input class="form-input" id="addCardName" type="text" placeholder="John Doe"/>
      </div>

      <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:16px;cursor:pointer;">
        <input type="checkbox" id="addCardDefault" style="accent-color:var(--accent);"> Set as default
      </label>

      <button class="btn-primary" onclick="BuyerViews._saveNewCard()">Save Card</button>
    `);
  },

  _formatCardNumber(input) {
    let v = input.value.replace(/\D/g, '').substring(0, 16);
    let formatted = v.replace(/(.{4})/g, '$1 ').trim();
    input.value = formatted;
    const brand = this._detectCardBrand(v);
    const brandEl = document.getElementById('cardBrandDisplay');
    if (brandEl && v.length >= 4) {
      const valid = this._luhnCheck(v);
      brandEl.innerHTML = `<span style="text-transform:uppercase;font-weight:700;">${brand}</span> · ${valid ? '<span style="color:var(--success);">Valid number</span>' : '<span style="color:var(--danger);">Invalid number</span>'}`;
    } else if (brandEl) {
      brandEl.textContent = '';
    }
  },

  _formatExpiry(input) {
    let v = input.value.replace(/\D/g, '').substring(0, 4);
    if (v.length >= 2) v = v.substring(0, 2) + '/' + v.substring(2);
    input.value = v;
  },

  async _saveNewCard() {
    const number = document.getElementById('addCardNumber')?.value?.replace(/\s/g, '');
    const expiry = document.getElementById('addCardExpiry')?.value;
    const cvv = document.getElementById('addCardCVV')?.value;
    const name = document.getElementById('addCardName')?.value?.trim();
    const isDefault = document.getElementById('addCardDefault')?.checked;

    if (!number || !this._luhnCheck(number)) { App.toast('Invalid card number', 'error'); return; }
    if (!expiry || !/^\d{2}\/\d{2}$/.test(expiry)) { App.toast('Invalid expiry date', 'error'); return; }
    if (!cvv || cvv.length < 3) { App.toast('Invalid CVV', 'error'); return; }

    const [expMonth, expYear] = expiry.split('/').map(Number);
    const brand = this._detectCardBrand(number);
    const lastFour = number.slice(-4);

    try {
      await Api.users.addPaymentMethod({
        card_brand: brand,
        last_four: lastFour,
        exp_month: expMonth,
        exp_year: 2000 + expYear,
        cardholder_name: name,
        is_default: isDefault
      });
      await App._loadPaymentMethods();
      Modals.close();
      this._renderPaymentMethods(document.getElementById('appBody'));
      App.toast('Card added!', 'success');
    } catch (err) {
      App.toast(err.message || 'Failed to add card', 'error');
    }
  },

  async _deletePayment(methodId) {
    if (!confirm('Remove this payment method?')) return;
    try {
      await Api.users.deletePaymentMethod(methodId);
      State.paymentMethods = (State.paymentMethods || []).filter(m => m.method_id !== methodId);
      this._renderPaymentMethods(document.getElementById('appBody'));
      App.toast('Card removed', 'info');
    } catch (err) {
      App.toast('Failed to remove card', 'error');
    }
  },

  async _setDefaultPayment(methodId) {
    try {
      await Api.users.setDefaultPayment(methodId);
      await App._loadPaymentMethods();
      this._renderPaymentMethods(document.getElementById('appBody'));
      App.toast('Default card updated', 'success');
    } catch (err) {
      App.toast('Failed to update default', 'error');
    }
  },

  // ── Sub-Section: My Orders (Detailed) ──────────────
  _renderOrdersDetail(container) {
    const orders = State.myOrders || [];
    const filter = State.ordersFilter || 'all';
    const filters = [
      { key: 'all', label: 'All' },
      { key: 'active', label: 'Active' },
      { key: 'completed', label: 'Completed' },
      { key: 'cancelled', label: 'Cancelled' },
    ];

    const filtered = orders.filter(o => {
      if (filter === 'active') return ['pending','confirmed','dispatched'].includes(o.order_status);
      if (filter === 'completed') return o.order_status === 'delivered';
      if (filter === 'cancelled') return o.order_status === 'cancelled';
      return true;
    });

    container.innerHTML = `
      <div class="subsection-header">
        <button class="subsection-back-btn" onclick="App.backToProfileHub()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="subsection-title">My Orders</span>
      </div>

      <!-- Filter Tabs -->
      <div class="orders-filter-bar">
        ${filters.map(f => `
          <button class="orders-filter-tab ${filter === f.key ? 'active' : ''}" onclick="State.ordersFilter='${f.key}';App.renderContent();">${f.label}</button>
        `).join('')}
      </div>

      <!-- Orders List -->
      <div class="orders-list">
        ${filtered.length ? filtered.map(o => this._orderCardDetailed(o)).join('') : `
          <div class="empty-state" style="padding:30px 20px;">
            <div class="empty-icon">📦</div>
            <div class="empty-title">No ${filter === 'all' ? '' : filter} orders</div>
            <div class="empty-desc">${filter === 'all' ? 'Your purchase history will appear here.' : 'No orders match this filter.'}</div>
          </div>
        `}
      </div>
    `;
  },

  _orderCardDetailed(o) {
    const isActive = ['pending','confirmed','dispatched'].includes(o.order_status);
    const isCompleted = o.order_status === 'delivered';
    const date = new Date(o.created_at).toLocaleDateString('en-ET', { year: 'numeric', month: 'short', day: 'numeric' });

    return `
      <div class="order-detail-card" onclick="App.openOrderDetail('${o.order_id}')">
        <div class="order-detail-top">
          <div>
            <div class="order-detail-ref">${o.order_ref}</div>
            <div class="order-detail-store">${o.store_name}</div>
            <div class="order-detail-date">${date}</div>
          </div>
          <div class="order-detail-right">
            <div class="order-detail-total">${State.formatETB(o.total_etb)}</div>
            <span class="order-status-badge status-${o.order_status}">${o.order_status}</span>
          </div>
        </div>
        ${o.rider_name ? `<div class="order-detail-rider">🛵 ${o.rider_name} · ${o.rider_phone}</div>` : ''}
        <div class="order-detail-actions">
          ${isActive && o.order_status === 'dispatched' ? `
            <button class="order-action-btn primary" onclick="event.stopPropagation();App.confirmDelivery('${o.order_id}')">Confirm Delivery</button>
            <button class="order-action-btn" onclick="event.stopPropagation();BuyerViews._trackOrder('${o.order_id}')">Track Live</button>
          ` : ''}
          ${isActive && o.order_status !== 'dispatched' ? `
            <button class="order-action-btn" onclick="event.stopPropagation();App.openOrderDetail('${o.order_id}')">View Details</button>
          ` : ''}
          ${isCompleted ? `
            <button class="order-action-btn primary" onclick="event.stopPropagation();App.openOrderDetail('${o.order_id}')">Write a Review</button>
          ` : ''}
          ${o.order_status === 'cancelled' ? `
            <span style="font-size:11px;color:var(--danger);">${o.cancel_reason || 'Order was cancelled'}</span>
          ` : ''}
        </div>
      </div>
    `;
  },

  _trackOrder(orderId) {
    App.toast('Live tracking coming soon!', 'info');
  },

  // ── Sub-Section: My Coupons ────────────────────────
  _renderCoupons(container) {
    const coupons = State.userCoupons || [];
    const available = coupons.filter(c => !c.is_redeemed);
    const redeemed = coupons.filter(c => c.is_redeemed);

    container.innerHTML = `
      <div class="subsection-header">
        <button class="subsection-back-btn" onclick="App.backToProfileHub()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="subsection-title">My Coupons</span>
      </div>

      <!-- Promo Code Input -->
      <div class="coupon-input-section">
        <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;">Have a promo code?</div>
        <div class="coupon-input-row">
          <input class="form-input" id="couponInput" type="text" placeholder="Enter code" style="text-transform:uppercase;"/>
          <button class="btn-primary" style="width:auto;padding:10px 20px;" onclick="BuyerViews._validateCouponCode()">Apply</button>
        </div>
        <div id="couponValidationMsg" style="margin-top:6px;font-size:12px;"></div>
      </div>

      <!-- Available Coupons -->
      <div class="coupon-section">
        <div class="profile-detail-section-title">Available Coupons (${available.length})</div>
        ${available.length ? available.map(c => this._couponCard(c)).join('') : `
          <div class="empty-state" style="padding:20px;">
            <div class="empty-icon">🎟️</div>
            <div class="empty-desc">No coupons yet. Check back soon!</div>
          </div>
        `}
      </div>

      ${redeemed.length ? `
      <div class="coupon-section">
        <div class="profile-detail-section-title">Redeemed (${redeemed.length})</div>
        ${redeemed.map(c => this._couponCard(c, true)).join('')}
      </div>` : ''}
    `;
  },

  _couponCard(c, redeemed = false) {
    const discount = c.discount_type === 'percent' ? `${c.discount_value}% OFF` : `Br ${Number(c.discount_value).toLocaleString()} OFF`;
    const expiry = c.expires_at ? new Date(c.expires_at) : null;
    const now = new Date();
    const daysLeft = expiry ? Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))) : null;

    return `
      <div class="coupon-card ${redeemed ? 'redeemed' : ''}">
        <div class="coupon-card-left">
          <div class="coupon-discount">${discount}</div>
          ${c.min_order_etb > 0 ? `<div class="coupon-min-order">Min. order: ${State.formatETB(c.min_order_etb)}</div>` : ''}
          ${daysLeft !== null ? `<div class="coupon-expiry ${daysLeft <= 3 ? 'urgent' : ''}">${daysLeft > 0 ? `Expires in ${daysLeft} days` : 'Expired'}</div>` : ''}
        </div>
        <div class="coupon-card-right">
          ${!redeemed ? `
            <button class="coupon-copy-btn" onclick="BuyerViews._copyCoupon('${c.code}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
          ` : '<span style="font-size:11px;color:var(--text-muted);">Used</span>'}
        </div>
      </div>
    `;
  },

  _copyCoupon(code) {
    navigator.clipboard.writeText(code).then(() => {
      App.toast(`Code "${code}" copied!`, 'success');
    }).catch(() => {
      App.toast('Failed to copy', 'error');
    });
  },

  async _validateCouponCode() {
    const input = document.getElementById('couponInput');
    const msgEl = document.getElementById('couponValidationMsg');
    const code = input?.value?.trim();
    if (!code) { msgEl.innerHTML = '<span style="color:var(--danger);">Enter a code first</span>'; return; }

    msgEl.innerHTML = '<span style="color:var(--text-secondary);">Validating...</span>';
    try {
      const result = await Api.users.validateCoupon(code);
      msgEl.innerHTML = `<span style="color:var(--success);">✓ ${result.message}</span>`;
      await App._loadUserCoupons();
      setTimeout(() => this._renderCoupons(document.getElementById('appBody')), 1000);
    } catch (err) {
      msgEl.innerHTML = `<span style="color:var(--danger);">✕ ${err.message}</span>`;
    }
  },

  // ── Sub-Section: Settings ──────────────────────────
  _renderSettings(container) {
    const s = State.userSettings || {};

    container.innerHTML = `
      <div class="subsection-header">
        <button class="subsection-back-btn" onclick="App.backToProfileHub()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="subsection-title">Settings</span>
      </div>

      <!-- Appearance -->
      <div class="settings-group">
        <div class="settings-group-title">Appearance</div>
        <div class="settings-toggle-row">
          <div class="settings-toggle-info">
            <div class="settings-toggle-label">Dark Mode</div>
            <div class="settings-toggle-desc">Use dark theme throughout the app</div>
          </div>
          <button class="toggle-switch ${s.dark_mode ? 'active' : ''}" onclick="BuyerViews._updateSetting('dark_mode', !${s.dark_mode})">
            <div class="toggle-thumb"></div>
          </button>
        </div>
      </div>

      <!-- Notifications -->
      <div class="settings-group">
        <div class="settings-group-title">Push Notifications</div>
        <div class="settings-toggle-row">
          <div class="settings-toggle-info">
            <div class="settings-toggle-label">Order Updates</div>
            <div class="settings-toggle-desc">Dispatch, delivery, and status changes</div>
          </div>
          <button class="toggle-switch ${s.notif_orders ? 'active' : ''}" onclick="BuyerViews._updateSetting('notif_orders', !${s.notif_orders})">
            <div class="toggle-thumb"></div>
          </button>
        </div>
        <div class="settings-toggle-row">
          <div class="settings-toggle-info">
            <div class="settings-toggle-label">Promotions & Deals</div>
            <div class="settings-toggle-desc">Sales, discounts, and new arrivals</div>
          </div>
          <button class="toggle-switch ${s.notif_promos ? 'active' : ''}" onclick="BuyerViews._updateSetting('notif_promos', !${s.notif_promos})">
            <div class="toggle-thumb"></div>
          </button>
        </div>
        <div class="settings-toggle-row">
          <div class="settings-toggle-info">
            <div class="settings-toggle-label">Chat Alerts</div>
            <div class="settings-toggle-desc">Messages from sellers and support</div>
          </div>
          <button class="toggle-switch ${s.notif_chat ? 'active' : ''}" onclick="BuyerViews._updateSetting('notif_chat', !${s.notif_chat})">
            <div class="toggle-thumb"></div>
          </button>
        </div>
      </div>

      <!-- Security -->
      <div class="settings-group">
        <div class="settings-group-title">Security</div>
        <div class="settings-toggle-row">
          <div class="settings-toggle-info">
            <div class="settings-toggle-label">Biometric Login</div>
            <div class="settings-toggle-desc">FaceID or Fingerprint authentication</div>
          </div>
          <button class="toggle-switch ${s.biometric_login ? 'active' : ''}" onclick="BuyerViews._updateSetting('biometric_login', !${s.biometric_login})">
            <div class="toggle-thumb"></div>
          </button>
        </div>
      </div>

      <!-- Performance -->
      <div class="settings-group">
        <div class="settings-group-title">Performance</div>
        <div class="settings-action-row" onclick="BuyerViews._clearCache()">
          <div class="settings-action-info">
            <div class="settings-action-label">Clear App Cache</div>
            <div class="settings-action-desc">Free up storage and refresh cached data</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>

      <!-- App Info -->
      <div class="settings-app-info">
        <div>Medebirr v1.0.0</div>
        <div style="color:var(--text-muted);">Ethiopia's Free Shopping Experience</div>
      </div>

      <!-- Logout -->
      <button class="settings-logout-btn" onclick="BuyerViews._confirmLogout()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Log Out
      </button>
    `;
  },

  async _updateSetting(key, value) {
    State.userSettings = { ...State.userSettings, [key]: value };
    try {
      await Api.users.updateSettings({ [key]: value });
    } catch (e) {}
    this._renderSettings(document.getElementById('appBody'));
  },

  _clearCache() {
    try {
      localStorage.removeItem('em_products_cache');
      localStorage.removeItem('em_stores_cache');
      App.toast('Cache cleared!', 'success');
    } catch (e) {
      App.toast('Failed to clear cache', 'error');
    }
  },

  _confirmLogout() {
    Modals.open(`
      <div class="modal-handle"></div>
      <div style="text-align:center;padding:16px 0;">
        <div style="font-size:40px;margin-bottom:14px;">👋</div>
        <div style="font-size:17px;font-weight:900;margin-bottom:8px;">Log Out?</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;">You'll need to sign in again to access your account.</div>
        <div style="display:flex;gap:10px;">
          <button class="btn-secondary" onclick="Modals.close();" style="flex:1;">Cancel</button>
          <button onclick="App.clearToken();location.reload();" style="flex:1;background:var(--danger);color:white;border:none;padding:13px;border-radius:var(--radius-md);font-size:14px;font-weight:800;cursor:pointer;">Log Out</button>
        </div>
      </div>
    `);
  },

  // ── Sub-Section: Help Center ───────────────────────
  _renderHelpCenter(container) {
    const faqs = [
      { q: 'How do I return an item?', a: 'Navigate to My Orders, find the order, and tap "Request Return" within the return window specified by the store\'s policy. The seller will review and process your request within 24 hours.' },
      { q: 'My order hasn\'t arrived. What should I do?', a: 'Check your order status in My Orders. If it\'s been dispatched, you can track the rider. If it\'s been more than the estimated delivery time, contact support and we\'ll investigate immediately.' },
      { q: 'How do I get a refund?', a: 'Refunds are processed once the returned item is received and verified by the seller. The refund will be credited to your original payment method within 3-5 business days.' },
      { q: 'Payment failed but money was deducted', a: 'Don\'t worry — failed payments are automatically reversed within 24 hours. If the amount isn\'t refunded after 24 hours, contact our support team with your transaction reference.' },
      { q: 'How does Cash on Delivery work?', a: 'Pay with cash when your order arrives. The rider will collect the exact amount shown in your order. Please have the correct change ready for a smooth transaction.' },
      { q: 'Can I change my delivery address after ordering?', a: 'You can modify your delivery address only while the order status is "Pending". Once confirmed or dispatched, address changes are not possible.' },
    ];

    container.innerHTML = `
      <div class="subsection-header">
        <button class="subsection-back-btn" onclick="App.backToProfileHub()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="subsection-title">Help Center</span>
      </div>

      <!-- FAQ Section -->
      <div class="help-faq-section">
        <div class="profile-detail-section-title">Frequently Asked Questions</div>
        <div class="help-accordion">
          ${faqs.map((f, i) => `
            <div class="help-accordion-item" id="faq-${i}">
              <button class="help-accordion-header" onclick="BuyerViews._toggleFAQ(${i})">
                <span>${f.q}</span>
                <svg class="help-accordion-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div class="help-accordion-body">
                <p>${f.a}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Contact Section -->
      <div class="help-contact-section">
        <div class="profile-detail-section-title">Still need help?</div>
        <div class="help-contact-grid">
          <button class="help-contact-card primary" onclick="App.toast('Live chat coming soon!', 'info')">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Start Live AI Chat</span>
          </button>
          <button class="help-contact-card" onclick="window.open('tel:+251911234567')">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            <span>Call Support</span>
          </button>
        </div>
      </div>
    `;
  },

  _toggleFAQ(index) {
    const el = document.getElementById(`faq-${index}`);
    if (el) el.classList.toggle('open');
  },

  // ── Sub-Section: Privacy Policy ────────────────────
  _renderPrivacy(container) {
    container.innerHTML = `
      <div class="subsection-header">
        <button class="subsection-back-btn" onclick="App.backToProfileHub()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="subsection-title">Privacy Policy</span>
      </div>

      <div class="privacy-viewport">
        <div class="privacy-toc">
          <div class="privacy-toc-title">Table of Contents</div>
          <a class="privacy-toc-link" onclick="document.getElementById('priv-1').scrollIntoView({behavior:'smooth'})">1. Information We Collect</a>
          <a class="privacy-toc-link" onclick="document.getElementById('priv-2').scrollIntoView({behavior:'smooth'})">2. How We Use Your Information</a>
          <a class="privacy-toc-link" onclick="document.getElementById('priv-3').scrollIntoView({behavior:'smooth'})">3. Information Sharing</a>
          <a class="privacy-toc-link" onclick="document.getElementById('priv-4').scrollIntoView({behavior:'smooth'})">4. Data Security</a>
          <a class="privacy-toc-link" onclick="document.getElementById('priv-5').scrollIntoView({behavior:'smooth'})">5. Your Rights</a>
          <a class="privacy-toc-link" onclick="document.getElementById('priv-6').scrollIntoView({behavior:'smooth'})">6. Contact Us</a>
        </div>

        <div class="privacy-section" id="priv-1">
          <h3>1. Information We Collect</h3>
          <p>We collect information you provide directly to Medebirr:</p>
          <ul>
            <li><strong>Account Information:</strong> Name, phone number, and Telegram user ID for authentication</li>
            <li><strong>Delivery Addresses:</strong> Physical addresses for order fulfillment</li>
            <li><strong>Payment Data:</strong> Only the last 4 digits and expiry of payment cards (full card numbers are never stored)</li>
            <li><strong>Order History:</strong> Purchase records, reviews, and communication with sellers</li>
            <li><strong>Device Information:</strong> App version, device type, and usage analytics</li>
          </ul>
        </div>

        <div class="privacy-section" id="priv-2">
          <h3>2. How We Use Your Information</h3>
          <ul>
            <li>Process and fulfill your orders</li>
            <li>Communicate order status and delivery updates</li>
            <li>Improve our services and user experience</li>
            <li>Process payments securely through verified gateways</li>
            <li>Prevent fraud and ensure platform security</li>
            <li>Send promotional communications (with your consent)</li>
          </ul>
        </div>

        <div class="privacy-section" id="priv-3">
          <h3>3. Information Sharing</h3>
          <p>We share your information only as necessary to provide our services:</p>
          <ul>
            <li><strong>Sellers:</strong> Order details and delivery address for fulfillment</li>
            <li><strong>Payment Processors:</strong> Telebirr, Chapa for secure payment handling</li>
            <li><strong>Delivery Partners:</strong> Name and phone for rider assignment</li>
            <li><strong>Legal Requirements:</strong> When required by Ethiopian law</li>
          </ul>
          <p>We never sell your personal data to third parties.</p>
        </div>

        <div class="privacy-section" id="priv-4">
          <h3>4. Data Security</h3>
          <p>We implement industry-standard security measures:</p>
          <ul>
            <li>Encrypted data transmission (TLS/SSL)</li>
            <li>Secure JWT authentication</li>
            <li>PCI-compliant payment handling</li>
            <li>Regular security audits</li>
            <li>Restricted access controls</li>
          </ul>
        </div>

        <div class="privacy-section" id="priv-5">
          <h3>5. Your Rights</h3>
          <p>You have the right to:</p>
          <ul>
            <li>Access your personal data</li>
            <li>Correct inaccurate information</li>
            <li>Delete your account and associated data</li>
            <li>Opt out of promotional communications</li>
            <li>Export your order history</li>
          </ul>
        </div>

        <div class="privacy-section" id="priv-6">
          <h3>6. Contact Us</h3>
          <p>For privacy-related inquiries:</p>
          <ul>
            <li>Email: privacy@medebirr.com</li>
            <li>Phone: +251 911 234 567</li>
            <li>Address: Addis Ababa, Ethiopia</li>
          </ul>
          <p style="font-size:11px;color:var(--text-muted);margin-top:16px;">Last updated: July 2026</p>
        </div>

        <button class="btn-secondary" onclick="App.toast('PDF download coming soon!', 'info')" style="margin-top:16px;">
          <span style="display:flex;align-items:center;justify-content:center;gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Policy PDF
          </span>
        </button>
      </div>
    `;
  },
  renderCart(container) {
    const shopIds = Object.keys(State.cart);
    if (!shopIds.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🛍️</div>
          <div class="empty-title">Your cart is empty</div>
          <div class="empty-desc">Explore 1,000+ Ethiopian shops and add items.<br/>Each seller's items are grouped for direct checkout.</div>
          <button class="btn-primary" style="margin-top:20px;" onclick="App.switchTab('explore')">Browse Shops</button>
        </div>`;
      return;
    }
    container.innerHTML = `
      <div class="section-header">
        <span class="section-title">Direct Store-by-Store Checkout</span>
        <span style="font-size:11px;color:var(--text-secondary);">${shopIds.length} store${shopIds.length>1?'s':''}</span>
      </div>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5;">
        Items from <strong>${shopIds.length}</strong> store${shopIds.length>1?'s':''} — pay each seller directly via Telebirr with zero escrow.
      </p>
      ${shopIds.map(id => this._storePackage(id)).join('')}
    `;
  },

  _storePackage(shopId) {
    const pkg = State.cart[shopId];
    const sub = State.pkgSubtotal(shopId);
    const total = State.pkgTotal(shopId);
    return `
      <div class="store-package">
        <div class="pkg-header">
          <div>
            <div class="pkg-store-name">🏪 ${pkg.shopName}</div>
            <div class="pkg-location">📍 ${pkg.location}</div>
          </div>
          <span class="pkg-policy-tag">${State.policyLabel(pkg.returnPolicy)}</span>
        </div>
        ${pkg.items.map(i => this._pkgItem(shopId, i)).join('')}
        <div class="pkg-footer">
          <div>
            <div style="font-size:11px;color:var(--text-secondary);">Sub: ${State.formatETB(sub)} + Delivery: ${State.formatETB(pkg.deliveryFee)}</div>
            <div class="pkg-total">Total: <span>${State.formatETB(total)}</span></div>
          </div>
          <button class="btn-checkout-store" onclick="Modals.openCheckout('${shopId}')">Checkout &amp; Pay →</button>
        </div>
      </div>
    `;
  },

  _pkgItem(shopId, ci) {
    const p = ci.product;
    return `
      <div class="pkg-item">
        <div class="pkg-item-info">
          <div class="pkg-item-title">${p.title}</div>
          <div class="pkg-item-price">${State.formatETB(p.price_etb)} × ${ci.qty} = ${State.formatETB(p.price_etb * ci.qty)}</div>
        </div>
        <div class="qty-ctrl">
          <button class="qty-btn" onclick="App.updateQty('${shopId}','${p.product_id}',${ci.qty-1})">−</button>
          <span class="qty-num">${ci.qty}</span>
          <button class="qty-btn" onclick="App.updateQty('${shopId}','${p.product_id}',${ci.qty+1})">+</button>
        </div>
      </div>
    `;
  },

  // ── Wishlist ──────────────────────────────────────
  renderWishlist(container) {
    if (!State.wishlistItems || !State.wishlistItems.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">❤️</div>
          <div class="empty-title">No saved items</div>
          <div class="empty-desc">Heart items while browsing to save them here.</div>
          <button class="btn-primary" style="margin-top:20px;" onclick="App.switchTab('explore')">Start Exploring</button>
        </div>`;
      return;
    }
    container.innerHTML = `
      <div class="section-header"><span class="section-title">Saved Items</span></div>
      <div class="item-grid">
        ${State.wishlistItems.map(p => this._itemCard(p)).join('')}
      </div>`;
  },

  // ── Orders ────────────────────────────────────────
  renderOrders(container) {
    if (!State.myOrders.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <div class="empty-title">No orders yet</div>
          <div class="empty-desc">Your purchase history will appear here after your first order.</div>
          <button class="btn-primary" style="margin-top:20px;" onclick="App.switchTab('explore')">Shop Now</button>
        </div>`;
      return;
    }
    container.innerHTML = `
      <div class="section-header"><span class="section-title">My Deliveries</span></div>
      ${State.myOrders.map(o => this._orderCard(o)).join('')}
    `;
  },

  _orderCard(o) {
    const addr = typeof o.delivery_address === 'string' ? JSON.parse(o.delivery_address) : o.delivery_address;
    return `
      <div class="card" style="margin-bottom:10px;cursor:pointer;" onclick="App.openOrderDetail('${o.order_id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div>
            <div style="font-size:13px;font-weight:800;">${o.order_ref}</div>
            <div style="font-size:11px;color:var(--text-secondary);">${o.store_name}</div>
          </div>
          <span class="order-status-badge status-${o.order_status}">${o.order_status}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:14px;font-weight:900;color:var(--accent);">${State.formatETB(o.total_etb)}</div>
          <div style="font-size:11px;color:var(--text-secondary);">${new Date(o.created_at).toLocaleDateString()}</div>
        </div>
        ${o.rider_name ? `<div style="margin-top:8px;font-size:11px;color:#A78BFA;">🛵 Rider: ${o.rider_name} · ${o.rider_phone}</div>` : ''}
        ${o.order_status === 'dispatched' ? `<button class="btn-primary" style="margin-top:10px;padding:9px;" onclick="event.stopPropagation();App.confirmDelivery('${o.order_id}')">✅ Confirm Delivery (QR Handshake)</button>` : ''}
      </div>
    `;
  }
};
