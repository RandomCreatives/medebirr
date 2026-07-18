// Shared notification feed renderer for buyer + seller.
// Single source of truth for how notifications look and which icon each event
// type uses. Pulls icons from the global Icons map so branding stays consistent.
window.NotificationFeed = (function () {
  const META = {
    order_placed:     { icon: () => Icons.cart(18),   color: '#60A5FA', label: 'Order Placed' },
    order_paid:       { icon: () => Icons.wallet(18), color: 'var(--success)', label: 'Payment Confirmed' },
    new_order:        { icon: () => Icons.box(18),    color: '#60A5FA', label: 'New Order' },
    order_dispatched: { icon: () => Icons.truck(18),  color: '#F59E0B', label: 'Order Dispatched' },
    rider_assigned:   { icon: () => Icons.truck(18),  color: '#A78BFA', label: 'Rider Assigned' },
    order_delivered:  { icon: () => Icons.check(18),  color: 'var(--success)', label: 'Order Delivered' },
    order_cancelled:  { icon: () => Icons.trash(18),  color: 'var(--danger)', label: 'Order Cancelled' },
    coupon:           { icon: () => Icons.tag(18),    color: 'var(--accent)', label: 'Coupon' },
    payout:           { icon: () => Icons.wallet(18), color: 'var(--success)', label: 'Payout' },
    message:          { icon: () => Icons.bell(18),   color: '#60A5FA', label: 'Message' }
  };
  const FALLBACK = { icon: () => Icons.bell(18), color: 'var(--text-secondary)', label: 'Notification' };

  function timeAgo(date) {
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  }

  // Derive "delivery ETA" pseudo-notifications from live order state.
  // Vercel serverless can't run cron reliably, so we compute these at view
  // time from dispatch timestamp / status instead of scheduling pushes.
  function deriveEta(rows, role) {
    if (!rows || !rows.length) return [];
    const out = [];
    const now = Date.now();
    for (const o of rows) {
      if (role !== 'seller') continue;
      // Only meaningful for in-transit orders with a known dispatch time
      const dispatched = o.dispatched_at || o.updated_at;
      if (o.order_status === 'dispatched' && dispatched) {
        const dt = new Date(dispatched).getTime();
        const etaMs = 3 * 24 * 60 * 60 * 1000; // ~3 days delivery window
        const remain = dt + etaMs - now;
        if (remain > 0) {
          const days = Math.ceil(remain / 86400000);
          if (days <= 3) {
            out.push({
              type: 'order_dispatched',
              title: days <= 1 ? 'Arriving within 24 hours' : `Arriving in ~${days} days`,
              body: `Order ${o.order_ref} is on its way. Estimated delivery in ${days === 1 ? '1 day' : days + ' days'}.`,
              created_at: dispatched,
              is_read: true,
              derived: true
            });
          }
        } else {
          out.push({
            type: 'order_dispatched',
            title: 'Delivery window ended',
            body: `Order ${o.order_ref} dispatch window passed — confirm delivery with the buyer.`,
            created_at: dispatched,
            is_read: true,
            derived: true
          });
        }
      }
    }
    return out;
  }

  function render(container, items, opts = {}) {
    const onBack = opts.onBack || 'App.backToProfileHub()';
    const title = opts.title || 'Notifications';
    const emptyTitle = opts.emptyTitle || 'No notifications yet';
    const emptyDesc = opts.emptyDesc || '';
    const role = opts.role || 'buyer';

    const list = (items || []).slice().sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at));

    const card = (n) => {
      const meta = META[n.type] || FALLBACK;
      const time = n.created_at ? timeAgo(new Date(n.created_at)) : '';
      return `
        <div class="card notif-card${n.is_read ? ' is-read' : ''}" style="border-left:3px solid ${meta.color};">
          <div style="display:flex;align-items:flex-start;gap:10px;">
            <div class="menu-icon" style="color:${meta.color};">${meta.icon()}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:2px;">${n.title || meta.label}</div>
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.4;">${n.body || ''}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${time}${n.derived ? ' · estimated' : ''}</div>
            </div>
            ${!n.is_read ? '<div class="notif-dot"></div>' : ''}
          </div>
        </div>`;
    };

    container.innerHTML = `
      <div class="subsection-header">
        <button class="subsection-back-btn" onclick="${onBack}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="subsection-title">${title}</span>
      </div>

      ${list.length ? `
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${list.map(card).join('')}
        </div>
      ` : `
        <div style="text-align:center;padding:40px 20px;">
          <div class="menu-icon" style="margin:0 auto 12px;width:48px;height:48px;color:var(--text-muted);">${Icons.bell(24)}</div>
          <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">${emptyTitle}</div>
          <div style="font-size:12px;color:var(--text-secondary);">${emptyDesc}</div>
        </div>
      `}
    `;
  }

  return { render, deriveEta, META };
})();
