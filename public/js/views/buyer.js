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

  // ── Profile Page ──────────────────────────────────
  renderProfile(container) {
    const u = State.user;
    if (!u) return;
    const isSeller = State.stores.length > 0;
    const gradients = ['linear-gradient(135deg,#FCCD04,#F59E0B)','linear-gradient(135deg,#3B82F6,#1D4ED8)','linear-gradient(135deg,#10B981,#059669)'];
    const grad = gradients[(u.firstName||'U').charCodeAt(0) % gradients.length];

    container.innerHTML = `
      <!-- Avatar + Identity -->
      <div style="text-align:center;padding:20px 0 16px 0;">
        <div style="width:80px;height:80px;border-radius:50%;background:${grad};display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:900;color:#111;margin:0 auto 12px auto;">
          ${(u.firstName||'U')[0].toUpperCase()}
        </div>
        <div style="font-size:20px;font-weight:900;">${u.firstName} ${u.lastName||''}</div>
        ${u.username ? `<div style="font-size:13px;color:var(--text-secondary);">@${u.username}</div>` : ''}
        <div style="margin-top:8px;">
          <span style="font-size:11px;padding:3px 12px;border-radius:20px;font-weight:800;${isSeller ? 'background:rgba(252,205,4,0.2);color:#FCCD04;' : 'background:rgba(59,130,246,0.2);color:#60A5FA;'}">
            ${isSeller ? '🏬 Seller' : '🛒 Buyer'}
          </span>
        </div>
      </div>

      <div class="divider"></div>

      <!-- Personal Info -->
      <div style="margin:16px 0;">
        <div style="font-size:11px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;">Personal Info</div>
        <div id="profileEditForm">
          ${this._profileInfoRow('First Name',  u.firstName,  'editFirstName')}
          ${this._profileInfoRow('Last Name',   u.lastName||'', 'editLastName')}
          ${this._profileInfoRow('Phone',       u.phone||'',    'editPhone', 'tel')}
          ${this._profileInfoRow('City',        u.city||'Addis Ababa', 'editCity')}
        </div>
        <button onclick="App.saveProfile()" class="btn-primary" style="margin-top:12px;">
          💾 Save Changes
        </button>
      </div>

      <div class="divider"></div>

      <!-- Saved Addresses -->
      <div style="margin:16px 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.8px;">Saved Addresses</div>
          <button onclick="App.openAddAddressModal()" style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;font-weight:700;">+ Add</button>
        </div>
        ${State.addresses.length
          ? State.addresses.map(a => `
            <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-size:13px;font-weight:800;">${a.label} ${a.is_default ? '<span style="font-size:9px;background:rgba(252,205,4,0.2);color:var(--accent);padding:1px 6px;border-radius:10px;">Default</span>' : ''}</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">📍 ${a.sub_city}${a.woreda?', '+a.woreda:''} ${a.house_number?'· '+a.house_number:''}</div>
                <div style="font-size:11px;color:var(--text-secondary);">📞 ${a.phone}</div>
              </div>
              <button onclick="App.deleteAddress('${a.address_id}')"
                style="background:none;border:none;color:var(--danger);font-size:16px;cursor:pointer;padding:4px;">🗑</button>
            </div>`).join('')
          : '<div style="font-size:13px;color:var(--text-secondary);">No saved addresses. Add one for faster checkout.</div>'}
      </div>

      <div class="divider"></div>

      <!-- Store section for sellers -->
      ${isSeller ? `
      <div style="margin:16px 0;">
        <div style="font-size:11px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;">My Stores</div>
        ${State.stores.map(s => `
          <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
              <div>
                <div style="font-size:13px;font-weight:800;">${s.store_name}</div>
                <div style="font-size:11px;color:${s.status==='verified'?'var(--success)':'var(--warning)'};">${s.status==='verified'?'✓ Verified':'⏳ Pending'}</div>
                ${s.tg_channel_username ? `<div style="font-size:11px;color:var(--text-secondary);">📢 @${s.tg_channel_username}</div>` : ''}
              </div>
              <button onclick="App.toggleRole();App.switchTab('dashboard');" style="background:rgba(252,205,4,0.15);border:1px solid rgba(252,205,4,0.3);color:#FCCD04;padding:7px 12px;border-radius:8px;font-size:11px;font-weight:800;cursor:pointer;">
                Studio →
              </button>
            </div>
            <button onclick="App.confirmDeleteStore('${s.store_id}','${s.store_name.replace(/'/g,'\\\'')}')"
              style="width:100%;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.18);color:var(--danger);padding:7px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">
              🗑️ Delete Store
            </button>
          </div>`).join('')}
      </div>
      <div class="divider"></div>` : `
      <div style="margin:16px 0;">
        <button onclick="App.openRegisterStoreModal()" class="btn-primary" style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:var(--success);">
          🏪 Open a Shop on Medebirr — Free
        </button>
      </div>
      <div class="divider"></div>`}

      <!-- Actions -->
      <div style="margin:16px 0;display:flex;flex-direction:column;gap:8px;">
        <button onclick="App.switchTab('orders')" class="btn-secondary">📦 My Orders & Deliveries</button>
        ${!window.Telegram?.WebApp?.initData ? `
        <button onclick="App._switchUser()" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:var(--danger);padding:11px;border-radius:var(--radius-sm);font-size:13px;font-weight:700;cursor:pointer;width:100%;">
          ⇄ Switch Account
        </button>` : ''}
      </div>
    `;
  },

  _profileInfoRow(label, value, id, type='text') {
    return `
      <div style="margin-bottom:10px;">
        <label class="form-label">${label}</label>
        <input class="form-input" id="${id}" type="${type}" value="${value||''}" placeholder="${label}..."/>
      </div>`;
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
