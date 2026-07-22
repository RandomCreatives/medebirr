/* ═══════════════════════════════════════════════════
   Seller Studio Views
═══════════════════════════════════════════════════ */

const SellerViews = {

  // ── Sales Dashboard ───────────────────────────────
  renderDashboard(container) {
    const stats = State.sellerStats;
    if (!stats) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">Loading stats...</div></div>`;
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
        <span class="section-title">Sales Hub</span>
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
          <div class="stat-label">Revenue (30 Days)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${orders.monthly_orders || 0}</div>
          <div class="stat-label">Orders (30 Days)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--warning);">${orders.pending_count || 0}</div>
          <div class="stat-label">Pending Orders</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:#A78BFA;">${orders.dispatched_count || 0}</div>
          <div class="stat-label">In Transit</div>
        </div>
      </div>

      ${pending.length ? `
      <div class="section-header" style="margin-top:6px;">
        <span class="section-title" style="color:var(--accent);">📋 From Telegram (${pending.length})</span>
        <span style="font-size:10px;color:var(--text-secondary);">Complete to publish</span>
      </div>
      ${pending.slice(0, 3).map(p => this._pendingProductCard(p)).join('')}
      ${pending.length > 3 ? `<div style="text-align:center;"><span class="section-link" onclick="App.switchTab('pending')">View all ${pending.length} pending</span></div>` : ''}
      ` : ''}

      <div class="section-header" style="margin-top:6px;">
        <span class="section-title">Recent Orders</span>
        <span class="section-link" onclick="App.switchTab('dispatch')">View All</span>
      </div>

      ${recentOrders.length ? recentOrders.map(o => this._recentOrderRow(o)).join('') : '<p style="font-size:13px;color:var(--text-secondary);">No orders yet. List your items to start selling.</p>'}

      ${reviews.length ? `
      <div class="section-header" style="margin-top:16px;">
        <span class="section-title">⭐ Recent Reviews</span>
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
    const priceStr = p.price_etb ? State.formatETB(p.price_etb) : 'No price';
    return `
      <div class="card" style="margin-bottom:10px;padding:12px;">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          ${thumb}
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:800;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.title || 'Untitled Product'}</div>
            <div style="font-size:12px;color:var(--accent);font-weight:700;margin-top:2px;">${priceStr}</div>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">${timeAgo} · ${p.auto_detected ? 'Auto-detected' : '/sell command'}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;">
          <button class="btn-primary" style="flex:1;padding:8px;font-size:11px;" onclick="Modals.openCompletePending('${p.pending_id}')">📝 Complete</button>
          <button class="btn-secondary" style="flex:1;padding:8px;font-size:11px;" onclick="App.discardPending('${p.pending_id}')">✕ Discard</button>
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
        <span class="section-title">📋 From Telegram (${pending.length})</span>
        <span class="section-link" onclick="App.refreshPendingProducts()">↻ Refresh</span>
      </div>
      <p style="font-size:11px;color:var(--text-secondary);margin:-4px 0 12px;line-height:1.4;">
        Products detected from your Telegram group. Complete the details to publish them to Medebirr and broadcast back to your group.
      </p>
      ${!pending.length ? `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-title">No pending products</div>
          <div class="empty-desc">Post a product image in your Telegram group to get started. The bot will detect it automatically.</div>
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
    const priceStr = p.price_etb ? State.formatETB(p.price_etb) : 'No price set';
    const statusColor = p.status === 'completed' ? 'var(--success)' : 'var(--warning)';
    return `
      <div class="card" style="margin-bottom:10px;padding:12px;">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          ${thumb}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div style="font-size:14px;font-weight:800;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">${p.title || 'Untitled Product'}</div>
              <span style="font-size:9px;padding:2px 6px;border-radius:4px;background:${statusColor}22;color:${statusColor};flex-shrink:0;margin-left:6px;">${p.status}</span>
            </div>
            <div style="font-size:13px;color:var(--accent);font-weight:700;margin-top:2px;">${priceStr}</div>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">${timeAgo} · ${imgs.length} image${imgs.length !== 1 ? 's' : ''} · ${p.auto_detected ? 'Auto-detected' : '/sell command'}</div>
            ${p.caption ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:4px;line-height:1.4;max-height:40px;overflow:hidden;">${p.caption.slice(0, 120)}${p.caption.length > 120 ? '...' : ''}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;">
          <button class="btn-primary" style="flex:1;padding:8px;font-size:11px;" onclick="Modals.openCompletePending('${p.pending_id}')">
            ${p.status === 'completed' ? '🚀 Publish' : '📝 Complete'}
          </button>
          <button class="btn-secondary" style="padding:8px 12px;font-size:11px;" onclick="App.discardPending('${p.pending_id}')">✕ Discard</button>
        </div>
      </div>
    `;
  },

  // ── Inventory / My Items ──────────────────────────
  renderInventory(container) {
    const prods = State.sellerProducts;
    container.innerHTML = `
      <div class="section-header">
        <span class="section-title">My Items (${prods.length})</span>
        <button class="btn-primary" style="width:auto;padding:8px 14px;font-size:12px;" onclick="Modals.openAddProduct()">+ Add Item</button>
      </div>
      ${!prods.length ? `<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No items yet</div><div class="empty-desc">Add your first product to start selling.</div></div>` : ''}
      ${prods.map(p => this._inventoryCard(p)).join('')}
    `;
  },

  _inventoryCard(p) {
    const thumb = (Array.isArray(p.image_urls) && p.image_urls[0])
      ? `<div style="width:48px;height:48px;border-radius:8px;background:url(${p.image_urls[0]}) center/cover no-repeat var(--bg-surface);border:1px solid var(--border);flex-shrink:0;"></div>`
      : `<div style="width:48px;height:48px;border-radius:8px;background:var(--bg-surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">📦</div>`;
    return `
      <div class="card" style="margin-bottom:10px;">
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;">
          ${thumb}
          <div style="flex:1;min-width:0;">
            <div class="card-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.title}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${p.category}${p.sub_category ? ' · ' + p.sub_category : ''} · SKU: ${p.sku || 'N/A'}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">👁 ${p.view_count || 0} views · ⭐ ${(Number(p.rating) || 0).toFixed(1)} (${p.rating_count || 0})</div>
          </div>
          <span style="font-size:11px;padding:3px 8px;border-radius:6px;${p.is_published ? 'background:rgba(16,185,129,0.15);color:var(--success)' : 'background:rgba(245,158,11,0.15);color:var(--warning)'}">
            ${p.is_published ? '● Live' : '○ Draft'}
          </span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="font-size:16px;font-weight:900;color:var(--accent);">${State.formatETB(p.price_etb)}</span>
            ${p.compare_price ? `<span style="font-size:11px;color:var(--text-muted);text-decoration:line-through;margin-left:6px;">${State.formatETB(p.compare_price)}</span>` : ''}
            <span style="font-size:11px;color:var(--text-secondary);margin-left:8px;">Stock: ${p.stock_quantity - (p.reserved_stock || 0)}</span>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn-secondary" style="width:auto;padding:7px 12px;font-size:11px;" onclick="Modals.openEditProduct('${p.product_id}')">✏️ Edit</button>
            <button style="background:${p.is_published ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)'};border:1px solid ${p.is_published ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'};color:${p.is_published ? 'var(--warning)' : 'var(--success)'};padding:7px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;" onclick="App.togglePublish('${p.product_id}',${p.is_published})">
              ${p.is_published ? 'Unpublish' : 'Publish'}
            </button>
            <button style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:var(--danger);padding:7px 10px;border-radius:8px;font-size:11px;cursor:pointer;" onclick="App.confirmDeleteProduct('${p.product_id}','${(p.title||'').replace(/'/g,"\\'")}')">
              🗑
            </button>
          </div>
        </div>
      </div>
    `;
  },

  // ── Account & Settings (opened from the 3-dots menu) ──
  // Regrouped into clear sections: Identity → Payout → Policies →
  // Automation → Account. All existing store/policy/coupon functionality is
  // preserved; payout accounts are now editable inline and a logout action
  // is available in the Account section.
  renderSellerMenu(container) {
    const store = State.storeDetail || State.stores[0];
    const cp = State.couponPolicy || { share_required:3, share_discount:5, share_coupon_active:false, group_min_members:3, group_discount:10, group_buy_active:false, coupon_validity_days:7 };
    if (!store) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚙️</div><div class="empty-title">No store registered</div></div>`;
      return;
    }

    const tierBadge = { none: '', basic: '🟢 Basic', verified: '✅ Verified', trusted: '⭐ Trusted' };
    const statusColors = { verified: 'var(--success)', pending: 'var(--warning)', suspended: 'var(--danger)' };
    const storeUrl = `${window.location.origin}${window.location.pathname}?store=${store.store_code}`;
    const tgConnected = !!store.tg_channel_username;

    // ── Identity ──
    const identity = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <div style="width:54px;height:54px;border-radius:14px;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;">🏪</div>
        <div style="min-width:0;">
          <div style="font-size:16px;font-weight:900;">${store.store_name}</div>
          <div style="font-size:12px;color:${statusColors[store.status] || 'var(--text-secondary)'};font-weight:700;">● ${store.status}</div>
        </div>
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
      </div>`;

    // ── Payout & Payment ──
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
      <button class="btn-secondary" id="savePayoutBtn" style="width:100%;" onclick="App.savePaymentAccounts()">💾 Save Payment Accounts</button>
      <div class="progress-wrap" id="payoutProgress" style="display:none;">
        <div class="progress-bar" id="payoutProgressBar"></div>
      </div>
      <div class="progress-status" id="payoutProgressStatus" style="display:none;"></div>`;

    // ── Policies ──
    const policies = `
      <div class="form-group">
        <label class="form-label">Return Policy</label>
        <select class="form-select" id="policyType">
          <option value="7_day_free" ${store.return_policy_type==='7_day_free'?'selected':''}>7-Day Free Returns</option>
          <option value="3_day_warranty" ${store.return_policy_type==='3_day_warranty'?'selected':''}>3-Day Replacement Warranty</option>
          <option value="size_exchange" ${store.return_policy_type==='size_exchange'?'selected':''}>Size Exchange (24 Hours)</option>
          <option value="fresh_guarantee" ${store.return_policy_type==='fresh_guarantee'?'selected':''}>Freshness Guarantee</option>
          <option value="no_return" ${store.return_policy_type==='no_return'?'selected':''}>No Returns</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Policy Description (shown to buyers at checkout)</label>
        <textarea class="form-textarea" id="policyText" placeholder="Describe your return / warranty terms...">${store.custom_policy_text || ''}</textarea>
      </div>

      <div class="form-group" style="margin-bottom:12px;">
        <label class="form-label">Payment Methods Accepted</label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;">
          <input type="checkbox" id="telebirrEnabled" ${store.telebirr_enabled!==false?'checked':''} style="accent-color:var(--accent);"> 📱 Telebirr (buyer pays to your number)
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;">
          <input type="checkbox" id="cbeEnabled" ${store.cbe_enabled?'checked':''} style="accent-color:var(--accent);"> 🏦 CBE Bank Transfer
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
          <input type="checkbox" id="cashEnabled" ${store.cash_on_delivery!==false?'checked':''} style="accent-color:var(--accent);"> 💵 Cash on Delivery
        </label>
      </div>

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
      <button class="btn-secondary" style="width:100%;" onclick="App.savePolicy()">💾 Save Store Policy</button>`;

    // ── Promotions (Coupon & Group Buying) ──
    const promotions = `
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">Grow sales with share-to-save coupons and group-buy discounts.</div>

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

      <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">

      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div>
            <div style="font-size:13px;font-weight:800;margin-bottom:2px;">👥 Group Buying</div>
            <div style="font-size:11px;color:var(--text-secondary);">Customers can form a group to buy together and get a discount.</div>
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

      <button class="btn-secondary" style="width:100%;" onclick="App.saveCouponPolicy()">💾 Save Promotions</button>`;

    // ── Automation ──
    const automation = `
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
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

      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:13px;font-weight:800;margin-bottom:2px;">🔍 Auto-Detect Products</div>
            <div style="font-size:11px;color:var(--text-secondary);">Any photo with a price in your group becomes a pending product. When OFF, only /sell commands create products.</div>
          </div>
          ${this._toggle('autoDetectToggle', store.auto_detect_products !== false, "App.toggleAutoDetect(this.checked)")}
        </div>
      </div>

      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:13px;font-weight:800;margin-bottom:2px;">📨 Telegram Notifications</div>
            <div style="font-size:11px;color:var(--text-secondary);">Buyers get DM updates via @medebirrbot when their order status changes.</div>
          </div>
          ${this._toggle('telegramNotifsToggle', store.telegram_notifs !== false, "App.toggleTelegramNotifs(this.checked)")}
        </div>
      </div>`;

    // ── Staff Roles & Permissions [NEW] ──
    const staff = `
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">Invite team members and assign roles. (Staff management is provisioned per store — contact Medebirr support to enable seats for your shop.)</div>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:800;margin-bottom:6px;">👤 Owner</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">Full access — you. Receives payouts and can delete the shop.</div>
        <span style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:20px;padding:3px 10px;font-size:11px;color:var(--success);font-weight:700;">Active</span>
      </div>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:800;margin-bottom:6px;">🛡️ Manager</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">Manage products, orders and policies. Cannot change payouts or delete the shop.</div>
        <button class="btn-secondary" style="width:100%;" onclick="App.toast('Staff invites coming soon','info')">+ Invite Manager</button>
      </div>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:800;margin-bottom:6px;">📦 Fulfilment Staff</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">View and fulfil orders only. Ideal for warehouse or dispatch teams.</div>
        <button class="btn-secondary" style="width:100%;" onclick="App.toast('Staff invites coming soon','info')">+ Invite Staff</button>
      </div>`;

    // ── Shipping & Delivery Rules [NEW] ──
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

    // ── Tax Config & Invoices [NEW] ──
    const tax = `
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">Configure how tax is shown to buyers and whether invoices are auto-generated.</div>
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
      <button class="btn-secondary" style="width:100%;" onclick="App.saveTaxConfig()">💾 Save Tax &amp; Invoice Settings</button>`;

    // ── Notification Preferences [NEW] ──
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
            <div style="font-size:13px;font-weight:800;margin-bottom:2px;">🔔 New Order Alerts</div>
            <div style="font-size:11px;color:var(--text-secondary);">Ping you in Telegram the moment a new order lands.</div>
          </div>
          ${this._toggle('newOrderToggle', store.new_order_alerts !== false, "App.toggleNewOrderAlerts(this.checked)")}
        </div>
      </div>`;

    // ── Account Security (2FA, Password) ──
    const security = `
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:13px;font-weight:800;margin-bottom:2px;">🔐 Two-Factor Auth (2FA)</div>
            <div style="font-size:11px;color:var(--text-secondary);">Require a Telegram code on every login to your seller account.</div>
          </div>
          ${this._toggle('twoFactorToggle', store.two_factor_enabled, "App.toggleTwoFactor(this.checked)")}
        </div>
      </div>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:800;margin-bottom:4px;">🔑 Account Password</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">Used to confirm sensitive actions like payout changes and shop deletion.</div>
        <button class="btn-secondary" style="width:100%;" onclick="App.toast('Password reset link sent to your Telegram','success')">Reset Password</button>
      </div>

      <div class="settings-danger-zone">
        <div style="font-size:10px;color:var(--danger);font-weight:800;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">⚠️ Danger Zone</div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px;">
          Deleting your shop permanently unpublishes all its products and removes it from Medebirr.
          This cannot be undone. You cannot delete the shop while it has active (paid, undelivered) orders.
        </div>
        <button class="settings-delete-btn" style="width:100%;" onclick="SellerViews._confirmDeleteStore()">
          🗑 Delete My Shop &amp; Medebirr Account
        </button>
      </div>

      <button class="settings-logout-btn" style="width:100%;" onclick="SellerViews._confirmLogout()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Log Out
      </button>`;

    // Split promotions into two sections
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

    const groupBuy = `
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">Customers can form a group to buy together and get a discount.</div>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div>
            <div style="font-size:13px;font-weight:800;margin-bottom:2px;">👥 Group Buying</div>
            <div style="font-size:11px;color:var(--text-secondary);">Customers can form a group to buy together and get a discount.</div>
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
      <button class="btn-secondary" style="width:100%;" onclick="App.saveCouponPolicy()">💾 Save Group Buy</button>`;

    // Remove telegram notifs from automation (now under notifications)
    const automationClean = automation.replace(
      /<div style="background:var\(--bg-surface\);border:1px solid var\(--border\);border-radius:var\(--radius-md\);padding:16px;margin-bottom:12px;">\s*<div style="display:flex;justify-content:space-between;align-items:center;">\s*<div>\s*<div style="font-size:13px;font-weight:800;margin-bottom:2px;">📨 Telegram Notifications<\/div>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
      ''
    );

    // ── Section registry (grouped into 5 categories) ──
    const sections = {
      identity:     { title: 'Store Identity & Profile',     icon: Icons.store,    desc: 'Name, logo, code & share',     body: identity },
      policies:     { title: 'Store Policies & Legal Docs',  icon: Icons.file,     desc: 'Returns, payments & fees',     body: policies },
      staff:        { title: 'Staff Roles & Permissions',    icon: Icons.users,    desc: 'Invite managers & staff',     body: staff },
      coupons:      { title: 'Coupons & Discounts',          icon: Icons.tag,      desc: 'Share-to-save promotions',     body: coupons },
      groupBuy:     { title: 'Group Buy Settings',           icon: Icons.users,    desc: 'Bulk-buy discounts',           body: groupBuy },
      shipping:     { title: 'Shipping & Delivery Rules',    icon: Icons.truck,    desc: 'Fees & delivery options',      body: shipping, badge: 'NEW' },
      automation:   { title: 'Automation (Stock & Routing)', icon: Icons.zap,      desc: 'Group, auto-detect & alerts',  body: automationClean },
      payout:       { title: 'Payout & Bank Details',        icon: Icons.wallet,   desc: 'Telebirr & CBE accounts',      body: payout },
      tax:          { title: 'Tax Config & Invoices',        icon: Icons.receipt,  desc: 'VAT, TIN & auto-invoice',      body: tax, badge: 'NEW' },
      security:     { title: 'Account Security (2FA)',       icon: Icons.lock,     desc: 'Password & 2FA',               body: security },
      notifications:{ title: 'Notification Preferences',     icon: Icons.bell,     desc: 'Order & stock alerts',         body: notifications, badge: 'NEW' }
    };

    const groups = [
      { key: 'setup',     title: 'Setup & Branding',    sub: 'Get Started',       icon: Icons.store,  sections: ['identity', 'policies', 'staff'] },
      { key: 'sales',     title: 'Sales & Promotion',   sub: 'Attract Customers', icon: Icons.target, sections: ['coupons', 'groupBuy'] },
      { key: 'orders',    title: 'Order Management',    sub: 'Fulfill Orders',    icon: Icons.truck,  sections: ['shipping', 'automation'] },
      { key: 'money',     title: 'Money & Earnings',    sub: 'Get Paid',          icon: Icons.wallet, sections: ['payout', 'tax'] },
      { key: 'security',  title: 'Security & Access',   sub: 'Protect the Shop',  icon: Icons.shield, sections: ['security', 'notifications'] }
    ];

    const iconCell = (svg) => `<span class="menu-icon">${svg}</span>`;

    // ── Detail view (a single section with a back button to its group) ──
    if (State.sellerSettingsSection && sections[State.sellerSettingsSection]) {
      const s = sections[State.sellerSettingsSection];
      container.innerHTML = `
        <div class="settings-detail-header">
          <button class="pdp-back-btn" onclick="SellerViews._backToSettingsGroup()" aria-label="Back">${Icons.chevron(22)}</button>
          <div class="settings-detail-title">${s.icon(18)} ${s.title}</div>
          <div style="width:28px;"></div>
        </div>
        <div style="padding:4px 0 8px;">${s.body}</div>
      `;
      return;
    }

    // ── Group list view (sub-sections of a chosen category) ──
    if (State.sellerSettingsGroup) {
      const g = groups.find(x => x.key === State.sellerSettingsGroup);
      if (!g) { State.sellerSettingsGroup = null; }
      else {
        const rows = g.sections.map(key => {
          const s = sections[key];
          return `
            <button class="settings-menu-row" onclick="SellerViews._openSettingsSection('${key}')">
              ${iconCell(s.icon(20))}
              <span class="settings-menu-text">
                <span class="settings-menu-label">${s.title}</span>
                <span class="settings-menu-sub">${s.desc}</span>
              </span>
              ${s.badge ? `<span class="settings-new-badge">${s.badge}</span>` : ''}
              <span class="settings-menu-arrow">›</span>
            </button>`;
        }).join('');
        container.innerHTML = `
          <div class="settings-detail-header">
            <button class="pdp-back-btn" onclick="SellerViews._backToSettingsMenu()" aria-label="Back">${Icons.chevron(22)}</button>
            <div class="settings-detail-title">${g.icon(18)} ${g.title}</div>
            <div style="width:28px;"></div>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);padding:0 2px 10px;">${g.sub}</div>
          <div class="settings-menu">${rows}</div>
        `;
        return;
      }
    }

    // ── Category list view (top level) ──
    const groupRows = groups.map(g => `
      <button class="settings-menu-row settings-group-row" onclick="SellerViews._openSettingsGroup('${g.key}')">
        ${iconCell(g.icon(22))}
        <span class="settings-menu-text">
          <span class="settings-menu-label">${g.title}</span>
          <span class="settings-menu-sub">${g.sub}</span>
        </span>
        <span class="settings-menu-arrow">›</span>
      </button>`).join('');

    container.innerHTML = `
      <div class="section-header"><span class="section-title">👤 Account &amp; Settings</span></div>
      <div class="settings-menu">${groupRows}</div>
    `;
  },

  _openSettingsGroup(key) {
    State.sellerSettingsGroup = key;
    State.sellerSettingsSection = null;
    const body = document.getElementById('appBody');
    if (body) { this.renderSellerMenu(body); body.scrollTop = 0; }
  },

  _openSettingsSection(key) {
    State.sellerSettingsSection = key;
    const body = document.getElementById('appBody');
    if (body) { this.renderSellerMenu(body); body.scrollTop = 0; }
  },

  _backToSettingsGroup() {
    State.sellerSettingsSection = null;
    const body = document.getElementById('appBody');
    if (body) { this.renderSellerMenu(body); body.scrollTop = 0; }
  },

  _backToSettingsMenu() {
    State.sellerSettingsGroup = null;
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
      title: 'Store Notifications',
      emptyTitle: 'No notifications yet',
      emptyDesc: 'New orders, dispatches, payouts and delivery updates will appear here.',
      role: 'seller'
    });
  },

  // ── Dispatch / Orders (seller "Orders" tab) ──
  renderDispatch(container) {
    const orders = State.storeOrders || [];
    if (!orders.length) {
      container.innerHTML = `
        <div class="section-header"><span class="section-title">📦 Orders</span></div>
        <div class="empty-state"><div class="empty-icon">🛵</div><div class="empty-title">No orders yet</div><div class="empty-desc">Orders from your store will appear here.</div></div>`;
      return;
    }
    const awaiting = orders.filter(o => o.order_status === 'confirmed' && o.payment_status === 'paid').length;
    container.innerHTML = `
      <div class="section-header">
        <span class="section-title">📦 Orders</span>
        <span style="font-size:11px;color:var(--warning);">${awaiting} awaiting dispatch</span>
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
      ? `<div style="margin-top:6px;font-size:11px;color:var(--success);font-weight:800;">🏪 Self-delivery (you)</div>`
      : provider === 'company'
        ? `<div style="margin-top:6px;font-size:11px;color:#60A5FA;font-weight:800;">🚚 Delivery Co: ${o.rider_name || ''}</div>`
        : o.rider_name ? `<div style="margin-top:6px;font-size:11px;color:#A78BFA;">🛵 Rider: ${o.rider_name} · ${o.rider_phone}</div>` : '';
    const statusBadge = {
      pending: '⏳ Pending', confirmed: '✅ Confirmed', dispatched: '🚚 Dispatched',
      delivered: '📦 Delivered', cancelled: '✕ Cancelled'
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
        <div style="font-size:17px;font-weight:900;margin-bottom:8px;">Log Out?</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;">You'll need to sign in again to manage your store.</div>
        <div style="display:flex;gap:10px;">
          <button class="btn-secondary" onclick="Modals.close();" style="flex:1;">Cancel</button>
          <button onclick="App.clearToken();location.reload();" style="flex:1;background:var(--danger);color:white;border:none;padding:13px;border-radius:var(--radius-md);font-size:14px;font-weight:800;cursor:pointer;">Log Out</button>
        </div>
      </div>
    `);
  },

  _confirmDeleteStore() {
    const store = State.storeDetail || State.stores[0];
    const name = store ? store.store_name : 'this shop';
    Modals.open(`
      <div class="modal-handle"></div>
      <div style="padding:8px 4px 4px;">
        <div style="font-size:38px;text-align:center;margin-bottom:10px;">⚠️</div>
        <div style="font-size:17px;font-weight:900;text-align:center;margin-bottom:6px;">Delete "${name}"?</div>
        <div style="font-size:13px;color:var(--text-secondary);text-align:center;line-height:1.5;margin-bottom:18px;">
          This permanently unpublishes all products and removes your shop from Medebirr. This action cannot be undone.
        </div>
        <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:10px 12px;margin-bottom:18px;">
          <div style="font-size:12px;color:var(--danger);font-weight:700;">⚠️ You cannot delete while there are active (paid, undelivered) orders.</div>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn-secondary" onclick="Modals.close();" style="flex:1;">Cancel</button>
          <button onclick="App.deleteStore(${store ? `'${store.store_id}','${store.store_name.replace(/'/g,"\\'")}'` : ''})" style="flex:1;background:var(--danger);color:white;border:none;padding:13px;border-radius:var(--radius-md);font-size:14px;font-weight:800;cursor:pointer;">Delete Shop</button>
        </div>
      </div>
    `);
  },
};
