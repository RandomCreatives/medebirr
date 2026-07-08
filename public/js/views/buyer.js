/* ═══════════════════════════════════════════════════
   Buyer Views: Explore, Cart, Wishlist, Orders
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
    `;
  },

  _filterPills() {
    const filters = [
      { key: 'all', label: '🌐 All Shops' },
      { key: 'electronics', label: '📱 Electronics' },
      { key: 'fashion', label: '👗 Fashion' },
      { key: 'groceries', label: '☕ Coffee & Food' },
    ];
    return filters.map(f => `
      <button class="filter-pill ${State.activeFilter === f.key ? 'active' : ''}" onclick="App.handleFilter('${f.key}')">${f.label}</button>
    `).join('');
  },

  _itemCard(p) {
    const inWishlist = State.wishlist.has(p.product_id);
    const gradient = this._categoryGradient(p.category);
    const compare = p.compare_price ? `<span class="item-compare">${State.formatETB(p.compare_price)}</span>` : '';
    return `
      <div class="item-card" onclick="App.openProduct('${p.product_id}')">
        <div class="item-thumb" style="background:${gradient};">
          ${p.return_policy_type ? `<span class="item-policy-tag">${State.policyLabel(p.return_policy_type).split('-')[0]}</span>` : ''}
          <div class="item-store-badge">🏪 ${p.store_name}</div>
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
      fashion: 'linear-gradient(135deg,#f857a6,#ff5858)',
      groceries: 'linear-gradient(135deg,#fa709a,#fee140)',
      footwear: 'linear-gradient(135deg,#4facfe,#00f2fe)',
      default: 'linear-gradient(135deg,#667eea,#764ba2)'
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

  // ── Cart ──────────────────────────────────────────
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
