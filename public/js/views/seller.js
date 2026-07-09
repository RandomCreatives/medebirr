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
    container.innerHTML = `
      <div class="section-header">
        <span class="section-title">Sales Hub</span>
        <span style="font-size:11px;color:var(--success);">● Verified Shop</span>
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

      <div class="section-header" style="margin-top:6px;">
        <span class="section-title">Recent Orders</span>
        <span class="section-link" onclick="App.switchTab('dispatch')">View All</span>
      </div>

      ${recentOrders.length ? recentOrders.map(o => this._recentOrderRow(o)).join('') : '<p style="font-size:13px;color:var(--text-secondary);">No orders yet. List your items to start selling.</p>'}

      <button class="btn-primary" style="margin-top:14px;" onclick="Modals.openAddProduct()">
        + Publish New Item to Hub
      </button>
    `;
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
    return `
      <div class="card" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div style="flex:1;margin-right:10px;">
            <div class="card-title">${p.title}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${p.category} · SKU: ${p.sku || 'N/A'}</div>
          </div>
          <span style="font-size:11px;padding:3px 8px;border-radius:6px;${p.is_published ? 'background:rgba(16,185,129,0.15);color:var(--success)' : 'background:rgba(245,158,11,0.15);color:var(--warning)'}">
            ${p.is_published ? '● Live' : '○ Draft'}
          </span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="font-size:16px;font-weight:900;color:var(--accent);">${State.formatETB(p.price_etb)}</span>
            <span style="font-size:11px;color:var(--text-secondary);margin-left:8px;">Stock: ${p.stock_quantity - (p.reserved_stock || 0)}</span>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn-secondary" style="width:auto;padding:7px 12px;font-size:11px;" onclick="Modals.openEditProduct('${p.product_id}')">Edit</button>
            <button style="background:${p.is_published ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)'};border:1px solid ${p.is_published ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'};color:${p.is_published ? 'var(--warning)' : 'var(--success)'};padding:7px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;" onclick="App.togglePublish('${p.product_id}',${p.is_published})">
              ${p.is_published ? 'Unpublish' : 'Publish'}
            </button>
          </div>
        </div>
      </div>
    `;
  },

  // ── Store Policy ──────────────────────────────────
  renderPolicy(container) {
    const store = State.stores[0];
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
            📱 Telebirr SuperApp (Direct to your Shortcode)
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <input type="checkbox" id="cashEnabled" ${store.cash_on_delivery!==false?'checked':''} style="accent-color:var(--accent);">
            💵 Cash on Delivery
          </label>
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
    const addr = typeof o.delivery_address === 'string' ? JSON.parse(o.delivery_address) : o.delivery_address;
    const addrStr = [addr.sub_city, addr.woreda, addr.house_number, addr.landmark].filter(Boolean).join(', ');
    return `
      <div class="dispatch-card">
        <div class="dispatch-order-ref">${o.order_ref} · ${new Date(o.created_at).toLocaleDateString()}</div>
        <div class="dispatch-buyer">👤 ${o.first_name} ${o.last_name || ''} (@${o.buyer_username || 'user'})</div>
        <div class="dispatch-address">📍 ${addrStr}<br>📞 ${addr.phone || 'N/A'}</div>
        <div style="margin-top:8px;font-size:14px;font-weight:900;color:var(--accent);">${State.formatETB(o.total_etb)} — ${o.payment_method.toUpperCase()}</div>
        ${o.rider_name ? `<div style="margin-top:6px;font-size:11px;color:#A78BFA;">🛵 Rider assigned: ${o.rider_name} · ${o.rider_phone}</div>` : ''}
        <div class="dispatch-actions">
          ${o.order_status === 'confirmed' ? `<button class="btn-dispatch" onclick="Modals.openAssignRider('${o.order_id}')">🛵 Assign Rider</button>` : `<button class="btn-dispatch" style="background:rgba(167,139,250,0.2);color:#A78BFA;">In Transit</button>`}
          <button class="btn-call" onclick="window.open('tel:${addr.phone}')">📞 Call Buyer</button>
        </div>
      </div>
    `;
  }
};
