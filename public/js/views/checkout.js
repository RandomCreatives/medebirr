/* ═══════════════════════════════════════════════════
   CheckoutPage — Full-screen floating checkout
   Steps: 1) Delivery  2) Payment  3) Review & Pay
══════════════════════════════════════════════════ */

const CheckoutPage = {
  _shopId: null,
  _pkg: null,
  _step: 1,
  _deliveryMethod: 'delivery',
  _paymentMethod: 'telebirr',
  _deliveryFee: 0,
  _geoLocation: null,

  // ── Open checkout ─────────────────────────────────
  open(shopId) {
    const pkg = State.cart[shopId];
    if (!pkg) return;

    this._shopId = shopId;
    this._pkg = pkg;
    this._step = 1;
    this._deliveryMethod = 'delivery';
    this._paymentMethod = pkg.telebirrEnabled ? 'telebirr' : (pkg.cbeEnabled ? 'cbe' : 'cash');
    this._deliveryFee = Number(pkg.deliveryFee) || 150;

    const overlay = document.getElementById('checkoutOverlay');
    overlay.style.display = 'flex';
    overlay.style.animation = 'slideUp 0.3s ease';

    // Request geolocation on first open
    this._requestGeo();

    this._render();
  },

  close() {
    const overlay = document.getElementById('checkoutOverlay');
    overlay.style.animation = 'slideDown 0.25s ease forwards';
    setTimeout(() => { overlay.style.display = 'none'; }, 250);
  },

  // ── Geolocation ───────────────────────────────────
  _requestGeo() {
    if (!navigator.geolocation) return;
    if (this._geoLocation) return; // already have it

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this._geoLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Re-render if on step 1 to show "Detected"
        if (this._step === 1) this._render();
      },
      (err) => {
        console.warn('Geolocation denied:', err.message);
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  },

  _getDetectedSubCity() {
    // Simple Addis Ababa sub-city approximation from lat/lng
    if (!this._geoLocation) return '';
    const { lat, lng } = this._geoLocation;
    // Addis Ababa approximate bounds: lat 8.95-9.05, lng 38.68-38.82
    if (lat > 9.00 && lng < 38.74) return 'Bole';
    if (lat > 9.00 && lng >= 38.74) return 'Yeka';
    if (lat <= 9.00 && lat > 8.98 && lng < 38.74) return 'Kirkos';
    if (lat <= 8.98 && lng < 38.73) return 'Lideta';
    if (lat > 9.01 && lng < 38.71) return 'Gulele';
    if (lat <= 8.98 && lng >= 38.73) return 'Nifas Silk';
    if (lat > 8.97 && lat <= 8.99 && lng >= 38.72 && lng < 38.76) return 'Addis Ketema';
    if (lat <= 8.97 && lng >= 38.70 && lng < 38.74) return 'Akaki Kality';
    return 'Bole'; // default fallback
  },

  // ── Subtotal ──────────────────────────────────────
  _subtotal() {
    return this._pkg.items.reduce((s, i) => s + Number(i.product.price_etb) * i.qty, 0);
  },

  _total() {
    return this._subtotal() + (this._deliveryMethod === 'pickup' ? 0 : this._deliveryFee);
  },

  // ── Render router ─────────────────────────────────
  _render() {
    const page = document.getElementById('checkoutPage');
    if (this._step === 1) this._renderStep1(page);
    else if (this._step === 2) this._renderStep2(page);
    else if (this._step === 3) this._renderStep3(page);
  },

  nextStep() {
    if (this._step === 1 && !this._validateStep1()) return;
    if (this._step === 2 && !this._validateStep2()) return;
    if (this._step < 3) { this._step++; this._render(); }
  },

  prevStep() {
    if (this._step > 1) { this._step--; this._render(); }
  },

  // ── Step 1: Delivery ──────────────────────────────
  _renderStep1(page) {
    const pkg = this._pkg;
    const detected = this._getDetectedSubCity();
    const hasGeo = !!this._geoLocation;

    page.innerHTML = `
      <!-- Step Indicator -->
      <div class="checkout-header">
        <button class="checkout-back" onclick="CheckoutPage.close()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="checkout-steps">
          <div class="checkout-step active"><span>1</span><label>Delivery</label></div>
          <div class="checkout-step-line"></div>
          <div class="checkout-step"><span>2</span><label>Payment</label></div>
          <div class="checkout-step-line"></div>
          <div class="checkout-step"><span>3</span><label>Confirm</label></div>
        </div>
      </div>

      <div class="checkout-body">
        <div class="checkout-section-title">📦 Delivery Method</div>

        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
          <label class="checkout-delivery-opt selected" onclick="CheckoutPage._pickDelivery(this,'delivery')">
            <input type="radio" name="co-delivery" value="delivery" checked />
            <div class="checkout-delivery-info">
              <div class="checkout-delivery-label">🛵 Deliver to My Address</div>
              <div class="checkout-delivery-sub">Rider brings it to your door</div>
            </div>
            <div class="checkout-delivery-price">${State.formatETB(pkg.deliveryFee)}</div>
          </label>
          <label class="checkout-delivery-opt" onclick="CheckoutPage._pickDelivery(this,'pickup')">
            <input type="radio" name="co-delivery" value="pickup" />
            <div class="checkout-delivery-info">
              <div class="checkout-delivery-label">🏪 Collect from Store</div>
              <div class="checkout-delivery-sub">Visit the seller's shop</div>
            </div>
            <div class="checkout-delivery-price" style="color:var(--success);">Free</div>
          </label>
        </div>

        <div id="coDeliveryForm"></div>
      </div>

      <div class="checkout-footer">
        <button class="checkout-btn-cancel" onclick="CheckoutPage.close()">Cancel</button>
        <button class="checkout-btn-next" onclick="CheckoutPage.nextStep()">Continue →</button>
      </div>
    `;

    this._renderDeliveryForm();
  },

  _pickDelivery(el, method) {
    document.querySelectorAll('.checkout-delivery-opt').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    el.querySelector('input').checked = true;
    this._deliveryMethod = method;
    this._deliveryFee = method === 'pickup' ? 0 : (Number(this._pkg.deliveryFee) || 150);
    this._renderDeliveryForm();
  },

  _renderDeliveryForm() {
    const area = document.getElementById('coDeliveryForm');
    if (!area) return;

    if (this._deliveryMethod === 'pickup') {
      area.innerHTML = `
        <div class="checkout-info-card" style="border-left:3px solid var(--success);">
          <div style="font-weight:800;color:var(--success);margin-bottom:4px;">🏪 Store Pickup</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;">
            ${this._pkg.shopName}<br/>
            ${this._pkg.physicalAddress || 'Contact seller for exact address'}<br/>
            Seller will confirm pickup time via Telegram.
          </div>
        </div>`;
      return;
    }

    const detected = this._getDetectedSubCity();
    const subcities = ['Bole','Kirkos','Yeka','Lideta','Gulele','Nifas Silk','Addis Ketema','Akaki Kality','Lemi Kura','Kolfe Keranio'];

    area.innerHTML = `
      <div class="checkout-section-title">📍 Delivery Address</div>

      ${this._geoLocation ? `
        <div class="checkout-info-card" style="border-left:3px solid var(--success);margin-bottom:16px;">
          <div style="font-size:12px;color:var(--success);font-weight:700;">📍 Location detected</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Sub-city auto-filled: <strong style="color:var(--text-primary);">${detected}</strong></div>
        </div>
      ` : `
        <div class="checkout-info-card" style="border-left:3px solid var(--accent);margin-bottom:16px;">
          <div style="font-size:12px;color:var(--accent);font-weight:700;">📍 Allow location for faster checkout</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">We'll auto-fill your sub-city. You can change it below.</div>
        </div>
      `}

      <div style="margin-bottom:12px;">
        <label class="form-label">Sub-City</label>
        <select class="form-select" id="coSubCity">
          ${subcities.map(s => `<option ${s === detected ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>

      <div style="margin-bottom:12px;">
        <label class="form-label">Landmark / House No</label>
        <input class="form-input" id="coLandmark" placeholder="e.g. Near Edna Mall, House 412" />
      </div>

      <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;margin-top:4px;">
        <input type="checkbox" id="coSaveAddress" style="accent-color:var(--accent);"> Save this address for future orders
      </label>
    `;
  },

  _validateStep1() {
    if (this._deliveryMethod === 'pickup') return true;
    const subCity = document.getElementById('coSubCity')?.value;
    if (!subCity) { App.toast('Please select your sub-city', 'error'); return false; }
    return true;
  },

  // ── Step 2: Payment ───────────────────────────────
  _renderStep2(page) {
    const pkg = this._pkg;
    const user = State.user || {};

    page.innerHTML = `
      <div class="checkout-header">
        <button class="checkout-back" onclick="CheckoutPage.prevStep()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="checkout-steps">
          <div class="checkout-step done"><span>✓</span><label>Delivery</label></div>
          <div class="checkout-step-line active"></div>
          <div class="checkout-step active"><span>2</span><label>Payment</label></div>
          <div class="checkout-step-line"></div>
          <div class="checkout-step"><span>3</span><label>Confirm</label></div>
        </div>
      </div>

      <div class="checkout-body">
        <div class="checkout-section-title">📱 Phone Number</div>
        <input class="form-input" id="coPhone" type="tel" placeholder="+251 9XX XXX XXX" value="${user.phone || ''}" style="margin-bottom:20px;" />

        <div class="checkout-section-title">💳 Payment Method</div>
        <div class="checkout-pay-grid">
          <button class="checkout-pay-card ${this._paymentMethod==='telebirr'?'selected':''}" onclick="CheckoutPage._pickPayment('telebirr')">
            <div class="checkout-pay-icon" style="background:rgba(52,152,219,0.15);color:#3498DB;">T</div>
            <div class="checkout-pay-name">Telebirr</div>
            <div class="checkout-pay-sub">Mobile Money</div>
          </button>
          <button class="checkout-pay-card ${this._paymentMethod==='cbe'?'selected':''}" onclick="CheckoutPage._pickPayment('cbe')">
            <div class="checkout-pay-icon" style="background:rgba(239,68,68,0.15);color:#EF4444;">C</div>
            <div class="checkout-pay-name">CBE</div>
            <div class="checkout-pay-sub">Bank Transfer</div>
          </button>
          <button class="checkout-pay-card disabled" onclick="App.toast('Coming soon','info')">
            <div class="checkout-pay-icon" style="background:rgba(128,128,128,0.1);color:#888;">$</div>
            <div class="checkout-pay-name">Cash</div>
            <div class="checkout-pay-sub">Pay on Delivery</div>
            <div class="checkout-pay-soon">Coming Soon</div>
          </button>
          <button class="checkout-pay-card disabled" onclick="App.toast('Coming soon','info')">
            <div class="checkout-pay-icon" style="background:rgba(128,128,128,0.1);color:#888;">💳</div>
            <div class="checkout-pay-name">Card</div>
            <div class="checkout-pay-sub">Visa / Mastercard</div>
            <div class="checkout-pay-soon">Coming Soon</div>
          </button>
        </div>

        <div id="coPayDetails"></div>

        <div style="margin-top:16px;">
          <label style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;display:block;">Have a coupon code?</label>
          <input class="form-input" id="coCoupon" placeholder="e.g. SHR1234ABCD" style="font-family:monospace;text-transform:uppercase;" />
        </div>
      </div>

      <div class="checkout-footer">
        <button class="checkout-btn-cancel" onclick="CheckoutPage.prevStep()">← Back</button>
        <button class="checkout-btn-next" onclick="CheckoutPage.nextStep()">Review Order →</button>
      </div>
    `;

    this._renderPayDetails();
  },

  _pickPayment(method) {
    this._paymentMethod = method;
    document.querySelectorAll('.checkout-pay-card').forEach(c => c.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    this._renderPayDetails();
  },

  _renderPayDetails() {
    const area = document.getElementById('coPayDetails');
    if (!area) return;
    const pkg = this._pkg;

    if (this._paymentMethod === 'telebirr') {
      area.innerHTML = `
        <div class="checkout-info-card" style="border-left:3px solid #3498DB;margin-top:16px;">
          <div style="font-weight:800;color:#3498DB;margin-bottom:6px;">📱 Pay via Telebirr</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">Send payment to the seller's Telebirr account:</div>
          <div style="background:var(--bg-primary);border-radius:8px;padding:10px;">
            <div style="font-size:10px;color:var(--text-muted);">Account Name</div>
            <div style="font-size:14px;font-weight:900;">${pkg.telebirrAccountName || 'Not set'}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Number</div>
            <div style="font-size:16px;font-weight:900;color:var(--accent);letter-spacing:1px;">${pkg.telebirrCode || 'Not set'}</div>
          </div>
          <div style="margin-top:10px;">
            <label class="form-label" style="font-size:10px;">Transaction Code (optional)</label>
            <input class="form-input" id="coTxCode" placeholder="Paste Telebirr ref code" />
          </div>
        </div>`;
    } else if (this._paymentMethod === 'cbe') {
      area.innerHTML = `
        <div class="checkout-info-card" style="border-left:3px solid #EF4444;margin-top:16px;">
          <div style="font-weight:800;color:#EF4444;margin-bottom:6px;">🏦 Pay via CBE</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">Transfer to the seller's CBE account:</div>
          <div style="background:var(--bg-primary);border-radius:8px;padding:10px;">
            <div style="font-size:10px;color:var(--text-muted);">Account Name</div>
            <div style="font-size:14px;font-weight:900;">${pkg.cbeAccountName || pkg.shopName}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Account Number</div>
            <div style="font-size:16px;font-weight:900;color:var(--accent);letter-spacing:1px;">${pkg.cbeAccountNumber || 'Not set'}</div>
          </div>
          <div style="margin-top:10px;">
            <label class="form-label" style="font-size:10px;">Transaction Code (optional)</label>
            <input class="form-input" id="coTxCode" placeholder="Paste CBE ref code" />
          </div>
        </div>`;
    } else {
      area.innerHTML = '';
    }
  },

  _validateStep2() {
    const phone = document.getElementById('coPhone')?.value?.trim();
    if (!phone) { App.toast('Please enter your phone number', 'error'); return false; }
    return true;
  },

  // ── Step 3: Review & Confirm ──────────────────────
  _renderStep3(page) {
    const pkg = this._pkg;
    const sub = this._subtotal();
    const del = this._deliveryMethod === 'pickup' ? 0 : this._deliveryFee;
    const total = sub + del;
    const subCity = document.getElementById('coSubCity')?.value || '';
    const landmark = document.getElementById('coLandmark')?.value || '';
    const phone = document.getElementById('coPhone')?.value || '';
    const coupon = document.getElementById('coCoupon')?.value || '';

    const payLabels = { telebirr: '📱 Telebirr', cbe: '🏦 CBE', cash: '💵 Cash on Delivery' };
    const delLabel = this._deliveryMethod === 'pickup' ? '🏪 Store Pickup' : `🛵 Delivery to ${subCity}`;

    page.innerHTML = `
      <div class="checkout-header">
        <button class="checkout-back" onclick="CheckoutPage.prevStep()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="checkout-steps">
          <div class="checkout-step done"><span>✓</span><label>Delivery</label></div>
          <div class="checkout-step-line active"></div>
          <div class="checkout-step done"><span>✓</span><label>Payment</label></div>
          <div class="checkout-step-line active"></div>
          <div class="checkout-step active"><span>3</span><label>Confirm</label></div>
        </div>
      </div>

      <div class="checkout-body">
        <div class="checkout-section-title">📋 Order Review</div>

        <!-- Items -->
        <div class="checkout-review-card">
          <div style="font-weight:800;font-size:13px;margin-bottom:8px;">${pkg.shopName}</div>
          ${pkg.items.map(i => `
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
              <span style="color:var(--text-secondary);">${i.product.name} × ${i.qty}</span>
              <span style="font-weight:700;">${State.formatETB(Number(i.product.price_etb) * i.qty)}</span>
            </div>
          `).join('')}
        </div>

        <!-- Delivery -->
        <div class="checkout-review-card">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span style="color:var(--text-secondary);">📍 Delivery</span>
            <span style="font-weight:700;">${delLabel}</span>
          </div>
          ${landmark ? `<div style="font-size:11px;color:var(--text-muted);">Landmark: ${landmark}</div>` : ''}
          <div style="font-size:11px;color:var(--text-muted);">📞 ${phone}</div>
        </div>

        <!-- Payment -->
        <div class="checkout-review-card">
          <div style="display:flex;justify-content:space-between;font-size:12px;">
            <span style="color:var(--text-secondary);">💳 Payment</span>
            <span style="font-weight:700;">${payLabels[this._paymentMethod] || this._paymentMethod}</span>
          </div>
        </div>

        <!-- Policy -->
        <label class="checkout-policy-check">
          <input type="checkbox" id="coPolicy" style="accent-color:var(--accent);" />
          <span style="font-size:12px;color:var(--text-secondary);">I agree to <strong style="color:var(--text-primary);">${pkg.shopName}'s ${State.policyLabel(pkg.returnPolicy)}</strong> policy</span>
        </label>

        <!-- Totals -->
        <div class="checkout-totals">
          <div class="checkout-total-row"><span>Subtotal</span><span>${State.formatETB(sub)}</span></div>
          <div class="checkout-total-row"><span>Delivery</span><span>${del > 0 ? State.formatETB(del) : 'Free'}</span></div>
          ${coupon ? `<div class="checkout-total-row" style="color:var(--success);"><span>Coupon</span><span>- applied</span></div>` : ''}
          <div class="checkout-total-row total"><span>Total</span><span style="color:var(--accent);">${State.formatETB(total)}</span></div>
        </div>
      </div>

      <div class="checkout-footer">
        <button class="checkout-btn-cancel" onclick="CheckoutPage.prevStep()">← Back</button>
        <button class="checkout-btn-confirm" onclick="CheckoutPage._confirmOrder()">
          🛒 Confirm & Pay — ${State.formatETB(total)}
        </button>
      </div>
    `;
  },

  // ── Confirm Order ─────────────────────────────────
  async _confirmOrder() {
    const policyChecked = document.getElementById('coPolicy')?.checked;
    if (!policyChecked) { App.toast('Please agree to the store policy', 'error'); return; }

    const pkg = this._pkg;
    const shopId = this._shopId;
    const phone = document.getElementById('coPhone')?.value?.trim() || '';
    const subCity = document.getElementById('coSubCity')?.value || '';
    const landmark = document.getElementById('coLandmark')?.value || '';
    const couponCode = document.getElementById('coCoupon')?.value?.trim() || '';
    const txCode = document.getElementById('coTxCode')?.value?.trim() || `TXN-${Date.now()}`;
    const saveAddr = document.getElementById('coSaveAddress')?.checked;

    const isPickup = this._deliveryMethod === 'pickup';
    const deliveryAddress = isPickup
      ? { sub_city: pkg.location || 'Store', house_number: 'Customer collects', phone }
      : { sub_city: subCity, house_number: landmark, phone };

    const items = pkg.items.map(i => ({ product_id: i.product.product_id, quantity: i.qty }));

    try {
      App.toast('Placing order...', 'info');

      const orderData = await Api.orders.create({
        store_id: shopId,
        items,
        delivery_address: deliveryAddress,
        delivery_method: isPickup ? 'pickup' : 'delivery',
        payment_method: this._paymentMethod,
        ...(couponCode ? { coupon_code: couponCode } : {})
      });

      const order = orderData.order;

      // Confirm payment for telebirr/cbe
      if (this._paymentMethod === 'telebirr' || this._paymentMethod === 'cbe') {
        await Api.payments.confirmTx(order.order_id, txCode);
      } else {
        await Api.payments.confirmCash(order.order_id);
      }

      // Save address if requested
      if (saveAddr && subCity && !isPickup) {
        Api.users.addAddress({ label: 'Home', sub_city: subCity, house_number: landmark, phone, is_default: false }).catch(() => {});
      }

      State.clearStoreCart(shopId);
      App.renderNavigation();
      this.close();

      // Show confirmation
      setTimeout(() => {
        Modals.showOrderConfirmed(order.order_ref, order.store?.store_name || pkg.shopName, order.order_id);
        App.refreshOrders();
      }, 300);

    } catch (err) {
      App.toast(err.message || 'Order failed — please try again', 'error');
    }
  }
};
