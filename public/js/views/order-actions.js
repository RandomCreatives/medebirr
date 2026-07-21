/* ═══════════════════════════════════════════════════
   Order Actions (extracted from app.js)
   Buyer: refreshOrders, confirmDelivery, cancelOrder, settleOrder, openOrderDetail
   Seller: assignRider, confirmCancelOrder, cancelOrderAsSeller
═══════════════════════════════════════════════════ */
(function() {

// ── Buyer: Refresh orders ────────────────────────
App.refreshOrders = async function() {
  try {
    const data = await Api.orders.list();
    State.myOrders = data.orders || [];
  } catch (err) {}
};

// ── Buyer: Confirm delivery ──────────────────────
App.confirmDelivery = async function(orderId) {
  try {
    await Api.orders.confirmDelivery(orderId);
    this.toast('Delivery confirmed! Warranty period started.', 'success');
    await this.refreshOrders();
    this.renderContent();
  } catch (err) {
    this.toast(err.message, 'error');
  }
};

// ── Buyer: Cancel order ──────────────────────────
App.cancelOrder = async function(orderId) {
  if (!confirm('Are you sure you want to cancel this order?')) return;
  try {
    await Api.orders.cancel(orderId);
    this.toast('Order cancelled.', 'success');
    Modals.close();
    await this.refreshOrders();
    this.renderContent();
  } catch (err) {
    this.toast(err.message, 'error');
  }
};

// ── Seller: Settle order ─────────────────────────
App.settleOrder = async function(orderId) {
  if (!confirm('Confirm that delivery has been completed and settled?')) return;
  try {
    const result = await Api.delivery.settle(orderId);
    this.toast(result.message || 'Order settled successfully!', 'success');
    await this.refreshOrders();
    this.renderContent();
  } catch (err) {
    this.toast(err.message || 'Failed to settle order', 'error');
  }
};

// ── Open order detail modal ──────────────────────
App.openOrderDetail = async function(orderId) {
  try {
    const data = await Api.orders.get(orderId);
    const o = data.order;
    const addr = typeof o.delivery_address === 'string' ? JSON.parse(o.delivery_address) : o.delivery_address;
    const addrStr = [addr.sub_city, addr.woreda, addr.house_number, addr.landmark].filter(Boolean).join(', ');
    const policy = typeof o.policy_snapshot === 'string' ? JSON.parse(o.policy_snapshot) : o.policy_snapshot;
    const firstProductId = o.items?.[0]?.product_id || '';
    Modals.open(`
      <div class="modal-handle"></div>
      <div class="modal-title">${o.order_ref}</div>
      <span class="order-status-badge status-${o.order_status}" style="margin-bottom:12px;display:inline-block;">${o.order_status}</span>
      <div class="card" style="margin-bottom:10px;">
        <div class="card-title">📍 Delivery Address</div>
        <div class="card-sub" style="margin-top:4px;">${addrStr}<br>${addr.phone}</div>
      </div>
      ${o.items ? `
      <div class="card" style="margin-bottom:10px;">
        <div class="card-title" style="margin-bottom:10px;">Order Items</div>
        ${o.items.map(i => `<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;"><span>${i.title} x${i.quantity}</span><span style="color:var(--accent);font-weight:700;">${State.formatETB(i.subtotal_etb)}</span></div>`).join('')}
        <div style="border-top:1px solid var(--border);padding-top:8px;display:flex;justify-content:space-between;font-weight:900;">
          <span>Total Paid</span><span style="color:var(--accent);">${State.formatETB(o.total_etb)}</span>
        </div>
      </div>` : ''}
      ${o.rider_name ? `<div class="card" style="margin-bottom:10px;"><div class="card-title">🛵 Rider Details</div><div class="card-sub" style="margin-top:4px;">${o.rider_name} · ${o.rider_phone}</div></div>` : ''}
      ${policy ? `<div class="policy-box">🛡️ ${State.policyLabel(policy.return_policy_type)}: ${policy.custom_policy_text || ''}</div>` : ''}
      ${['pending','confirmed'].includes(o.order_status) ? `<button class="btn-danger" style="margin-top:14px;" onclick="App.cancelOrder('${orderId}')">✕ Cancel Order</button>` : ''}
      ${o.order_status === 'dispatched' ? `
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn-primary" style="flex:1;" onclick="Modals.close();Modals.openShowQR('${orderId}','buyer')">📱 Show My QR</button>
          <button class="btn-primary" style="flex:1;" onclick="Modals.close();Modals.openScanQR('${orderId}','buyer')">📷 Scan Rider</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="btn-secondary" style="flex:1;" onclick="Modals.close();Modals.openOrderReceipt('${orderId}')">📄 Receipt</button>
        </div>
      ` : ''}
      ${o.order_status === 'delivered' ? `<div style="display:flex;gap:8px;margin-top:14px;"><button class="btn-primary" style="flex:1;background:var(--success);" onclick="Modals.close();setTimeout(()=>Modals.showReviewForm('${orderId}','${firstProductId}','${o.store_name}'),100)">⭐ Write a Review</button><button class="btn-secondary" style="flex:1;" onclick="Modals.close();Modals.openOrderReceipt('${orderId}')">📄 Receipt</button></div>` : ''}
      ${o.qr_data && o.order_status === 'dispatched' ? `<div style="margin-top:12px;font-size:12px;color:var(--text-secondary);">Rider: ${o.verified_by_rider ? '✅ Confirmed' : '⏳ Waiting'} · Buyer: ${o.verified_by_buyer ? '✅ Confirmed' : '⏳ Waiting'} · Attempts: ${o.qr_scan_attempts || 0}/5</div>` : ''}
    `);
  } catch (err) {
    this.toast('Could not load order detail', 'error');
  }
};

// ── Seller: Assign rider / dispatch order ────────
App.assignRider = async function(orderId) {
  const provider = (window.__deliveryProvider || 'rider');
  const riderName = document.getElementById('riderName')?.value?.trim();
  const riderPhone = document.getElementById('riderPhone')?.value?.trim();
  const note = document.getElementById('dispatchNote')?.value;

  if (provider === 'rider' && (!riderName || !riderPhone)) {
    this.toast('Rider name and phone are required', 'error');
    return;
  }
  if (provider === 'company' && !riderName) {
    this.toast('Delivery company name is required', 'error');
    return;
  }

  try {
    await Api.orders.dispatch(orderId, {
      delivery_provider: provider,
      rider_name: riderName || null,
      rider_phone: riderPhone || null,
      dispatch_note: note
    });
    const msg = provider === 'self'
      ? 'Self-delivery set! Buyer notified.'
      : provider === 'company'
        ? 'Delivery partner assigned! Buyer notified.'
        : 'Rider assigned! Buyer notified.';
    this.toast(msg, 'success');
    Modals.close();
    const ordersData = await Api.orders.storeOrders(State.currentStoreId, { limit: 200 });
    State.storeOrders = ordersData.orders || [];
    this.renderContent();
  } catch (err) {
    this.toast(err.message || 'Dispatch failed', 'error');
  }
};

// ── Seller: Cancel order confirmation modal ───────
App.confirmCancelOrder = function(orderId, orderRef) {
  Modals.open(`
    <div class="modal-handle"></div>
    <div class="modal-title" style="color:var(--danger);">Cancel Order</div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
      Cancel order <strong style="color:white;">${orderRef}</strong>? The buyer will be notified and any payment will be refunded.
    </p>
    <div class="form-group">
      <label class="form-label">Reason for cancellation</label>
      <textarea class="form-textarea" id="cancelReason" placeholder="e.g. Out of stock, item discontinued..."></textarea>
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn-secondary" style="flex:1;" onclick="Modals.close()">Keep Order</button>
      <button class="btn-danger" style="flex:1;" onclick="App.cancelOrderAsSeller('${orderId}')">Cancel Order</button>
    </div>
  `);
};

// ── Seller: Execute order cancellation ────────────
App.cancelOrderAsSeller = async function(orderId) {
  const reason = document.getElementById('cancelReason')?.value?.trim() || 'Cancelled by seller';
  try {
    await Api.orders.cancelAsSeller(orderId, { reason });
    this.toast('Order cancelled. Buyer notified.', 'success');
    Modals.close();
    const ordersData = await Api.orders.storeOrders(State.currentStoreId, { limit: 200 });
    State.storeOrders = ordersData.orders || [];
    this.renderContent();
  } catch (err) {
    this.toast(err.message || 'Cancel failed', 'error');
  }
};

})();
