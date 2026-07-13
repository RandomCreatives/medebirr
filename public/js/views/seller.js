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
        <span style="font-size:11px;color:${verificationTier === 'verified' || verificationTier === 'trusted' ? 'var(--success)' : 'var(--warning)'};">● ${tierBadge[verificationTier] || store?.status || 'Pending'}</span>
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
        + Publish New Item to Hub
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

  // ── Store Policy ──────────────────────────────────
  renderPolicy(container) {
    const store = State.stores[0];
    const cp = State.couponPolicy || { share_required:3, share_discount:5, share_coupon_active:false, group_min_members:3, group_discount:10, group_buy_active:false, coupon_validity_days:7 };
    if (!store) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚙️</div><div class="empty-title">No store registered</div></div>`;
      return;
    }
    container.innerHTML = `
      <div class="section-header"><span class="section-title">Store Policy & Settings</span></div>

      <div class="card" style="margin-bottom:12px;">
        <div class="card-title">${store.store_name}</div>
        <div class="card-sub">${store.status === 'verified' ? '✅ Verified Store' : '⏳ Pending Verification'}</div>
      </div>

      <div id="policyForm">

        <!-- Telegram Group Link Section -->
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:800;margin-bottom:4px;">📢 Telegram Group Connection</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">
            ${store.tg_channel_username
              ? `✅ Connected: <strong style="color:white;">@${store.tg_channel_username}</strong> — Products auto-post here when published.`
              : '⚠️ No group connected yet. Connect a group to auto-broadcast your products.'}
          </div>
          <div style="display:flex;gap:8px;">
            <input class="form-input" id="groupUsernameInput" placeholder="@YourGroupUsername" value="${store.tg_channel_username || ''}" style="flex:1;"/>
            <button onclick="App._verifyGroupFromPolicy()" style="background:rgba(252,205,4,0.15);border:1px solid rgba(252,205,4,0.4);color:var(--accent);padding:9px 14px;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;">
              ✅ Verify Admin
            </button>
          </div>
          <div id="policyGroupVerifyResult" style="margin-top:8px;"></div>
        </div>

        <!-- Auto-Detect Products Toggle -->
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:13px;font-weight:800;margin-bottom:2px;">🔍 Auto-Detect Products</div>
              <div style="font-size:11px;color:var(--text-secondary);">
                When ON, any photo with a price in your group becomes a pending product.<br>
                When OFF, only /sell commands trigger product creation.
              </div>
            </div>
            <label style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;margin-left:12px;">
              <input type="checkbox" id="autoDetectToggle" ${store.auto_detect_products !== false ? 'checked' : ''}
                     onchange="App.toggleAutoDetect(this.checked)" style="opacity:0;width:0;height:0;">
              <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${store.auto_detect_products !== false ? 'var(--accent)' : 'var(--border)'};border-radius:12px;transition:0.3s;">
                <span style="position:absolute;content:'';height:18px;width:18px;left:${store.auto_detect_products !== false ? '22px' : '3px'};bottom:3px;background:white;border-radius:50%;transition:0.3s;"></span>
              </span>
            </label>
          </div>
        </div>

        <!-- Telegram Notifications Toggle -->
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:13px;font-weight:800;margin-bottom:2px;">📨 Telegram Notifications</div>
              <div style="font-size:11px;color:var(--text-secondary);">
                When ON, buyers receive DM updates via @medebirrbot when their order status changes.<br>
                When OFF, buyers will not get Telegram notifications.
              </div>
            </div>
            <label style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;margin-left:12px;">
              <input type="checkbox" id="telegramNotifsToggle" ${store.telegram_notifs !== false ? 'checked' : ''}
                     onchange="App.toggleTelegramNotifs(this.checked)" style="opacity:0;width:0;height:0;">
              <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${store.telegram_notifs !== false ? 'var(--accent)' : 'var(--border)'};border-radius:12px;transition:0.3s;">
                <span style="position:absolute;content:'';height:18px;width:18px;left:${store.telegram_notifs !== false ? '22px' : '3px'};bottom:3px;background:white;border-radius:50%;transition:0.3s;"></span>
              </span>
            </label>
          </div>
        </div>

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

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
          <div class="form-group">
            <label class="form-label">Addis Ababa Delivery Fee (Br)</label>
            <input type="number" class="form-input" id="addisFee" value="${store.addis_delivery_fee || 150}" />
          </div>
          <div class="form-group">
            <label class="form-label">Regional Dispatch (Br)</label>
            <input type="number" class="form-input" id="regionalFee" value="${store.regional_dispatch_fee || 400}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Payment Methods Accepted</label>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;">
            <input type="checkbox" id="telebirrEnabled" ${store.telebirr_enabled!==false?'checked':''} style="accent-color:var(--accent);">
            📱 Telebirr (Buyer pays to your number)
          </label>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;">
            <input type="checkbox" id="cbeEnabled" ${store.cbe_enabled?'checked':''} style="accent-color:var(--accent);">
            🏦 CBE Bank Transfer (Buyer transfers to your account)
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <input type="checkbox" id="cashEnabled" ${store.cash_on_delivery!==false?'checked':''} style="accent-color:var(--accent);">
            💵 Cash on Delivery
          </label>
        </div>

        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:800;margin-bottom:12px;">💳 Payment Account Details</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;">
            These details are shown to buyers at checkout so they can pay you directly.
          </div>
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
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="form-label" style="font-size:11px;">CBE Account Number</label>
              <input class="form-input" id="cbeAccountNumber" value="${store.cbe_account_number || ''}" placeholder="1000XXXXXXX"/>
            </div>
            <div>
              <label class="form-label" style="font-size:11px;">CBE Account Name</label>
              <input class="form-input" id="cbeAccountName" value="${store.cbe_account_name || ''}" placeholder="Account holder name"/>
            </div>
          </div>
          <button class="btn-secondary" style="margin-top:12px;width:100%;" onclick="App.savePaymentAccounts()">Save Payment Accounts</button>
        </div>

        <!-- Coupon & Group Buying Section -->
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:800;margin-bottom:12px;">🎁 Coupon & Group Buying</div>

          <!-- Share-to-Save Coupon Program -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div>
              <div style="font-size:13px;font-weight:800;margin-bottom:2px;">📤 Share-to-Save Coupons</div>
              <div style="font-size:11px;color:var(--text-secondary);">Customers earn a coupon when they share a product N times.</div>
            </div>
            <label style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;margin-left:12px;">
              <input type="checkbox" id="shareCouponToggle" ${cp.share_coupon_active ? 'checked' : ''} style="opacity:0;width:0;height:0;">
              <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${cp.share_coupon_active ? 'var(--accent)' : 'var(--border)'};border-radius:12px;transition:0.3s;">
                <span style="position:absolute;content:'';height:18px;width:18px;left:${cp.share_coupon_active ? '22px' : '3px'};bottom:3px;background:white;border-radius:50%;transition:0.3s;"></span>
              </span>
            </label>
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
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Coupon Valid (days)</label>
            <input type="number" class="form-input" id="couponValidityDays" value="${cp.coupon_validity_days}" placeholder="7" />
          </div>

          <hr style="border:none;border-top:1px solid var(--border);margin:12px 0;">

          <!-- Group Buying (Pinduoduo) -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div>
              <div style="font-size:13px;font-weight:800;margin-bottom:2px;">👥 Group Buying</div>
              <div style="font-size:11px;color:var(--text-secondary);">Customers can form a group to buy together and get a discount.</div>
            </div>
            <label style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;margin-left:12px;">
              <input type="checkbox" id="groupBuyToggle" ${cp.group_buy_active ? 'checked' : ''} style="opacity:0;width:0;height:0;">
              <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${cp.group_buy_active ? 'var(--accent)' : 'var(--border)'};border-radius:12px;transition:0.3s;">
                <span style="position:absolute;content:'';height:18px;width:18px;left:${cp.group_buy_active ? '22px' : '3px'};bottom:3px;background:white;border-radius:50%;transition:0.3s;"></span>
              </span>
            </label>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="form-group">
              <label class="form-label">Min Members</label>
              <input type="number" class="form-input" id="groupMinMembers" value="${cp.group_min_members}" placeholder="3" />
            </div>
            <div class="form-group">
              <label class="form-label">Group Discount %</label>
              <input type="number" class="form-input" id="groupDiscount" value="${cp.group_discount}" placeholder="10" />
            </div>
          </div>

          <button class="btn-secondary" style="margin-top:12px;width:100%;" onclick="App.saveCouponPolicy()">Save Coupon Settings</button>
        </div>

        <button class="btn-primary" onclick="App.savePolicy()">Save Store Settings</button>
      </div>
    `;
  },

  // ── Dispatch Center ───────────────────────────────
  renderDispatch(container) {
    const orders = State.storeOrders.filter(o => o.payment_status === 'paid' && o.order_status !== 'delivered' && o.order_status !== 'cancelled');
    container.innerHTML = `
      <div class="section-header">
        <span class="section-title">Dispatch Center</span>
        <span style="font-size:11px;color:var(--warning);">${orders.filter(o=>o.order_status==='confirmed').length} awaiting dispatch</span>
      </div>
      ${!orders.length ? `<div class="empty-state"><div class="empty-icon">🛵</div><div class="empty-title">No paid orders to dispatch</div><div class="empty-desc">Paid orders will appear here for rider assignment.</div></div>` : ''}
      ${orders.map(o => this._dispatchCard(o)).join('')}
    `;
  },

  _dispatchCard(o) {
    let addr = {};
    try {
      addr = typeof o.delivery_address === 'string' ? JSON.parse(o.delivery_address) : (o.delivery_address || {});
    } catch (_) {}
    const addrStr = [addr.sub_city, addr.woreda, addr.house_number, addr.landmark].filter(Boolean).join(', ');
    return `
      <div class="dispatch-card">
        <div class="dispatch-order-ref">${o.order_ref} · ${new Date(o.created_at).toLocaleDateString()}</div>
        <div class="dispatch-buyer">👤 ${o.first_name} ${o.last_name || ''} (@${o.buyer_username || 'user'})</div>
        <div class="dispatch-address">📍 ${addrStr}<br>📞 ${addr.phone || 'N/A'}</div>
        <div style="margin-top:8px;font-size:14px;font-weight:900;color:var(--accent);">${State.formatETB(o.total_etb)} — ${o.payment_method.toUpperCase()}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:3px;">💳 TX ID: <span style="font-family:monospace;color:white;font-weight:800;">${o.transaction_code || o.payment_tx_ref || 'Cash on Delivery'}</span></div>
        ${Number(o.discount_etb) > 0 ? `<div style="font-size:11px;color:var(--success);font-weight:800;margin-top:2px;">🎟️ Coupon Discount Applied: -${State.formatETB(o.discount_etb)}</div>` : ''}
        ${o.rider_name ? `<div style="margin-top:6px;font-size:11px;color:#A78BFA;">🛵 Rider assigned: ${o.rider_name} · ${o.rider_phone}</div>` : ''}
        <div class="dispatch-actions">
          ${o.order_status === 'confirmed' ? `<button class="btn-dispatch" onclick="Modals.openAssignRider('${o.order_id}')">🛵 Assign Rider</button>` : ''}
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

  // ── Store Profile ─────────────────────────────────
  renderProfile(container) {
    const store = State.storeDetail || State.stores[0];
    if (!store) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">🏪</div><div class="empty-title">Loading profile...</div></div>`;
      return;
    }
    const tierBadge = { none: '', basic: '🟢 Basic', verified: '✅ Verified', trusted: '⭐ Trusted' };
    const statusColors = { verified: 'var(--success)', pending: 'var(--warning)', suspended: 'var(--danger)' };
    const storeUrl = `${window.location.origin}${window.location.pathname}?store=${store.store_code}`;

    container.innerHTML = `
      <div class="section-header">
        <span class="section-title">🏪 ${store.store_name}</span>
        <span style="font-size:11px;color:${statusColors[store.status] || 'var(--text-secondary)'};">● ${store.status}</span>
      </div>

      <!-- Store Code -->
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:10px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Store Code</div>
          <div style="font-size:18px;font-weight:900;color:var(--accent);font-family:monospace;letter-spacing:2px;margin-top:2px;">${store.store_code || '—'}</div>
        </div>
        <button onclick="navigator.clipboard.writeText('${store.store_code}');App.toast('Store code copied!','success');" style="background:rgba(252,205,4,0.1);border:1px solid rgba(252,205,4,0.3);border-radius:8px;padding:8px 14px;color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;">📋 Copy</button>
      </div>

      <!-- QR Code (shareable store link) -->
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px;margin-bottom:12px;text-align:center;">
        <div style="font-size:10px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">📲 Share Your Store</div>
        <div id="profileQR" style="display:flex;justify-content:center;margin-bottom:8px;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(storeUrl)}" alt="Store QR" style="border-radius:8px;width:150px;height:150px;background:white;padding:4px;"/>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);word-break:break-all;">${storeUrl}</div>
        <button onclick="navigator.clipboard.writeText('${storeUrl}');App.toast('Store link copied!','success');" style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:8px 14px;color:#60A5FA;font-size:12px;font-weight:700;cursor:pointer;margin-top:8px;">🔗 Copy Store Link</button>
      </div>

      <!-- Badges & Verification -->
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;">
        <div style="font-size:10px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">🏅 Badges & Status</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${store.verified_badge ? '<span style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--success);font-weight:700;">✅ Verified Merchant</span>' : '<span style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--warning);font-weight:700;">⏳ Pending Verification</span>'}
          ${store.verification_tier && store.verification_tier !== 'none' ? `<span style="background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.3);border-radius:20px;padding:4px 12px;font-size:12px;color:#A78BFA;font-weight:700;">${tierBadge[store.verification_tier]}</span>` : ''}
          ${store.rating > 0 ? `<span style="background:rgba(252,205,4,0.1);border:1px solid rgba(252,205,4,0.3);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--accent);font-weight:700;">⭐ ${Number(store.rating).toFixed(1)} (${store.rating_count})</span>` : '<span style="background:rgba(156,163,175,0.1);border:1px solid rgba(156,163,175,0.3);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--text-secondary);font-weight:700;">No ratings yet</span>'}
        </div>
      </div>

      <!-- Payment Accounts -->
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;">
        <div style="font-size:10px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">💳 Payment Accounts</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;">
            <span style="color:var(--text-secondary);">Telebirr</span>
            <span style="color:white;font-weight:700;">${store.telebirr_merchant_id ? '✅ Connected' : '— Not set'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;">
            <span style="color:var(--text-secondary);">CBE Account</span>
            <span style="color:white;font-weight:700;">${store.cbe_account_number ? '✅ Connected' : '— Not set'}</span>
          </div>
        </div>
        <button class="btn-secondary" style="width:100%;margin-top:8px;" onclick="App.switchTab('dispatch')">⚙️ Manage Payments in Dispatch</button>
      </div>

      <!-- Return Policy -->
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;">
        <div style="font-size:10px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">📋 Return Policy</div>
        <div style="font-size:13px;color:white;font-weight:700;">${State.policyLabel(store.return_policy_type)}</div>
        <button class="btn-secondary" style="width:100%;margin-top:8px;" onclick="App.switchTab('dispatch')">⚙️ Edit Policy in Dispatch</button>
      </div>

      <!-- Stats -->
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;">
        <div style="font-size:10px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;">📊 Store Stats</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="text-align:center;padding:8px;background:rgba(59,130,246,0.08);border-radius:8px;">
            <div style="font-size:18px;font-weight:900;color:white;">${store.total_orders || 0}</div>
            <div style="font-size:10px;color:var(--text-secondary);font-weight:700;">Total Orders</div>
          </div>
          <div style="text-align:center;padding:8px;background:rgba(16,185,129,0.08);border-radius:8px;">
            <div style="font-size:18px;font-weight:900;color:var(--success);">${State.formatETB(store.total_revenue || 0)}</div>
            <div style="font-size:10px;color:var(--text-secondary);font-weight:700;">Total Revenue</div>
          </div>
        </div>
      </div>

      <div style="text-align:center;margin-top:4px;margin-bottom:16px;">
        <button class="btn-primary" onclick="App.switchTab('dashboard')" style="width:100%;">📊 Back to Dashboard</button>
      </div>
    `;
  }
};
