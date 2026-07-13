/* ═══════════════════════════════════════════════════
   CheckoutPage — Full-screen floating checkout
   Step 1: Delivery  |  Step 2: Payment  |  Step 3: Confirm
═══════════════════════════════════════════════════ */

const CheckoutPage = {
  _shopId: null,
  _pkg: null,
  _step: 1,
  _deliveryMethod: 'delivery',
  _paymentMethod: 'telebirr',
  _deliveryFee: 0,
  _geoLocation: null,

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
    overlay.classList.add('co-open');

    this._requestGeo();
    this._renderStep1();
  },

  close() {
    document.getElementById('checkoutOverlay').classList.remove('co-open');
  },

  _requestGeo() {
    if (!navigator.geolocation || this._geoLocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this._geoLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this._renderStep1();
      },
      () => {},
      { timeout: 10000, maximumAge: 300000 }
    );
  },

  _getDetectedSubCity() {
    if (!this._geoLocation) return '';
    const { lat, lng } = this._geoLocation;
    if (lat > 9.00 && lng < 38.74) return 'Bole';
    if (lat > 9.00 && lng >= 38.74) return 'Yeka';
    if (lat <= 9.00 && lat > 8.98 && lng < 38.74) return 'Kirkos';
    if (lat <= 8.98 && lng < 38.73) return 'Lideta';
    if (lat > 9.01 && lng < 38.71) return 'Gulele';
    if (lat <= 8.98 && lng >= 38.73) return 'Nifas Silk';
    return 'Bole';
  },

  _subtotal() {
    return this._pkg.items.reduce((s, i) => s + Number(i.product.price_etb) * i.qty, 0);
  },

  // ═══════════════════════════════════════════════════
  // STEP 1 — Delivery
  // ═══════════════════════════════════════════════════
  _renderStep1() {
    const pkg = this._pkg;
    const sub = this._subtotal();
    const del = this._deliveryMethod === 'pickup' ? 0 : this._deliveryFee;
    const total = sub + del;
    const detected = this._getDetectedSubCity();
    const subcities = ['Bole','Kirkos','Yeka','Lideta','Gulele','Nifas Silk','Addis Ketema','Akaki Kality','Lemi Kura','Kolfe Keranio'];

    document.getElementById('checkoutPage').innerHTML = `
      <div class="co-topbar">
        <button class="co-back" onclick="CheckoutPage.close()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="co-topbar-title">Checkout</div>
        <div style="width:36px;"></div>
      </div>

      <div class="co-progress">
        <div class="co-step active">
          <div class="co-step-circle">1</div>
          <div class="co-step-label">Delivery</div>
        </div>
        <div class="co-step-line"></div>
        <div class="co-step">
          <div class="co-step-circle">2</div>
          <div class="co-step-label">Payment</div>
        </div>
        <div class="co-step-line"></div>
        <div class="co-step">
          <div class="co-step-circle">3</div>
          <div class="co-step-label">Confirm</div>
        </div>
      </div>

      <div class="co-scroll">
        <div class="co-card">
          <div class="co-title">Where should we deliver?</div>

          <div class="co-radio-group">
            <label class="co-radio selected" onclick="CheckoutPage._pickDelivery(this,'delivery')">
              <input type="radio" name="co-del" value="delivery" checked />
              <div class="co-radio-body">
                <div class="co-radio-title">🛵 Deliver to My Address</div>
                <div class="co-radio-desc">Rider brings it to your door</div>
              </div>
              <div class="co-radio-price">${State.formatETB(pkg.deliveryFee)}</div>
            </label>
            <label class="co-radio" onclick="CheckoutPage._pickDelivery(this,'pickup')">
              <input type="radio" name="co-del" value="pickup" />
              <div class="co-radio-body">
                <div class="co-radio-title">🏪 Collect from Store</div>
                <div class="co-radio-desc">Visit the seller's shop</div>
              </div>
              <div class="co-radio-price free">Free</div>
            </label>
          </div>

          <div id="coDeliveryForm"></div>

          <div class="co-summary">
            <div class="co-summary-row"><span>Items (${pkg.items.length})</span><span>${State.formatETB(sub)}</span></div>
            <div class="co-summary-row"><span>Delivery</span><span id="coDelFee">${del > 0 ? State.formatETB(del) : 'Free'}</span></div>
            <div class="co-summary-row total"><span>Total</span><span id="coTotal" style="color:var(--accent);">${State.formatETB(total)}</span></div>
          </div>
        </div>
      </div>

      <div class="co-bottom">
        <button class="co-btn secondary" onclick="CheckoutPage.close()">Cancel</button>
        <button class="co-btn primary" onclick="CheckoutPage._goStep2()">Continue →</button>
      </div>
    `;

    this._renderDeliveryForm();
  },

  _pickDelivery(el, method) {
    document.querySelectorAll('.co-radio-group .co-radio').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    el.querySelector('input').checked = true;
    this._deliveryMethod = method;
    this._deliveryFee = method === 'pickup' ? 0 : (Number(this._pkg.deliveryFee) || 150);

    const sub = this._subtotal();
    const total = sub + (method === 'pickup' ? 0 : this._deliveryFee);
    const delEl = document.getElementById('coDelFee');
    const totalEl = document.getElementById('coTotal');
    if (delEl) delEl.textContent = method === 'pickup' ? 'Free' : State.formatETB(this._deliveryFee);
    if (totalEl) totalEl.textContent = State.formatETB(total);

    this._renderDeliveryForm();
  },

  _renderDeliveryForm() {
    const area = document.getElementById('coDeliveryForm');
    if (!area) return;

    if (this._deliveryMethod === 'pickup') {
      area.innerHTML = `
        <div class="co-card accent-green" style="margin-top:16px;">
          <div class="co-card-title" style="color:var(--success);">🏪 Store Pickup</div>
          <div class="co-card-body">
            <strong>${this._pkg.shopName}</strong><br/>
            ${this._pkg.physicalAddress || 'Contact seller for exact address'}<br/>
            Seller will confirm pickup time via Telegram.
          </div>
        </div>`;
      return;
    }

    const detected = this._getDetectedSubCity();
    const user = State.user || {};

    area.innerHTML = `
      ${this._geoLocation ? `
        <div class="co-card accent-green" style="margin-top:16px;">
          <div class="co-card-title" style="color:var(--success);">📍 Location detected</div>
          <div class="co-card-body">Sub-city auto-filled: <strong>${detected}</strong></div>
        </div>` : `
        <div class="co-card accent-gold" style="margin-top:16px;">
          <div class="co-card-title" style="color:var(--accent);">📍 Allow location for faster checkout</div>
          <div class="co-card-body">We'll auto-fill your sub-city.</div>
        </div>`}

      <div class="co-field">
        <label class="co-label">Sub-City</label>
        <select class="form-select" id="coSubCity" onchange="CheckoutPage._updateAddressPreview()">
          ${subcities.map(s => `<option ${s === detected ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>

      <div class="co-field">
        <label class="co-label">Landmark / House No</label>
        <input class="form-input" id="coLandmark" placeholder="e.g. Near Edna Mall, House 412" oninput="CheckoutPage._updateAddressPreview()" />
      </div>

      <label class="co-check">
        <input type="checkbox" id="coSaveAddress" style="accent-color:var(--accent);" />
        <span>Save this address for future orders</span>
      </label>

      <!-- Live address preview -->
      <div class="co-address-preview" id="coAddressPreview">
        <div class="co-address-preview-title">📍 Delivery Address</div>
        <div class="co-address-preview-detail" id="coAddressDetail">${detected || 'Select sub-city'}</div>
        <div class="co-address-preview-sub">📞 ${user.phone || 'Add phone number'}</div>
      </div>
    `;
  },

  _updateAddressPreview() {
    const subCity = document.getElementById('coSubCity')?.value || '';
    const landmark = document.getElementById('coLandmark')?.value || '';
    const detail = document.getElementById('coAddressDetail');
    if (!detail) return;

    let addr = subCity;
    if (landmark) addr += `, ${landmark}`;
    detail.textContent = addr || 'Select sub-city';
  },

  _goStep2() {
    if (this._deliveryMethod !== 'pickup') {
      const subCity = document.getElementById('coSubCity')?.value;
      if (!subCity) { App.toast('Please select your sub-city', 'error'); return; }
    }
    this._step = 2;
    this._renderStep2();
  },

  // ═══════════════════════════════════════════════════
  // STEP 2 — Payment
  // ═══════════════════════════════════════════════════
  _renderStep2() {
    const pkg = this._pkg;
    const user = State.user || {};

    document.getElementById('checkoutPage').innerHTML = `
      <div class="co-topbar">
        <button class="co-back" onclick="CheckoutPage._goStep1()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="co-topbar-title">Checkout</div>
        <div style="width:36px;"></div>
      </div>

      <div class="co-progress">
        <div class="co-step done">
          <div class="co-step-circle">✓</div>
          <div class="co-step-label">Delivery</div>
        </div>
        <div class="co-step-line active"></div>
        <div class="co-step active">
          <div class="co-step-circle">2</div>
          <div class="co-step-label">Payment</div>
        </div>
        <div class="co-step-line"></div>
        <div class="co-step">
          <div class="co-step-circle">3</div>
          <div class="co-step-label">Confirm</div>
        </div>
      </div>

      <div class="co-scroll">
        <div class="co-card">
          <div class="co-title">How will you pay?</div>

          <div class="co-field">
            <label class="co-label">Phone Number</label>
            <input class="form-input" id="coPhone" type="tel" placeholder="+251 9XX XXX XXX" value="${user.phone || ''}" />
          </div>

          <div class="co-section-label">Payment Method</div>
          <div class="co-pay-grid">
            <button class="co-pay-card ${this._paymentMethod==='telebirr'?'selected':''}" onclick="CheckoutPage._pickPayment(this,'telebirr')">
              <div class="co-pay-logo" style="background:rgba(52,152,219,0.15);color:#3498DB;">T</div>
              <div class="co-pay-name">Telebirr</div>
              <div class="co-pay-sub">Mobile Money</div>
            </button>
            <button class="co-pay-card ${this._paymentMethod==='cbe'?'selected':''}" onclick="CheckoutPage._pickPayment(this,'cbe')">
              <div class="co-pay-logo" style="background:rgba(239,68,68,0.15);color:#EF4444;">C</div>
              <div class="co-pay-name">CBE</div>
              <div class="co-pay-sub">Bank Transfer</div>
            </button>
            <button class="co-pay-card disabled" onclick="App.toast('Coming soon','info')">
              <div class="co-pay-logo" style="background:rgba(128,128,128,0.1);color:#888;">$</div>
              <div class="co-pay-name">Cash</div>
              <div class="co-pay-sub">Pay on Delivery</div>
              <div class="co-pay-badge">Soon</div>
            </button>
            <button class="co-pay-card disabled" onclick="App.toast('Coming soon','info')">
              <div class="co-pay-logo" style="background:rgba(128,128,128,0.1);color:#888;">💳</div>
              <div class="co-pay-name">Card</div>
              <div class="co-pay-sub">Visa / Mastercard</div>
              <div class="co-pay-badge">Soon</div>
            </button>
          </div>

          <div id="coPayDetails"></div>

          <div class="co-field" style="margin-top:16px;">
            <label class="co-label">Coupon Code (optional)</label>
            <input class="form-input" id="coCoupon" placeholder="e.g. SHR1234ABCD" style="font-family:monospace;text-transform:uppercase;" />
          </div>
        </div>
      </div>

      <div class="co-bottom">
        <button class="co-btn secondary" onclick="CheckoutPage._goStep1()">← Back</button>
        <button class="co-btn primary" onclick="CheckoutPage._goStep3()">Review Order →</button>
      </div>
    `;

    this._renderPayDetails();
  },

  _pickPayment(el, method) {
    this._paymentMethod = method;
    document.querySelectorAll('.co-pay-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    this._renderPayDetails();
  },

  _renderPayDetails() {
    const area = document.getElementById('coPayDetails');
    if (!area) return;
    const pkg = this._pkg;

    if (this._paymentMethod === 'telebirr') {
      area.innerHTML = `
        <div class="co-card accent-blue" style="margin-top:16px;">
          <div class="co-card-title" style="color:#3498DB;">📱 Pay via Telebirr</div>
          <div class="co-card-body" style="margin-bottom:8px;">Send payment to the seller's Telebirr account:</div>
          <div style="background:var(--bg-primary);border-radius:8px;padding:12px;margin-bottom:10px;">
            <div class="co-detail-label">Account Name</div>
            <div class="co-detail-value">${pkg.telebirrAccountName || 'Not set'}</div>
            <div class="co-detail-label" style="margin-top:6px;">Number</div>
            <div class="co-detail-value accent">${pkg.telebirrCode || 'Not set'}</div>
          </div>
          <div class="co-field" style="margin-top:10px;margin-bottom:0;">
            <label class="co-label" style="font-size:10px;">Transaction Code (optional)</label>
            <input class="form-input" id="coTxCode" placeholder="Paste Telebirr ref code" />
          </div>
        </div>`;
    } else if (this._paymentMethod === 'cbe') {
      area.innerHTML = `
        <div class="co-card accent-red" style="margin-top:16px;">
          <div class="co-card-title" style="color:#EF4444;">🏦 Pay via CBE</div>
          <div class="co-card-body" style="margin-bottom:8px;">Transfer to the seller's CBE account:</div>
          <div style="background:var(--bg-primary);border-radius:8px;padding:12px;margin-bottom:10px;">
            <div class="co-detail-label">Account Name</div>
            <div class="co-detail-value">${pkg.cbeAccountName || pkg.shopName}</div>
            <div class="co-detail-label" style="margin-top:6px;">Account Number</div>
            <div class="co-detail-value accent">${pkg.cbeAccountNumber || 'Not set'}</div>
          </div>
          <div class="co-field" style="margin-top:10px;margin-bottom:0;">
            <label class="co-label" style="font-size:10px;">Transaction Code (optional)</label>
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

  _goStep1() {
    this._step = 1;
    this._renderStep1();
  },

  _goStep3() {
    if (!this._validateStep2()) return;
    this._step = 3;
    this._renderStep3();
  },

  // ═══════════════════════════════════════════════════
  // STEP 3 — Review & Confirm (stub for now)
  // ═══════════════════════════════════════════════════
  _renderStep3() {
    const pkg = this._pkg;
    const sub = this._subtotal();
    const del = this._deliveryMethod === 'pickup' ? 0 : this._deliveryFee;
    const total = sub + del;
    const subCity = document.getElementById('coSubCity')?.value || '';
    const landmark = document.getElementById('coLandmark')?.value || '';
    const phone = document.getElementById('coPhone')?.value || '';
    const coupon = document.getElementById('coCoupon')?.value || '';

    const payLabels = { telebirr: '📱 Telebirr', cbe: '🏦 CBE', cash: '💵 Cash' };
    const delLabel = this._deliveryMethod === 'pickup' ? '🏪 Store Pickup' : `🛵 ${subCity}`;

    document.getElementById('checkoutPage').innerHTML = `
      <div class="co-topbar">
        <button class="co-back" onclick="CheckoutPage._goStep2()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="co-topbar-title">Checkout</div>
        <div style="width:36px;"></div>
      </div>

      <div class="co-progress">
        <div class="co-step done"><div class="co-step-circle">✓</div><div class="co-step-label">Delivery</div></div>
        <div class="co-step-line active"></div>
        <div class="co-step done"><div class="co-step-circle">✓</div><div class="co-step-label">Payment</div></div>
        <div class="co-step-line active"></div>
        <div class="co-step active"><div class="co-step-circle">3</div><div class="co-step-label">Confirm</div></div>
      </div>

      <div class="co-scroll">
        <div class="co-card">
          <div class="co-title">Review Your Order</div>

          <div class="co-section-label">${pkg.shopName}</div>
          <div class="co-card">
            ${pkg.items.map(i => `
              <div class="co-review-row">
                <span class="co-review-name">${i.product.name} × ${i.qty}</span>
                <span class="co-review-price">${State.formatETB(Number(i.product.price_etb) * i.qty)}</span>
              </div>
            `).join('')}
          </div>

          <div class="co-section-label">Delivery</div>
          <div class="co-card">
            <div class="co-review-row"><span class="co-review-name">${delLabel}</span><span class="co-review-price">${del > 0 ? State.formatETB(del) : 'Free'}</span></div>
            ${landmark ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${landmark}</div>` : ''}
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">📞 ${phone}</div>
          </div>

          <div class="co-section-label">Payment</div>
          <div class="co-card">
            <div class="co-review-row"><span class="co-review-name">${payLabels[this._paymentMethod] || this._paymentMethod}</span></div>
          </div>

          <label class="co-check" style="margin-top:16px;">
            <input type="checkbox" id="coPolicy" style="accent-color:var(--accent);" />
            <span>I agree to <strong>${pkg.shopName}'s ${State.policyLabel(pkg.returnPolicy)}</strong> policy</span>
          </label>

          <div class="co-summary">
            <div class="co-summary-row"><span>Subtotal</span><span>${State.formatETB(sub)}</span></div>
            <div class="co-summary-row"><span>Delivery</span><span>${del > 0 ? State.formatETB(del) : 'Free'}</span></div>
            ${coupon ? `<div class="co-summary-row" style="color:var(--success);"><span>Coupon</span><span>- applied</span></div>` : ''}
            <div class="co-summary-row total"><span>Total</span><span style="color:var(--accent);">${State.formatETB(total)}</span></div>
          </div>
        </div>
      </div>

      <div class="co-bottom">
        <button class="co-btn secondary" onclick="CheckoutPage._goStep2()">← Back</button>
        <button class="co-btn confirm" onclick="CheckoutPage._confirmOrder()">🛒 Confirm & Pay — ${State.formatETB(total)}</button>
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

      if (this._paymentMethod === 'telebirr' || this._paymentMethod === 'cbe') {
        await Api.payments.confirmTx(order.order_id, txCode);
      } else {
        await Api.payments.confirmCash(order.order_id);
      }

      if (saveAddr && subCity && !isPickup) {
        Api.users.addAddress({ label: 'Home', sub_city: subCity, house_number: landmark, phone, is_default: false }).catch(() => {});
      }

      State.clearStoreCart(shopId);
      App.renderNavigation();
      this.close();

      setTimeout(() => {
        Modals.showOrderConfirmed(order.order_ref, order.store?.store_name || pkg.shopName, order.order_id);
        App.refreshOrders();
      }, 300);

    } catch (err) {
      App.toast(err.message || 'Order failed — please try again', 'error');
    }
  }
};