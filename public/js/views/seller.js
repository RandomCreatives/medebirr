/* ═══════════════════════════════════════════════════
   Seller Studio Views
═══════════════════════════════════════════════════ */

const SellerViews = {

  // ── Sales Dashboard ───────────────────────────────
  renderDashboard(container) {
    const stats = State.sellerStats;
    if (!stats) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">${State.t('seller.dash.loading')}</div></div>`;
      App.loadSellerStats();
      return;
    }
    const { orders, products, recentOrders } = stats;
    const store = State.stores[0];
    const reviews = State.storeReviews || [];
    const pending = State.pendingProducts || [];
    const verificationTier = store?.verification_tier || 'none';
    const tierBadge = { none: '', basic: '🟢 Basic', verified: '✅ Verified', trusted: '⭐ Trusted' };
    container.innerHTML = `
      <div class="section-header">
        <span class="section-title">${State.t('seller.hub.title')}</span>
        <div style="display:flex;align-items:center;gap:14px;">
          <button class="hub-bell-btn" onclick="App.openSellerNotifications()" aria-label="Notifications" style="position:relative;">
            ${Icons.bell(22)}
            ${State.sellerUnread > 0 ? `<span class="nav-badge" style="top:-4px;right:-4px;">${State.sellerUnread > 9 ? '9+' : State.sellerUnread}</span>` : ''}
          </button>
          <span style="font-size:11px;color:${verificationTier === 'verified' || verificationTier === 'trusted' ? 'var(--success)' : 'var(--warning)'};">● ${tierBadge[verificationTier] || store?.status || 'Pending'}</span>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-value">${State.formatETB(orders.monthly_revenue)}</div>
          <div class="stat-label">${State.t('seller.dash.revenue')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${orders.monthly_orders || 0}</div>
          <div class="stat-label">${State.t('seller.dash.orders')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--warning);">${orders.pending_count || 0}</div>
          <div class="stat-label">${State.t('seller.dash.pendingOrders')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:#A78BFA;">${orders.dispatched_count || 0}</div>
          <div class="stat-label">${State.t('seller.dash.inTransit')}</div>
        </div>
      </div>

      ${pending.length ? `
      <div class="section-header" style="margin-top:6px;">
        <span class="section-title" style="color:var(--accent);">${State.t('seller.hub.fromTelegram', { pending })}</span>
        <span style="font-size:10px;color:var(--text-secondary);">${State.t('seller.hub.completeToPublish')}</span>
      </div>
      ${pending.slice(0, 3).map(p => this._pendingProductCard(p)).join('')}
      ${pending.length > 3 ? `<div style="text-align:center;"><span class="section-link" onclick="App.switchTab('pending')">${State.t('seller.hub.viewAll', { pending })}</span></div>` : ''}
      ` : ''}

      <div class="section-header" style="margin-top:6px;">
        <span class="section-title">${State.t('seller.hub.recentOrders')}</span>
        <span class="section-link" onclick="App.switchTab('dispatch')">${State.t('seller.hub.viewAllOrders')}</span>
      </div>

      ${recentOrders.length ? recentOrders.map(o => this._recentOrderRow(o)).join('') : '<p style="font-size:13px;color:var(--text-secondary);">' + State.t('seller.hub.noOrders') + '</p>'}

      ${reviews.length ? `
      <div class="section-header" style="margin-top:16px;">
        <span class="section-title">${State.t('seller.hub.recentReviews')}</span>
        <span style="font-size:11px;color:var(--warning);">${store?.rating ? Number(store.rating).toFixed(1) : '—'} avg · ${store?.rating_count || 0} total</span>
      </div>
      ${reviews.slice(0, 3).map(r => `
        <div class="card" style="margin-bottom:8px;padding:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:12px;font-weight:700;">${r.first_name} ${r.last_name || ''}</span>
            <span style="font-size:12px;color:var(--warning);">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
          </div>
          <div style="font-size:11px;color:var(--accent);margin-bottom:2px;">${r.product_title || ''}</div>
          ${r.comment ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">${r.comment}</div>` : ''}
        </div>
      `).join('')}
      ` : ''}

      <button class="btn-primary" style="margin-top:14px;" onclick="Modals.openAddProduct()">
        + ${State.t('seller.addProduct.title')}
      </button>
    `;
  },

  _pendingProductCard(p) {
    const thumb = (Array.isArray(p.image_urls) && p.image_urls[0])
      ? `<div style="width:56px;height:56px;border-radius:8px;background:url(${p.image_urls[0]}) center/cover no-repeat var(--bg-surface);border:1px solid var(--border);flex-shrink:0;"></div>`
      : `<div style="width:56px;height:56px;border-radius:8px;background:var(--bg-surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">📸</div>`;
    const timeAgo = this._timeAgo(p.detected_at);
    const priceStr = p.price_etb ? State.formatETB(p.price_etb) : State.t('seller.pending.noPrice');
    return `
      <div class="card" style="margin-bottom:10px;padding:12px;">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          ${thumb}
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:800;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.title || State.t('seller.pending.untitled')}</div>
            <div style="font-size:12px;color:var(--accent);font-weight:700;margin-top:2px;">${priceStr}</div>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">${timeAgo} · ${p.auto_detected ? State.t('seller.pending.autoDetected') : State.t('seller.pending.sellCommand')}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;">
          <button class="btn-primary" style="flex:1;padding:8px;font-size:11px;" onclick="Modals.openCompletePending('${p.pending_id}')">${State.t('seller.pending.complete')}</button>
          <button class="btn-secondary" style="flex:1;padding:8px;font-size:11px;" onclick="App.discardPending('${p.pending_id}')">${State.t('seller.pending.discard')}</button>
        </div>
      </div>
    `;
  },

  _timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  },

  _recentOrderRow(o) {
    return `
      <div class="card" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:13px;font-weight:800;">${o.order_ref}</div>
          <div style="font-size:11px;color:var(--text-secondary);">${o.first_name} ${o.last_name || ''}</div>
        </div>
        <div style="text-align:right;">
          <div style="color:var(--accent);font-weight:900;font-size:13px;">${State.formatETB(o.total_etb)}</div>
          <span class="order-status-badge status-${o.order_status}" style="font-size:9px;">${o.order_status}</span>
        </div>
      </div>
    `;
  },

  // ── Pending Products from Telegram ────────────────
  renderPending(container) {
    const pending = State.pendingProducts || [];
    container.innerHTML = `
      <div class="section-header">
        <span class="section-title">${State.t('seller.pending.title', { pending })}</span>
        <span class="section-link" onclick="App.refreshPendingProducts()">${State.t('seller.pending.refresh')}</span>
      </div>
      <p style="font-size:11px;color:var(--text-secondary);margin:-4px 0 12px;line-height:1.4;">
        ${State.t('seller.pending.desc')}
      </p>
      ${!pending.length ? `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-title">${State.t('seller.pending.noPending')}</div>
          <div class="empty-desc">${State.t('seller.pending.noPendingDesc')}</div>
        </div>
      ` : pending.map(p => this._pendingProductCardFull(p)).join('')}
    `;
  },

  _pendingProductCardFull(p) {
    const imgs = Array.isArray(p.image_urls) ? p.image_urls : [];
    const thumb = imgs[0]
      ? `<div style="width:64px;height:64px;border-radius:8px;background:url(${imgs[0]}) center/cover no-repeat var(--bg-surface);border:1px solid var(--border);flex-shrink:0;"></div>`
      : `<div style="width:64px;height:64px;border-radius:8px;background:var(--bg-surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">📸</div>`;
    const timeAgo = this._timeAgo(p.detected_at);
    const priceStr = p.price_etb ? State.formatETB(p.price_etb) : State.t('seller.pending.noPrice');
    const statusColor = p.status === 'completed' ? 'var(--success)' : 'var(--warning)';
    return `
      <div class="card" style="margin-bottom:10px;padding:12px;">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          ${thumb}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div style="font-size:14px;font-weight:800;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">${p.title || State.t('seller.pending.untitled')}</div>
              <span style="font-size:9px;padding:2px 6px;border-radius:4px;background:${statusColor}22;color:${statusColor};flex-shrink:0;margin-left:6px;">${p.status}</span>
            </div>
            <div style="font-size:13px;color:var(--accent);font-weight:700;margin-top:2px;">${priceStr}</div>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">${timeAgo} · ${State.t('seller.pending.imageCount', { imgs })} · ${p.auto_detected ? State.t('seller.pending.autoDetected') : State.t('seller.pending.sellCommand')}</div>
            ${p.caption ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:4px;line-height:1.4;max-height:40px;overflow:hidden;">${p.caption.slice(0, 120)}${p.caption.length > 120 ? '...' : ''}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;">
          <button class="btn-primary" style="flex:1;padding:8px;font-size:11px;" onclick="Modals.openCompletePending('${p.pending_id}')">
            ${p.status === 'completed' ? State.t('seller.pending.publish') : State.t('seller.pending.complete')}
          </button>
          <button class="btn-secondary" style="padding:8px 12px;font-size:11px;" onclick="App.discardPending('${p.pending_id}')">${State.t('seller.pending.discard')}</button>
        </div>
      </div>
    `;
  },

  // ── Inventory / Products ─────────────────────────
  _inventorySort(key) {
    State.inventorySort = key;
    this._renderInventoryList(document.getElementById('appBody'));
  },

  _inventoryFilter(key) {
    State.inventoryFilter = key;
    this._renderInventoryList(document.getElementById('appBody'));
  },

  _renderInventoryList(container) {
    let prods = [...State.sellerProducts];
    const sort = State.inventorySort || 'newest';
    const filter = State.inventoryFilter || 'all';

    // Filter
    if (filter === 'live') prods = prods.filter(p => p.is_published);
    else if (filter === 'draft') prods = prods.filter(p => !p.is_published);
    else if (filter === 'lowstock') prods = prods.filter(p => (p.stock_quantity - (p.reserved_stock || 0)) <= 3);

    // Sort
    if (sort === 'az') prods.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (sort === 'ordered') prods.sort((a, b) => (b.order_count || 0) - (a.order_count || 0));
    else if (sort === 'price') prods.sort((a, b) => (a.price_etb || 0) - (b.price_etb || 0));
    else prods.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Preserve list container but replace content
    const listEl = document.getElementById('prodList');
    if (!listEl) return;
    listEl.innerHTML = prods.length
      ? prods.map(p => this._inventoryCard(p)).join('')
      : `<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">${filter !== 'all' ? State.t('seller.inventory.noProductsFilter') : State.t('seller.inventory.noItems')}</div><div class="empty-desc">${State.t('seller.inventory.noItemsDesc')}</div></div>`;
  },

  renderInventory(container) {
    const prods = State.sellerProducts;
    const sort = State.inventorySort || 'newest';
    const filter = State.inventoryFilter || 'all';
    const sortKeys = [['newest','seller.inventory.sortNewest'],['az','seller.inventory.sortAz'],['ordered','seller.inventory.sortOrdered'],['price','seller.inventory.sortPrice']];
    const filterKeys = [['all','seller.inventory.filterAll'],['live','seller.inventory.filterLive'],['draft','seller.inventory.filterDraft'],['lowstock','seller.inventory.filterLowStock']];
    container.innerHTML = `
      <div class="section-header">
        <span class="section-title">${State.t('seller.inventory.title', { prods })}</span>
        <button class="btn-primary" style="width:auto;padding:8px 14px;font-size:12px;" onclick="Modals.openAddProduct()">${State.t('seller.inventory.add')}</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
        ${sortKeys.map(([k, key]) => `
          <button onclick="SellerViews._inventorySort('${k}')" style="padding:5px 12px;border-radius:16px;border:1px solid ${sort === k ? 'var(--accent)' : 'var(--border)'};background:${sort === k ? 'var(--accent-soft)' : 'var(--bg-surface)'};color:${sort === k ? 'var(--accent)' : 'var(--text-secondary)'};font-size:11px;font-weight:${sort === k ? '700' : '500'};cursor:pointer;">${State.t(key)}</button>
        `).join('')}
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px;">
        ${filterKeys.map(([k, key]) => `
          <button onclick="SellerViews._inventoryFilter('${k}')" style="padding:4px 10px;border-radius:12px;border:none;background:${filter === k ? 'var(--accent)' : 'var(--bg-surface)'};color:${filter === k ? 'var(--accent-text)' : 'var(--text-secondary)'};font-size:10px;font-weight:600;cursor:pointer;">${State.t(key)}</button>
        `).join('')}
      </div>
      <div id="prodList">
        ${prods.length ? prods.map(p => this._inventoryCard(p)).join('') : `<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">${State.t('seller.inventory.noItems')}</div><div class="empty-desc">${State.t('seller.inventory.noItemsDesc')}</div></div>`}
      </div>
    `;
  },

  _inventoryCard(p) {
    const thumb = (Array.isArray(p.image_urls) && p.image_urls[0])
      ? `<div style="width:48px;height:48px;border-radius:8px;background:url(${p.image_urls[0]}) center/cover no-repeat var(--bg-surface);border:1px solid var(--border);flex-shrink:0;"></div>`
      : `<div style="width:48px;height:48px;border-radius:8px;background:var(--bg-surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">📦</div>`;
    const stock = p.stock_quantity - (p.reserved_stock || 0);
    return `
      <div class="card" style="margin-bottom:10px;padding:12px;">
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:6px;">
          ${thumb}
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.title}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:1px;">${p.category}${p.sub_category ? ' · ' + p.sub_category : ''}</div>
          </div>
          <span style="font-size:10px;padding:2px 7px;border-radius:6px;font-weight:700;${p.is_published ? 'background:rgba(16,185,129,0.15);color:var(--success)' : 'background:rgba(245,158,11,0.15);color:var(--warning)'}">
            ${p.is_published ? State.t('seller.inventory.live') : State.t('seller.inventory.draft')}
          </span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div>
            <span style="font-size:15px;font-weight:900;color:var(--accent);">${State.formatETB(p.price_etb)}</span>
            ${p.compare_price ? `<span style="font-size:10px;color:var(--text-muted);text-decoration:line-through;margin-left:6px;">${State.formatETB(p.compare_price)}</span>` : ''}
          </div>
          <span style="font-size:11px;color:${stock <= 3 ? 'var(--danger)' : 'var(--text-secondary)'};font-weight:${stock <= 3 ? '700' : '400'};">${State.t('seller.inventory.stock', { stock })}</span>
        </div>
        <div style="display:flex;gap:12px;font-size:11px;color:var(--text-muted);margin-bottom:8px;flex-wrap:wrap;">
          <span>${State.t('seller.inventory.orderedCount', { p })}</span>
          <span>${State.t('seller.inventory.paidCount', { p })}</span>
          <span>${State.t('seller.inventory.deliveredCount', { p })}</span>
          <span>${State.t('seller.inventory.viewsCount', { p })}</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn-secondary" style="flex:1;padding:7px;font-size:11px;" onclick="Modals.openEditProduct('${p.product_id}')">${Icons.edit(14)} ${State.t('seller.inventory.edit')}</button>
          <button style="flex:1;background:${p.is_published ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)'};border:1px solid ${p.is_published ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'};color:${p.is_published ? 'var(--warning)' : 'var(--success)'};padding:7px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;" onclick="App.togglePublish('${p.product_id}',${p.is_published})">
            ${p.is_published ? State.t('seller.inventory.unpublish') : State.t('seller.inventory.publish')}
          </button>
          <button style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:var(--danger);padding:7px 10px;border-radius:8px;font-size:11px;cursor:pointer;" onclick="App.confirmDeleteProduct('${p.product_id}','${(p.title||'').replace(/'/g,"\\'")}')">
            ${Icons.trash(14)}
          </button>
        </div>
      </div>
    `;
  },

  // ── Account & Settings (flat menu, opened from the 3-dots menu) ──
  // 11 sections in a single flat list. Tap any section to open its form.
  // Back button from a section returns to the flat menu.
  renderSellerMenu(container) {
    const store = State.storeDetail || State.stores[0];
    const cp = State.couponPolicy || { share_required:3, share_discount:5, share_coupon_active:false, group_min_members:3, group_discount:10, group_buy_active:false, coupon_validity_days:7 };
    if (!store) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚙️</div><div class="empty-title">${State.t('seller.menu.noStore')}</div></div>`;
      return;
    }

    const tierBadge = { none: '', basic: '🟢 Basic', verified: '✅ Verified', trusted: '⭐ Trusted' };
    const statusColors = { verified: 'var(--success)', pending: 'var(--warning)', suspended: 'var(--danger)' };
    const storeUrl = `${window.location.origin}${window.location.pathname}?store=${store.store_code}`;
    const tgConnected = !!store.tg_channel_username;

    // ── Section bodies ──

    // 1. Profile — store identity, name, description, business phone, QR share, verification
    const profile = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <div style="width:54px;height:54px;border-radius:14px;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;">🏪</div>
        <div style="min-width:0;flex:1;">
          <div style="font-size:16px;font-weight:900;">${store.store_name}</div>
          <div style="font-size:12px;color:${statusColors[store.status] || 'var(--text-secondary)'};font-weight:700;">● ${store.status}</div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Store Name</label>
        <input class="form-input" id="storeName" value="${store.store_name}" placeholder="My Store"/>
      </div>
      <div class="form-group">
        <label class="form-label">Business Phone</label>
        <input class="form-input" id="storePhone" value="${store.business_phone || ''}" placeholder="+251 9XX XXX XXX"/>
      </div>
      <div class="form-group">
        <label class="form-label">Store Description</label>
        <textarea class="form-textarea" id="storeDescription" placeholder="Tell buyers what you sell..." rows="3">${store.description || ''}</textarea>
      </div>

      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:10px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Store Code</div>
          <div style="font-size:18px;font-weight:900;color:var(--accent);font-family:monospace;letter-spacing:2px;margin-top:2px;">${store.store_code || '—'}</div>
        </div>
        <button onclick="navigator.clipboard.writeText('${store.store_code}');App.toast('Store code copied!','success');" style="background:rgba(252,205,4,0.1);border:1px solid rgba(252,205,4,0.3);border-radius:8px;padding:8px 14px;color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;">📋 Copy</button>
      </div>

      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px;margin-bottom:12px;text-align:center;">
        <div style="font-size:10px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">📲 Share Your Store</div>
        <div style="display:flex;justify-content:center;margin-bottom:8px;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(storeUrl)}" alt="Store QR" style="border-radius:8px;width:150px;height:150px;background:white;padding:4px;"/>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);word-break:break-all;margin-bottom:8px;">${storeUrl}</div>
        <button onclick="navigator.clipboard.writeText('${storeUrl}');App.toast('Store link copied!','success');" style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:8px 14px;color:#60A5FA;font-size:12px;font-weight:700;cursor:pointer;">🔗 Copy Store Link</button>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        ${store.verified_badge ? '<span style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--success);font-weight:700;">✅ Verified Merchant</span>' : '<span style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--warning);font-weight:700;">⏳ Pending Verification</span>'}
        ${store.verification_tier && store.verification_tier !== 'none' ? `<span style="background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);border-radius:20px;padding:4px 12px;font-size:12px;color:#A78BFA;font-weight:700;">${tierBadge[store.verification_tier]}</span>` : ''}
        ${store.rating > 0 ? `<span style="background:rgba(252,205,4,0.1);border:1px solid rgba(252,205,4,0.3);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--accent);font-weight:700;">⭐ ${Number(store.rating).toFixed(1)} (${store.rating_count})</span>` : '<span style="background:rgba(156,163,175,0.1);border:1px solid rgba(156,163,175,0.3);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--text-secondary);font-weight:700;">No ratings yet</span>'}
      </div>
      <button class="btn-secondary" style="width:100%;" onclick="App.toast('Profile saved','success')">💾 Save Profile</button>`;

    // 2. Address — physical location
    const address = `
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">Your store's physical location — shown to buyers for pickup and delivery reference.</div>
      <div class="form-group">
        <label class="form-label">Sub-City</label>
        <input class="form-input" id="storeSubCity" value="${store.location_sub_city || ''}" placeholder="Bole"/>
      </div>
      <div class="form-group">
        <label class="form-label">Woreda</label>
        <input class="form-input" id="storeWoreda" value="${store.location_woreda || ''}" placeholder="Woreda 03"/>
      </div>
      <div class="form-group">
        <label class="form-label">Location Detail</label>
        <textarea class="form-textarea" id="storeLocationDetail" placeholder="Near landmark, building name, floor..." rows="2">${store.location_detail || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Full Physical Address</label>
        <textarea class="form-textarea" id="storePhysicalAddress" placeholder="Complete address for delivery reference..." rows="2">${store.physical_address || ''}</textarea>
      </div>
      <button class="btn-secondary" style="width:100%;" onclick="App.toast('Address saved','success')">💾 Save Address</button>`;

    // 3. Payout & Banking — Telebirr + CBE accounts + checkout preferences
    const payout = `
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">These details are shown to buyers at checkout so they can pay you. Keep them up to date.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div>
          <label class="form-label" style="font-size:11px;">Telebirr Number</label>
          <input class="form-input" id="telebirrMerchantId" value="${store.telebirr_merchant_id || ''}" placeholder="+251 9XX XXX XXX"/>
        </div>
        <div>
          <label class="form-label" style="font-size:11px;">Telebirr Account Name</label>
          <input class="form-input" id="telebirrAccountName" value="${store.telebirr_account_name || ''}" placeholder="Account holder name"/>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        <div>
          <label class="form-label" style="font-size:11px;">CBE Account Number</label>
          <input class="form-input" id="cbeAccountNumber" value="${store.cbe_account_number || ''}" placeholder="1000XXXXXXX"/>
        </div>
        <div>
          <label class="form-label" style="font-size:11px;">CBE Account Name</label>
          <input class="form-input" id="cbeAccountName" value="${store.cbe_account_name || ''}" placeholder="Account holder name"/>
        </div>
      </div>

      <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">

      <div style="margin-bottom:12px;">
        <div style="font-size:12px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">${Icons.credit(14)} Other Banks</div>
        <div id="otherBanksList">
          ${(() => {
            const banks = store.other_banks || [];
            const ethBanks = ['Dashen Bank','Awash Bank','Abyssinia Bank','Wegagen Bank','United Bank','Nib International Bank','Berhan International Bank','Lion International Bank','Oromia Bank','Zemen Bank','Bunna Bank','Abay Bank','Addis International Bank','Debub Global Bank','Enat Bank','Hibret Bank','Ahad Bank','Tsehay Bank','Gadaa Bank','Siinqee Bank','Shabelle Bank','Hijira Bank'];
            return banks.length === 0 ? '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">No additional banks added yet.</div>' : banks.map((b, i) => `
              <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;position:relative;">
                <button type="button" onclick="SellerViews._removeOtherBank(${i})" style="position:absolute;top:6px;right:8px;background:none;border:none;color:var(--danger);font-size:16px;cursor:pointer;padding:2px;">${Icons.trash(14)}</button>
                <div style="font-size:13px;font-weight:800;margin-bottom:4px;">${b.bank_name}</div>
                <div style="font-size:12px;color:var(--text-primary);">${b.account_number}</div>
                <div style="font-size:11px;color:var(--text-secondary);">${b.account_holder}</div>
              </div>`).join('');
          })()}
        </div>
        <div id="addOtherBankForm" style="background:var(--bg-surface);border:1px dashed var(--border);border-radius:var(--radius-sm);padding:14px;margin-bottom:10px;">
          <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:10px;">
            <div>
              <label class="form-label" style="font-size:11px;">Bank Name</label>
              <div style="display:flex;gap:6px;">
                <select id="otherBankNameSelect" onchange="SellerViews._onBankSelect(this)" style="flex:1;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text-primary);font-size:12px;outline:none;">
                  <option value="">Select a bank...</option>
                  ${['Dashen Bank','Awash Bank','Abyssinia Bank','Wegagen Bank','United Bank','Nib International Bank','Berhan International Bank','Lion International Bank','Oromia Bank','Zemen Bank','Bunna Bank','Abay Bank','Addis International Bank','Debub Global Bank','Enat Bank','Hibret Bank','Ahad Bank','Tsehay Bank','Gadaa Bank','Siinqee Bank','Shabelle Bank','Hijira Bank'].map(n => `<option value="${n}">${n}</option>`).join('')}
                  <option value="__other__">Other (type manually)</option>
                </select>
              </div>
              <input id="otherBankNameCustom" style="display:none;margin-top:6px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text-primary);font-size:12px;outline:none;width:100%;box-sizing:border-box;" placeholder="Type bank name..." />
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div>
              <label class="form-label" style="font-size:11px;">Account Number</label>
              <input class="form-input" id="otherBankAcctNum" placeholder="Account number" style="background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text-primary);font-size:12px;outline:none;width:100%;box-sizing:border-box;" />
            </div>
            <div>
              <label class="form-label" style="font-size:11px;">Account Holder</label>
              <input class="form-input" id="otherBankAcctHolder" placeholder="Full name" style="background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text-primary);font-size:12px;outline:none;width:100%;box-sizing:border-box;" />
            </div>
          </div>
          <button class="btn-secondary" style="width:100%;margin-top:10px;font-size:12px;" onclick="SellerViews._addOtherBank()">${Icons.plus(14)} Add Bank</button>
        </div>
      </div>

      <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">

      <div style="margin-bottom:12px;">
        <div style="font-size:12px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">${Icons.credit(14)} Checkout Preferences</div>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;">
          <div style="font-size:13px;font-weight:800;margin-bottom:8px;">Payment Methods Accepted</div>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="telebirrEnabled" ${store.telebirr_enabled!==false?'checked':''} style="accent-color:var(--accent);"> ${Icons.wallet(16)} Telebirr
          </label>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="cbeEnabled" ${store.cbe_enabled?'checked':''} style="accent-color:var(--accent);"> ${Icons.credit(16)} CBE Bank Transfer
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="cashEnabled" ${store.cash_on_delivery!==false?'checked':''} style="accent-color:var(--accent);"> ${Icons.wallet(16)} Cash on Delivery
          </label>
        </div>
        <button class="btn-secondary" style="width:100%;margin-top:10px;" onclick="App.savePaymentAccounts()">${Icons.check(16)} Save Preferences</button>
      </div>

      <button class="btn-secondary" id="savePayoutBtn" style="width:100%;" onclick="App.savePaymentAccounts()">${Icons.check(16)} Save Payment Accounts</button>
      <div class="progress-wrap" id="payoutProgress" style="display:none;">
        <div class="progress-bar" id="payoutProgressBar"></div>
      </div>
      <div class="progress-status" id="payoutProgressStatus" style="display:none;"></div>`;

    // 4. Shipping & Delivery — fees, self-delivery, company delivery
    const shipping = `
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">Control how your products are delivered and what buyers pay for shipping.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        <div class="form-group">
          <label class="form-label">Addis Ababa Delivery Fee (Br)</label>
          <input type="number" class="form-input" id="addisFee" value="${store.addis_delivery_fee || 150}" />
        </div>
        <div class="form-group">
          <label class="form-label">Regional Dispatch (Br)</label>
          <input type="number" class="form-input" id="regionalFee" value="${store.regional_dispatch_fee || 400}" />
        </div>
      </div>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:13px;font-weight:800;margin-bottom:2px;">🏪 Self-Delivery</div>
            <div style="font-size:11px;color:var(--text-secondary);">You deliver orders yourself instead of using a rider.</div>
          </div>
          ${this._toggle('selfDeliveryToggle', store.self_delivery_enabled, "App.toggleSelfDelivery(this.checked)")}
        </div>
      </div>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:13px;font-weight:800;margin-bottom:2px;">🚚 Delivery Company</div>
            <div style="font-size:11px;color:var(--text-secondary);">Partner courier fulfils shipments on your behalf.</div>
          </div>
          ${this._toggle('companyDeliveryToggle', store.company_delivery_enabled, "App.toggleCompanyDelivery(this.checked)")}
        </div>
      </div>
      <button class="btn-secondary" style="width:100%;" onclick="App.saveDeliveryRules()">💾 Save Delivery Rules</button>`;

    // 5. Return Policy — return type and custom text
    const returnPolicy = `
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">Set your return and warranty terms. These are shown to buyers at checkout.</div>
      <div class="form-group">
        <label class="form-label">Return Policy Type</label>
        <select class="form-select" id="policyType">
          <option value="7_day_free" ${store.return_policy_type==='7_day_free'?'selected':''}>7-Day Free Returns</option>
          <option value="3_day_warranty" ${store.return_policy_type==='3_day_warranty'?'selected':''}>3-Day Replacement Warranty</option>
          <option value="size_exchange" ${store.return_policy_type==='size_exchange'?'selected':''}>Size Exchange (24 Hours)</option>
          <option value="fresh_guarantee" ${store.return_policy_type==='fresh_guarantee'?'selected':''}>Freshness Guarantee</option>
          <option value="no_return" ${store.return_policy_type==='no_return'?'selected':''}>No Returns</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Custom Policy Description</label>
        <textarea class="form-textarea" id="policyText" placeholder="Describe your return / warranty terms in detail..." rows="4">${store.custom_policy_text || ''}</textarea>
      </div>
      <button class="btn-secondary" style="width:100%;" onclick="App.savePolicy()">💾 Save Return Policy</button>`;

    // 6. Coupons & Discounts — share-to-save only (group buy moved to Advanced)
    const coupons = `
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">Grow sales with share-to-save coupons. Customers earn a coupon when they share a product N times.</div>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div>
            <div style="font-size:13px;font-weight:800;margin-bottom:2px;">📤 Share-to-Save Coupons</div>
            <div style="font-size:11px;color:var(--text-secondary);">Customers earn a coupon when they share a product N times.</div>
          </div>
          ${this._toggle('shareCouponToggle', cp.share_coupon_active)}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div class="form-group">
            <label class="form-label">Shares Required</label>
            <input type="number" class="form-input" id="shareRequired" value="${cp.share_required}" placeholder="3" />
          </div>
          <div class="form-group">
            <label class="form-label">Discount %</label>
            <input type="number" class="form-input" id="shareDiscount" value="${cp.share_discount}" placeholder="5" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Coupon Valid (days)</label>
          <input type="number" class="form-input" id="couponValidityDays" value="${cp.coupon_validity_days}" placeholder="7" />
        </div>
      </div>
      <button class="btn-secondary" style="width:100%;" onclick="App.saveCouponPolicy()">💾 Save Coupons</button>`;

    // 7. Notifications — Telegram, low stock, new order alerts
    const notifications = `
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">Choose how Medebirr keeps you and your buyers informed.</div>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:13px;font-weight:800;margin-bottom:2px;">📨 Telegram Notifications</div>
            <div style="font-size:11px;color:var(--text-secondary);">Buyers get DM updates via @medebirrbot when their order status changes.</div>
          </div>
          ${this._toggle('telegramNotifsToggle', store.telegram_notifs !== false, "App.toggleTelegramNotifs(this.checked)")}
        </div>
      </div>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:13px;font-weight:800;margin-bottom:2px;">📉 Low-Stock Alerts</div>
            <div style="font-size:11px;color:var(--text-secondary);">Get notified when a product is running low on stock.</div>
          </div>
          ${this._toggle('lowStockToggle', store.low_stock_alerts !== false, "App.toggleLowStock(this.checked)")}
        </div>
      </div>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:13px;font-weight:800;margin-bottom:2px;">${State.t('seller.settings.newOrderAlerts')}</div>
            <div style="font-size:11px;color:var(--text-secondary);">${State.t('seller.settings.newOrderAlertsDesc')}</div>
          </div>
          ${this._toggle('newOrderToggle', store.new_order_alerts !== false, "App.toggleNewOrderAlerts(this.checked)")}
        </div>
      </div>`;

    // 8. Account Security — 2FA, password, danger zone, logout
    const security = `
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:13px;font-weight:800;margin-bottom:2px;">${State.t('seller.settings.twoFactor')}</div>
            <div style="font-size:11px;color:var(--text-secondary);">${State.t('seller.settings.twoFactorDesc')}</div>
          </div>
          ${this._toggle('twoFactorToggle', store.two_factor_enabled, "App.toggleTwoFactor(this.checked)")}
        </div>
      </div>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:800;margin-bottom:4px;">${State.t('seller.settings.accountPassword')}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">${State.t('seller.settings.accountPasswordDesc')}</div>
        <button class="btn-secondary" style="width:100%;" onclick="App.toast(State.t('seller.settings.resetPassword')+' — sent to your Telegram','success')">${State.t('seller.settings.resetPassword')}</button>
      </div>
      <div class="settings-danger-zone">
        <div style="font-size:10px;color:var(--danger);font-weight:800;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">${State.t('seller.settings.dangerZone')}</div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px;">${State.t('seller.settings.dangerZoneDesc')}</div>
        <button class="settings-delete-btn" style="width:100%;" onclick="SellerViews._confirmDeleteStore()">${State.t('seller.settings.deleteShop')}</button>
      </div>
      <button class="settings-logout-btn" style="width:100%;" onclick="SellerViews._confirmLogout()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        ${State.t('seller.settings.logOut')}
      </button>`;

    // 9. Advanced Settings — staff, group buy, automation, tax combined
    const advanced = `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">👥 Staff Roles</div>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:10px;">
          <div style="font-size:13px;font-weight:800;margin-bottom:6px;">👤 Owner</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">Full access — you. Receives payouts and can delete the shop.</div>
          <span style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:20px;padding:3px 10px;font-size:11px;color:var(--success);font-weight:700;">Active</span>
        </div>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:10px;">
          <div style="font-size:13px;font-weight:800;margin-bottom:6px;">🛡️ Manager</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">Manage products, orders and policies. Cannot change payouts or delete the shop.</div>
          <button class="btn-secondary" style="width:100%;" onclick="App.toast('Staff invites coming soon','info')">+ Invite Manager</button>
        </div>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:14px;">
          <div style="font-size:13px;font-weight:800;margin-bottom:6px;">📦 Fulfilment Staff</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">View and fulfil orders only. Ideal for warehouse or dispatch teams.</div>
          <button class="btn-secondary" style="width:100%;" onclick="App.toast('Staff invites coming soon','info')">+ Invite Staff</button>
        </div>
      </div>

      <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">

      <div style="margin-bottom:16px;">
        <div style="font-size:12px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">👥 Group Buying</div>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div>
              <div style="font-size:13px;font-weight:800;margin-bottom:2px;">👥 Group Buying</div>
              <div style="font-size:11px;color:var(--text-secondary);">Customers form a group to buy together and get a discount.</div>
            </div>
            ${this._toggle('groupBuyToggle', cp.group_buy_active)}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:0;">
            <div class="form-group">
              <label class="form-label">Min Members</label>
              <input type="number" class="form-input" id="groupMinMembers" value="${cp.group_min_members}" placeholder="3" />
            </div>
            <div class="form-group">
              <label class="form-label">Group Discount %</label>
              <input type="number" class="form-input" id="groupDiscount" value="${cp.group_discount}" placeholder="10" />
            </div>
          </div>
        </div>
      </div>

      <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">

      <div style="margin-bottom:16px;">
        <div style="font-size:12px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">⚙️ Automation</div>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:10px;">
          <div style="font-size:13px;font-weight:800;margin-bottom:4px;">📢 Telegram Group Connection</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">
            ${tgConnected
              ? `✅ Connected: <strong style="color:var(--text-primary);">@${store.tg_channel_username}</strong> — Products auto-post here when published.`
              : '⚠️ No group connected yet. Connect a group to auto-broadcast your products.'}
          </div>
          <div style="display:flex;gap:8px;">
            <input class="form-input" id="groupUsernameInput" placeholder="@YourGroupUsername" value="${store.tg_channel_username || ''}" style="flex:1;"/>
            <button onclick="App._verifyGroupFromPolicy()" style="background:rgba(252,205,4,0.15);border:1px solid rgba(252,205,4,0.4);color:var(--accent);padding:9px 14px;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;">✅ Verify Admin</button>
          </div>
          <div id="policyGroupVerifyResult" style="margin-top:8px;"></div>
        </div>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:13px;font-weight:800;margin-bottom:2px;">🔍 Auto-Detect Products</div>
              <div style="font-size:11px;color:var(--text-secondary);">Any photo with a price in your group becomes a pending product. When OFF, only /sell commands create products.</div>
            </div>
            ${this._toggle('autoDetectToggle', store.auto_detect_products !== false, "App.toggleAutoDetect(this.checked)")}
          </div>
        </div>
      </div>

      <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">

      <div style="margin-bottom:8px;">
        <div style="font-size:12px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">🧾 Tax & Invoices</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
          <div class="form-group">
            <label class="form-label">VAT / Tax %</label>
            <input type="number" class="form-input" id="taxRate" value="${store.tax_rate || 0}" placeholder="15" />
          </div>
          <div class="form-group">
            <label class="form-label">Tax Number / TIN</label>
            <input class="form-input" id="taxTin" value="${store.tax_tin || ''}" placeholder="TIN / VAT no." />
          </div>
        </div>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:13px;font-weight:800;margin-bottom:2px;">🧾 Auto-Invoice</div>
              <div style="font-size:11px;color:var(--text-secondary);">Attach a PDF invoice to every completed order email.</div>
            </div>
            ${this._toggle('autoInvoiceToggle', store.auto_invoice !== false, "App.toggleAutoInvoice(this.checked)")}
          </div>
        </div>
        <button class="btn-secondary" style="width:100%;" onclick="App.saveTaxConfig()">💾 Save Tax &amp; Invoice Settings</button>
      </div>`;

    // 10. Help Center — support, FAQ, app info
    const helpCenter = `
      <div style="margin-bottom:14px;">
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
            <div style="width:40px;height:40px;border-radius:10px;background:rgba(59,130,246,0.12);display:flex;align-items:center;justify-content:center;font-size:20px;">💬</div>
            <div>
              <div style="font-size:14px;font-weight:800;">Contact Support</div>
              <div style="font-size:11px;color:var(--text-secondary);">Get help from the Medebirr team</div>
            </div>
          </div>
          <a href="https://t.me/medebirrbot" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(252,205,4,0.1);border:1px solid rgba(252,205,4,0.3);border-radius:10px;padding:12px;color:var(--accent);font-size:13px;font-weight:800;text-decoration:none;cursor:pointer;">
            📲 @medebirrbot
          </a>
        </div>

        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
          <div style="font-size:14px;font-weight:800;margin-bottom:10px;">📖 Frequently Asked Questions</div>
          <details style="margin-bottom:8px;">
            <summary style="font-size:13px;font-weight:700;cursor:pointer;padding:6px 0;">How do I get paid?</summary>
            <p style="font-size:12px;color:var(--text-secondary);margin:6px 0 0 0;line-height:1.6;">Buyers pay you directly via Telebirr or CBE. Your payment details are shown at checkout. Payouts are settled instantly — the money goes straight to your account.</p>
          </details>
          <details style="margin-bottom:8px;">
            <summary style="font-size:13px;font-weight:700;cursor:pointer;padding:6px 0;">How does delivery work?</summary>
            <p style="font-size:12px;color:var(--text-secondary);margin:6px 0 0 0;line-height:1.6;">You can deliver yourself (self-delivery), use a rider, or partner with a courier company. Set your delivery fees and zones in Shipping & Delivery settings.</p>
          </details>
          <details style="margin-bottom:8px;">
            <summary style="font-size:13px;font-weight:700;cursor:pointer;padding:6px 0;">Can I have multiple staff?</summary>
            <p style="font-size:12px;color:var(--text-secondary);margin:6px 0 0 0;line-height:1.6;">Yes — Manager and Fulfilment roles are coming soon. Contact support to enable staff seats for your shop.</p>
          </details>
          <details>
            <summary style="font-size:13px;font-weight:700;cursor:pointer;padding:6px 0;">What are the platform fees?</summary>
            <p style="font-size:12px;color:var(--text-secondary);margin:6px 0 0 0;line-height:1.6;">Medebirr is free to use. You keep 100% of your sales. No listing fees, no commission, no hidden charges.</p>
          </details>
        </div>

        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;">
          <div style="font-size:14px;font-weight:800;margin-bottom:4px;">ℹ️ About Medebirr</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;">
            <p style="margin:4px 0;">Version 1.4.0</p>
            <p style="margin:4px 0;">Ethiopia's free Telegram marketplace — sell directly to buyers in your community.</p>
          </div>
        </div>
      </div>`;

    // 11. Policies — Platform terms only
    const sellerPolicies = `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;">${Icons.shield(14)} Platform Policies</div>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:10px;">
          <div style="font-size:13px;font-weight:800;margin-bottom:6px;">${Icons.file(16)} Terms of Service</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;line-height:1.6;">By selling on Medebirr, you agree to fulfil orders promptly, maintain accurate stock counts, and treat buyers fairly. Violations may result in account suspension.</div>
          <a href="#" onclick="App.toast('Full terms available at medebirr.vercel.app/terms','info')" style="font-size:12px;color:var(--accent);font-weight:700;">Read full terms →</a>
        </div>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:10px;">
          <div style="font-size:13px;font-weight:800;margin-bottom:6px;">${Icons.lock(16)} Privacy & Data</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;line-height:1.6;">Buyer contact details are shared only for order fulfilment. You may not use buyer data for marketing without consent.</div>
          <a href="#" onclick="App.toast('Privacy policy at medebirr.vercel.app/privacy','info')" style="font-size:12px;color:var(--accent);font-weight:700;">Read privacy policy →</a>
        </div>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:14px;">
          <div style="font-size:13px;font-weight:800;margin-bottom:6px;">${Icons.trash(16)} Prohibited Items</div>
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.6;">Counterfeit goods, weapons, illegal substances, and stolen property are strictly prohibited. Violating items will be removed and may result in permanent ban.</div>
        </div>
      </div>`;

    // ── Section registry (flat map) ──
    const menuItems = [
      { key: 'profile',        icon: Icons.store(20),   title: 'Profile',                desc: 'Store identity & display' },
      { key: 'address',        icon: Icons.pin(20),     title: 'Address',                desc: 'Physical location' },
      { key: 'payout',         icon: Icons.wallet(20),  title: 'Payout & Banking',       desc: 'Telebirr, CBE & checkout preferences' },
      { key: 'shipping',       icon: Icons.truck(20),   title: 'Shipping & Delivery',    desc: 'Fees, self & company delivery' },
      { key: 'returnPolicy',   icon: Icons.receipt(20), title: 'Return Policy',          desc: 'Return type & terms' },
      { key: 'coupons',        icon: Icons.tag(20),     title: 'Coupons & Discounts',    desc: 'Share-to-save promotions' },
      { key: 'notifications',  icon: Icons.bell(20),    title: 'Notifications',          desc: 'Telegram, stock & order alerts' },
      { key: 'security',       icon: Icons.lock(20),    title: 'Settings (Security)',    desc: '2FA, password, account' },
      { key: 'advanced',       icon: Icons.zap(20),     title: 'Advanced Settings',       desc: 'Staff, group buy, automation, tax' },
      { key: 'helpCenter',     icon: Icons.help(20),    title: 'Help Center',            desc: 'Support, FAQ & app info' },
      { key: 'sellerPolicies', icon: Icons.shield(20),  title: 'Policies',               desc: 'Platform terms' }
    ];

    const sections = {
      profile:        { body: profile },
      address:        { body: address },
      payout:         { body: payout },
      shipping:       { body: shipping },
      returnPolicy:   { body: returnPolicy },
      coupons:        { body: coupons },
      notifications:  { body: notifications },
      security:       { body: security },
      advanced:       { body: advanced },
      helpCenter:     { body: helpCenter },
      sellerPolicies: { body: sellerPolicies }
    };

    // ── Detail view (single section with back button to flat menu) ──
    if (State.sellerSettingsSection && sections[State.sellerSettingsSection]) {
      const item = menuItems.find(m => m.key === State.sellerSettingsSection);
      const s = sections[State.sellerSettingsSection];
      container.innerHTML = `
        <div class="settings-detail-header">
          <button class="pdp-back-btn" onclick="SellerViews._backToSettingsMenu()" aria-label="Back">${Icons.chevron(22)}</button>
          <div class="settings-detail-title">${item ? item.icon + ' ' + item.title : ''}</div>
          <div style="width:28px;"></div>
        </div>
        <div style="padding:4px 0 8px;">${s.body}</div>
      `;
      return;
    }

    // ── Flat menu list (11 items, one level) ──
    const rows = menuItems.map(m => `
      <button class="settings-menu-row" onclick="SellerViews._openSettingsSection('${m.key}')">
        <span class="menu-icon" style="width:36px;text-align:center;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;">${m.icon}</span>
        <span class="settings-menu-text">
          <span class="settings-menu-label">${m.title}</span>
          <span class="settings-menu-sub">${m.desc}</span>
        </span>
        <span class="settings-menu-arrow">›</span>
      </button>`).join('');

    container.innerHTML = `
      <div class="section-header"><span class="section-title">${Icons.settings(18)} Account &amp; Settings</span></div>
      <div class="settings-menu">${rows}</div>
    `;
  },

  _openSettingsSection(key) {
    State.sellerSettingsSection = key;
    if (key === 'payout') {
      const store = State.storeDetail || State.stores[0];
      SellerViews._otherBanks = (store && store.other_banks) ? JSON.parse(JSON.stringify(store.other_banks)) : [];
    }
    const body = document.getElementById('appBody');
    if (body) { this.renderSellerMenu(body); body.scrollTop = 0; }
  },

  _backToSettingsMenu() {
    State.sellerSettingsSection = null;
    const body = document.getElementById('appBody');
    if (body) { this.renderSellerMenu(body); body.scrollTop = 0; }
  },

  // ── Seller Notification Center ──
  renderSellerNotifications(container) {
    const feed = (State.sellerNotifications || []).slice();
    const eta = NotificationFeed.deriveEta(State.storeOrders || [], 'seller');
    const items = feed.concat(eta).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    NotificationFeed.render(container, items, {
      onBack: 'App.backToSellerHub()',
      title: State.t('seller.notifs.title'),
      emptyTitle: State.t('seller.notifs.emptyTitle'),
      emptyDesc: State.t('seller.notifs.emptyDesc'),
      role: 'seller'
    });
  },

  // ── Dispatch / Orders (seller "Orders" tab) ──
  renderDispatch(container) {
    const orders = State.storeOrders || [];
    if (!orders.length) {
      container.innerHTML = `
        <div class="section-header"><span class="section-title">📦 ${State.t('seller.dispatch.title')}</span></div>
        <div class="empty-state"><div class="empty-icon">🛵</div><div class="empty-title">${State.t('seller.dispatch.noOrders')}</div><div class="empty-desc">${State.t('seller.dispatch.noOrdersDesc')}</div></div>`;
      return;
    }
    const awaiting = orders.filter(o => o.order_status === 'confirmed' && o.payment_status === 'paid').length;
    container.innerHTML = `
      <div class="section-header">
        <span class="section-title">📦 ${State.t('seller.dispatch.title')}</span>
        <span style="font-size:11px;color:var(--warning);">${State.t('seller.dispatch.awaiting', { awaiting })}</span>
      </div>
      ${orders.map(o => this._dispatchCard(o)).join('')}
    `;
  },

  _dispatchCard(o) {
    let addr = {};
    try {
      addr = typeof o.delivery_address === 'string' ? JSON.parse(o.delivery_address) : (o.delivery_address || {});
    } catch (_) {}
    const addrStr = [addr.sub_city, addr.woreda, addr.house_number, addr.landmark].filter(Boolean).join(', ');
    const provider = o.delivery_provider || 'rider';
    const providerBadge = provider === 'self'
      ? `<div style="margin-top:6px;font-size:11px;color:var(--success);font-weight:800;">${State.t('seller.dispatch.selfDelivery')}</div>`
      : provider === 'company'
        ? `<div style="margin-top:6px;font-size:11px;color:#60A5FA;font-weight:800;">${State.t('seller.dispatch.company', { o })}</div>`
        : o.rider_name ? `<div style="margin-top:6px;font-size:11px;color:#A78BFA;">${State.t('seller.dispatch.rider', { o })}</div>` : '';
    const statusBadge = {
      pending: State.t('seller.dispatch.pending'), confirmed: State.t('seller.dispatch.confirmed'),
      dispatched: State.t('seller.dispatch.dispatched'), delivered: State.t('seller.dispatch.delivered'),
      cancelled: State.t('seller.dispatch.cancelled')
    }[o.order_status] || o.order_status;
    return `
      <div class="dispatch-card">
        <div class="dispatch-order-ref">${o.order_ref} · ${new Date(o.created_at).toLocaleDateString()} · ${statusBadge}</div>
        <div class="dispatch-buyer">👤 ${o.first_name} ${o.last_name || ''} (@${o.buyer_username || 'user'})</div>
        <div class="dispatch-address">📍 ${addrStr}<br>📞 ${addr.phone || 'N/A'}</div>
        <div style="margin-top:8px;font-size:14px;font-weight:900;color:var(--accent);">${State.formatETB(o.total_etb)} — ${o.payment_method.toUpperCase()}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:3px;">💳 TX ID: <span style="font-family:monospace;color:#1A1A2E;font-weight:800;">${o.transaction_code || o.payment_tx_ref || 'Cash on Delivery'}</span></div>
        ${Number(o.discount_etb) > 0 ? `<div style="font-size:11px;color:var(--success);font-weight:800;margin-top:2px;">🎟️ Coupon Discount Applied: -${State.formatETB(o.discount_etb)}</div>` : ''}
        ${providerBadge}
        ${o.delivery_otp ? `
          <div style="margin-top:8px;background:rgba(252,205,4,0.08);border:1px solid rgba(252,205,4,0.3);border-radius:8px;padding:8px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div>
              <div style="font-size:9px;color:var(--text-secondary);text-transform:uppercase;font-weight:800;letter-spacing:0.5px;">Delivery Code</div>
              <div style="font-family:monospace;font-size:18px;font-weight:900;color:var(--accent);letter-spacing:3px;">${o.delivery_otp}</div>
            </div>
            <button type="button" onclick="CheckoutPage && CheckoutPage._copyText && CheckoutPage._copyText('${o.delivery_otp}','Code copied!')" style="background:rgba(252,205,4,0.12);border:1px solid rgba(252,205,4,0.3);border-radius:6px;padding:6px 10px;color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;">📋</button>
          </div>` : ''}
        <div class="dispatch-actions">
          ${o.order_status === 'confirmed' ? `<button class="btn-dispatch" onclick="Modals.openAssignRider('${o.order_id}')">🛵 Assign Delivery</button>` : ''}
          ${o.order_status === 'dispatched' ? `
            <button class="btn-dispatch" onclick="Modals.openShowQR('${o.order_id}','rider')">📱 Show QR</button>
            <button class="btn-dispatch" onclick="Modals.openScanQR('${o.order_id}','rider')">📷 Scan Buyer</button>
            <button class="btn-dispatch" onclick="App.settleOrder('${o.order_id}')">✅ Settled</button>
          ` : ''}
          ${o.payment_status === 'paid' && o.order_status === 'confirmed' ? `<button class="btn-danger" style="padding:8px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:var(--danger);" onclick="App.markOrderRefunded('${o.order_id}')">💰 Mark Refunded</button>` : ''}
          <button class="btn-call" onclick="window.open('tel:${addr.phone}')">📞 Call Buyer</button>
          ${['pending','confirmed'].includes(o.order_status) ? `<button style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:var(--danger);padding:8px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;" onclick="App.confirmCancelOrder('${o.order_id}','${o.order_ref}')">✕ Cancel</button>` : ''}
        </div>
      </div>
    `;
  },

  // Reusable iOS-style toggle markup. `onchange` (optional) wires the live
  // save handler; CSS (.settings-toggle) drives the visual state from :checked.
  _toggle(id, on, onchange = '') {
    return `
      <label class="settings-toggle" style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;margin-left:12px;">
        <input type="checkbox" id="${id}" ${on ? 'checked' : ''} ${onchange ? `onchange="${onchange}"` : ''} style="opacity:0;width:0;height:0;">
        <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${on ? 'var(--accent)' : 'var(--border)'};border-radius:12px;transition:0.3s;">
          <span style="position:absolute;content:'';height:18px;width:18px;left:${on ? '22px' : '3px'};bottom:3px;background:white;border-radius:50%;transition:0.3s;"></span>
        </span>
      </label>`;
  },

  _confirmLogout() {
    Modals.open(`
      <div class="modal-handle"></div>
      <div style="text-align:center;padding:16px 0;">
        <div style="font-size:40px;margin-bottom:14px;">👋</div>
        <div style="font-size:17px;font-weight:900;margin-bottom:8px;">${State.t('auth.logout.confirm')}</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;">${State.t('auth.logout.desc')}</div>
        <div style="display:flex;gap:10px;">
          <button class="btn-secondary" onclick="Modals.close();" style="flex:1;">${State.t('shared.btn.cancel')}</button>
          <button onclick="App.clearToken();location.reload();" style="flex:1;background:var(--danger);color:white;border:none;padding:13px;border-radius:var(--radius-md);font-size:14px;font-weight:800;cursor:pointer;">${State.t('auth.logout.yes')}</button>
        </div>
      </div>
    `);
  },

  // ── Other Banks Management ──
  _otherBanks: [],

  _onBankSelect(sel) {
    const custom = document.getElementById('otherBankNameCustom');
    if (!custom) return;
    custom.style.display = sel.value === '__other__' ? 'block' : 'none';
    if (sel.value !== '__other__') custom.value = '';
  },

  _addOtherBank() {
    const sel = document.getElementById('otherBankNameSelect');
    const custom = document.getElementById('otherBankNameCustom');
    const acctNum = document.getElementById('otherBankAcctNum');
    const acctHolder = document.getElementById('otherBankAcctHolder');
    const name = sel.value === '__other__' ? (custom.value || '').trim() : sel.value;
    if (!name || !acctNum.value || !acctHolder.value) {
      if (App && typeof App.toast === 'function') App.toast('Fill in bank name, account number, and holder name', 'error');
      return;
    }
    SellerViews._otherBanks.push({ bank_name: name, account_number: acctNum.value.trim(), account_holder: acctHolder.value.trim() });
    acctNum.value = ''; acctHolder.value = ''; sel.value = ''; custom.value = ''; custom.style.display = 'none';
    SellerViews._renderOtherBanks();
  },

  _removeOtherBank(index) {
    SellerViews._otherBanks.splice(index, 1);
    SellerViews._renderOtherBanks();
  },

  _renderOtherBanks() {
    const list = document.getElementById('otherBanksList');
    if (!list) return;
    const banks = SellerViews._otherBanks;
    const ethBanks = ['Dashen Bank','Awash Bank','Abyssinia Bank','Wegagen Bank','United Bank','Nib International Bank','Berhan International Bank','Lion International Bank','Oromia Bank','Zemen Bank','Bunna Bank','Abay Bank','Addis International Bank','Debub Global Bank','Enat Bank','Hibret Bank','Ahad Bank','Tsehay Bank','Gadaa Bank','Siinqee Bank','Shabelle Bank','Hijira Bank'];
    list.innerHTML = banks.length === 0
      ? '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">No additional banks added yet.</div>'
      : banks.map((b, i) => `
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;position:relative;">
          <button type="button" onclick="SellerViews._removeOtherBank(${i})" style="position:absolute;top:6px;right:8px;background:none;border:none;color:var(--danger);font-size:16px;cursor:pointer;padding:2px;">${Icons.trash(14)}</button>
          <div style="font-size:13px;font-weight:800;margin-bottom:4px;">${b.bank_name}</div>
          <div style="font-size:12px;color:var(--text-primary);">${b.account_number}</div>
          <div style="font-size:11px;color:var(--text-secondary);">${b.account_holder}</div>
        </div>`).join('');
  },

  _confirmDeleteStore() {
    const store = State.storeDetail || State.stores[0];
    const name = store ? store.store_name : 'this shop';
    Modals.open(`
      <div class="modal-handle"></div>
      <div style="padding:8px 4px 4px;">
        <div style="font-size:38px;text-align:center;margin-bottom:10px;">⚠️</div>
        <div style="font-size:17px;font-weight:900;text-align:center;margin-bottom:6px;">${State.t('seller.confirmDeleteStore.title', { name })}</div>
        <div style="font-size:13px;color:var(--text-secondary);text-align:center;line-height:1.5;margin-bottom:18px;">
          ${State.t('seller.confirmDeleteStore.body')}
        </div>
        <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:10px 12px;margin-bottom:18px;">
          <div style="font-size:12px;color:var(--danger);font-weight:700;">${State.t('seller.confirmDeleteStore.warn')}</div>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn-secondary" onclick="Modals.close();" style="flex:1;">${State.t('seller.confirmDeleteStore.cancel')}</button>
          <button onclick="App.deleteStore(${store ? `'${store.store_id}','${store.store_name.replace(/'/g,"\\'")}'` : ''})" style="flex:1;background:var(--danger);color:white;border:none;padding:13px;border-radius:var(--radius-md);font-size:14px;font-weight:800;cursor:pointer;">${State.t('seller.confirmDeleteStore.delete')}</button>
        </div>
      </div>
    `);
  },
};
