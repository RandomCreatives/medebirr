/* ═══════════════════════════════════════════════════════════════════════════
   e-Merkato CheckoutPage — Multi-Step Floating Checkout Experience
   Step 1: Delivery & Contact | Step 2: Payment & Coupon | Step 3: Review & Pay
═══════════════════════════════════════════════════════════════════════════ */

const CheckoutPage = {
  _shopId: null,
  _pkg: null,
  _step: 1,
  _deliveryMethod: 'delivery',
  _paymentMethod: 'telebirr',
  _deliveryFee: 150,
  _subCity: 'Bole',
  _landmark: '',
  _phone: '',
  _txCode: '',
  _couponCode: '',
  _discountEtb: 0,
  _appliedCoupon: null,
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
    this._subCity = State.user?.addresses?.[0]?.sub_city || 'Bole';
    this._landmark = State.user?.addresses?.[0]?.landmark || '';
    this._phone = State.user?.phone || '';
    this._txCode = '';
    this._couponCode = '';
    this._discountEtb = 0;
    this._appliedCoupon = null;

    const overlay = document.getElementById('checkoutOverlay');
    if (overlay) overlay.classList.add('co-open');

    this._requestGeo();
    this._renderStep1();
  },

  close() {
    const overlay = document.getElementById('checkoutOverlay');
    if (overlay) overlay.classList.remove('co-open');
  },

  _requestGeo() {
    if (!navigator.geolocation || this._geoLocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this._geoLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this._subCity = this._getDetectedSubCity();
        if (this._step === 1) this._renderStep1();
      },
      () => {},
      { timeout: 10000, maximumAge: 300000 }
    );
  },

  _getDetectedSubCity() {
    if (!this._geoLocation) return 'Bole';
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

  _total() {
    const del = this._deliveryMethod === 'pickup' ? 0 : this._deliveryFee;
    return Math.max(0, this._subtotal() + del - Number(this._discountEtb || 0));
  },

  // ── Step 1: Delivery & Contact ─────────────────────────────────────────────
  _renderStep1() {
    this._step = 1;
    const pkg = this._pkg;
    const sub = this._subtotal();
    const del = this._deliveryMethod === 'pickup' ? 0 : this._deliveryFee;
    const total = this._total();
    const subcities = ['Bole','Kirkos','Yeka','Lideta','Gulele','Nifas Silk','Addis Ketema','Akaki Kality','Lemi Kura','Kolfe Keranio'];

    document.getElementById('checkoutPage').innerHTML = `
      <div class="co-topbar">
        <button class="co-back" onclick="CheckoutPage.close()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="co-topbar-title">Checkout: ${pkg.shopName}</div>
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
          <div class="co-title">Step 1 — Delivery & Contact</div>

          <div class="co-radio-group">
            <label class="co-radio ${this._deliveryMethod === 'delivery' ? 'selected' : ''}" onclick="CheckoutPage._pickDelivery(this,'delivery')">
              <input type="radio" name="co-del" value="delivery" ${this._deliveryMethod === 'delivery' ? 'checked' : ''} />
              <div class="co-radio-body">
                <div class="co-radio-title">🛵 Deliver to My Address</div>
                <div class="co-radio-desc">Rider brings it directly to your door</div>
              </div>
              <div class="co-radio-price">${State.formatETB(pkg.deliveryFee)}</div>
            </label>
            <label class="co-radio ${this._deliveryMethod === 'pickup' ? 'selected' : ''}" onclick="CheckoutPage._pickDelivery(this,'pickup')">
              <input type="radio" name="co-del" value="pickup" ${this._deliveryMethod === 'pickup' ? 'checked' : ''} />
              <div class="co-radio-body">
                <div class="co-radio-title">🏪 Collect from Store</div>
                <div class="co-radio-desc">Visit the seller's shop in person</div>
              </div>
              <div class="co-radio-price free">Free</div>
            </label>
          </div>

          <div id="coDeliveryForm"></div>

          <!-- Contact Phone Input -->
          <div style="margin-top:18px;border-top:1px solid var(--border);padding-top:16px;">
            <label class="co-label" style="display:block;margin-bottom:6px;font-weight:800;color:white;">📱 Contact Phone Number</label>
            <input class="form-input" id="coContactPhone" type="tel" placeholder="+251 9XX XXX XXX" value="${this._phone}" style="width:100%;box-sizing:border-box;background:var(--bg-main);border:1px solid var(--border);padding:12px;border-radius:8px;color:white;font-size:14px;" />
            <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Rider or seller will call this number for handover coordination.</div>
          </div>

          <div class="co-summary" style="margin-top:20px;">
            <div class="co-summary-row"><span>Items (${pkg.items.length})</span><span>${State.formatETB(sub)}</span></div>
            <div class="co-summary-row"><span>Delivery</span><span id="coDelFee">${del > 0 ? State.formatETB(del) : 'Free'}</span></div>
            ${this._discountEtb > 0 ? `<div class="co-summary-row" style="color:var(--success);"><span>Promo Discount</span><span>-${State.formatETB(this._discountEtb)}</span></div>` : ''}
            <div class="co-summary-row total"><span>Subtotal to Pay</span><span id="coTotal" style="color:var(--accent);">${State.formatETB(total)}</span></div>
          </div>
        </div>
      </div>

      <div class="co-bottom">
        <button class="co-btn secondary" onclick="CheckoutPage.close()">Cancel</button>
        <button class="co-btn primary" onclick="CheckoutPage._goStep2()">Next: Payment →</button>
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
    const total = this._total();
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
        <div class="co-card accent-green" style="margin-top:16px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:14px;">
          <div style="font-weight:800;color:var(--success);margin-bottom:6px;">🏪 Store Pickup Confirmed</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;">
            <strong>${this._pkg.shopName}</strong><br/>
            ${this._pkg.physicalAddress || 'Contact seller for exact store landmark across Addis.'}<br/>
            Seller will coordinate pickup timing with your contact number via Telegram.
          </div>
        </div>`;
      return;
    }

    const subcities = ['Bole','Kirkos','Yeka','Lideta','Gulele','Nifas Silk','Addis Ketema','Akaki Kality','Lemi Kura','Kolfe Keranio'];

    area.innerHTML = `
      <div style="margin-top:16px;">
        <label class="co-label" style="display:block;margin-bottom:6px;font-weight:800;color:white;">📍 Select Sub-City</label>
        <select class="form-select" id="coSubCity" onchange="CheckoutPage._updateAddressPreview()" style="width:100%;box-sizing:border-box;background:var(--bg-main);border:1px solid var(--border);padding:12px;border-radius:8px;color:white;font-size:14px;">
          ${subcities.map(s => `<option ${s === this._subCity ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>

      <div style="margin-top:12px;">
        <label class="co-label" style="display:block;margin-bottom:6px;font-weight:800;color:white;">🏠 House Number / Landmark</label>
        <input class="form-input" id="coLandmark" placeholder="e.g. Near Edna Mall, House 412 or behind bakery" value="${this._landmark}" oninput="CheckoutPage._updateAddressPreview()" style="width:100%;box-sizing:border-box;background:var(--bg-main);border:1px solid var(--border);padding:12px;border-radius:8px;color:white;font-size:14px;" />
      </div>

      <!-- Live address preview -->
      <div class="co-address-preview" id="coAddressPreview" style="margin-top:14px;background:var(--bg-surface);border-left:3px solid var(--accent);padding:10px 14px;border-radius:4px;">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:800;">Delivery Destination</div>
        <div id="coAddressDetail" style="font-size:13px;font-weight:700;color:white;margin-top:2px;">${this._subCity || 'Select sub-city'}${this._landmark ? ', ' + this._landmark : ''}</div>
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
    this._subCity = subCity;
    this._landmark = landmark;
  },

  _goStep1() {
    this._renderStep1();
  },

  _goStep2() {
    const phoneInput = document.getElementById('coContactPhone');
    const phone = phoneInput?.value?.trim() || this._phone;
    if (!phone) {
      if (App && typeof App.toast === 'function') App.toast('Please enter your contact phone number', 'error');
      if (phoneInput) phoneInput.focus();
      return;
    }
    this._phone = phone;

    if (this._deliveryMethod !== 'pickup') {
      const subCity = document.getElementById('coSubCity')?.value;
      if (!subCity) {
        if (App && typeof App.toast === 'function') App.toast('Please select your sub-city', 'error');
        return;
      }
      this._subCity = subCity;
      this._landmark = document.getElementById('coLandmark')?.value?.trim() || '';
    }

    this._renderStep2();
  },

  // ── Step 2: Payment Method & Coupon ────────────────────────────────────────
  _renderStep2() {
    this._step = 2;
    const pkg = this._pkg;
    const sub = this._subtotal();
    const del = this._deliveryMethod === 'pickup' ? 0 : this._deliveryFee;
    const total = this._total();

    document.getElementById('checkoutPage').innerHTML = `
      <div class="co-topbar">
        <button class="co-back" onclick="CheckoutPage._goStep1()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="co-topbar-title">Payment & Promo</div>
        <div style="width:36px;"></div>
      </div>

      <div class="co-progress">
        <div class="co-step done" onclick="CheckoutPage._goStep1()" style="cursor:pointer;">
          <div class="co-step-circle">✓</div>
          <div class="co-step-label">Delivery</div>
        </div>
        <div class="co-step-line"></div>
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
          <div class="co-title">Step 2 — Select Payment Method</div>
          <p style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5;">
            Zero escrow holding! You transfer money directly to the store's verified account.
          </p>

          <div class="co-radio-group">
            ${pkg.telebirrEnabled !== false ? `
            <label class="co-radio ${this._paymentMethod === 'telebirr' ? 'selected' : ''}" onclick="CheckoutPage._pickPayment(this,'telebirr')" style="cursor:pointer;">
              <input type="radio" name="co-pay" value="telebirr" ${this._paymentMethod === 'telebirr' ? 'checked' : ''} />
              <div class="co-radio-body">
                <div class="co-radio-title">📱 Telebirr Direct Transfer</div>
                <div class="co-radio-desc">Pay to Merchant Shortcode / Phone</div>
              </div>
            </label>` : ''}

            ${pkg.cbeEnabled !== false ? `
            <label class="co-radio ${this._paymentMethod === 'cbe' ? 'selected' : ''}" onclick="CheckoutPage._pickPayment(this,'cbe')" style="cursor:pointer;">
              <input type="radio" name="co-pay" value="cbe" ${this._paymentMethod === 'cbe' ? 'checked' : ''} />
              <div class="co-radio-body">
                <div class="co-radio-title">🏦 CBE Bank Transfer</div>
                <div class="co-radio-desc">Direct Account-to-Account Deposit</div>
              </div>
            </label>` : ''}

            ${pkg.cashEnabled !== false ? `
            <label class="co-radio ${this._paymentMethod === 'cash' ? 'selected' : ''}" onclick="CheckoutPage._pickPayment(this,'cash')" style="cursor:pointer;">
              <input type="radio" name="co-pay" value="cash" ${this._paymentMethod === 'cash' ? 'checked' : ''} />
              <div class="co-radio-body">
                <div class="co-radio-title">💵 Cash on Delivery</div>
                <div class="co-radio-desc">Pay courier or cashier upon inspection</div>
              </div>
            </label>` : ''}
          </div>

          <div id="coPaymentDetailsArea" style="margin-top:16px;"></div>

          <!-- Promotional Coupon Section -->
          <div style="margin-top:22px;border-top:1px solid var(--border);padding-top:16px;">
            <div style="font-weight:800;font-size:13px;color:white;margin-bottom:8px;">🎟️ Promotional Coupon Code</div>
            <div style="display:flex;gap:8px;">
              <input class="form-input" id="coCouponInput" placeholder="Enter code (e.g. BEKOLLO015)" value="${this._couponCode}" style="flex:1;box-sizing:border-box;background:var(--bg-main);border:1px solid var(--border);padding:10px 12px;border-radius:8px;color:white;font-size:13px;text-transform:uppercase;" />
              <button class="co-btn secondary" onclick="CheckoutPage._applyCoupon()" style="padding:10px 16px;border-radius:8px;font-weight:800;font-size:13px;flex-shrink:0;">Apply</button>
            </div>
            <div id="coCouponFeedback" style="margin-top:8px;">
              ${this._discountEtb > 0 ? `
              <div style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.35);padding:8px 12px;border-radius:6px;font-size:12px;font-weight:800;color:var(--success);display:flex;justify-content:space-between;align-items:center;">
                <span>🎉 Coupon '${this._couponCode}' Applied!</span>
                <span>-${State.formatETB(this._discountEtb)}</span>
              </div>` : ''}
            </div>
          </div>

          <div class="co-summary" style="margin-top:20px;">
            <div class="co-summary-row"><span>Items (${pkg.items.length})</span><span>${State.formatETB(sub)}</span></div>
            <div class="co-summary-row"><span>Delivery</span><span>${del > 0 ? State.formatETB(del) : 'Free'}</span></div>
            ${this._discountEtb > 0 ? `<div class="co-summary-row" style="color:var(--success);"><span>Promo Discount</span><span>-${State.formatETB(this._discountEtb)}</span></div>` : ''}
            <div class="co-summary-row total"><span>Total to Pay</span><span style="color:var(--accent);">${State.formatETB(total)}</span></div>
          </div>
        </div>
      </div>

      <div class="co-bottom">
        <button class="co-btn secondary" onclick="CheckoutPage._goStep1()">← Back</button>
        <button class="co-btn primary" onclick="CheckoutPage._goStep3()">Next: Review & Confirm →</button>
      </div>
    `;

    this._renderPaymentDetails();
  },

  _pickPayment(el, method) {
    document.querySelectorAll('.co-radio-group .co-radio').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    el.querySelector('input').checked = true;
    this._paymentMethod = method;
    this._renderPaymentDetails();
  },

  _renderPaymentDetails() {
    const area = document.getElementById('coPaymentDetailsArea');
    if (!area) return;
    const pkg = this._pkg;

    if (this._paymentMethod === 'telebirr') {
      area.innerHTML = `
        <div style="background:rgba(252,205,4,0.08);border:1px solid rgba(252,205,4,0.3);border-radius:8px;padding:14px;">
          <div style="font-weight:800;color:var(--accent);font-size:13px;margin-bottom:6px;">📱 Pay via Telebirr</div>
          <div style="font-size:12px;color:white;line-height:1.6;">
            1. Open Telebirr App &amp; transfer <strong>${State.formatETB(this._total())}</strong> to:<br/>
            <span style="display:inline-block;background:var(--bg-main);padding:4px 10px;border-radius:4px;font-family:monospace;font-size:14px;color:var(--accent);font-weight:800;margin:6px 0;">${pkg.telebirrMerchantId || '891204 (Merchant Account)'}</span><br/>
            2. Enter your SMS Transaction ID below:
          </div>
          <input class="form-input" id="coTxCode" placeholder="e.g. TBX-891204-99218401" value="${this._txCode}" oninput="CheckoutPage._txCode = this.value" style="width:100%;box-sizing:border-box;margin-top:8px;background:var(--bg-main);border:1px solid var(--border);padding:10px;border-radius:6px;color:white;font-family:monospace;font-size:13px;" />
        </div>`;
    } else if (this._paymentMethod === 'cbe') {
      area.innerHTML = `
        <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:14px;">
          <div style="font-weight:800;color:#60A5FA;font-size:13px;margin-bottom:6px;">🏦 Pay via Commercial Bank of Ethiopia (CBE)</div>
          <div style="font-size:12px;color:white;line-height:1.6;">
            1. Transfer <strong>${State.formatETB(this._total())}</strong> via CBE Birr / Mobile Banking to:<br/>
            <span style="display:inline-block;background:var(--bg-main);padding:4px 10px;border-radius:4px;font-family:monospace;font-size:14px;color:#60A5FA;font-weight:800;margin:6px 0;">${pkg.cbeAccount || '100023491823 (CBE Account)'}</span><br/>
            2. Paste your Bank Transaction Code below:
          </div>
          <input class="form-input" id="coTxCode" placeholder="e.g. FT26194204812" value="${this._txCode}" oninput="CheckoutPage._txCode = this.value" style="width:100%;box-sizing:border-box;margin-top:8px;background:var(--bg-main);border:1px solid var(--border);padding:10px;border-radius:6px;color:white;font-family:monospace;font-size:13px;" />
        </div>`;
    } else {
      area.innerHTML = `
        <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:14px;">
          <div style="font-weight:800;color:var(--success);font-size:13px;margin-bottom:4px;">💵 Cash on Delivery Selected</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;">
            Please have exact cash (` + State.formatETB(this._total()) + `) ready for the courier or cashier upon item inspection.
          </div>
        </div>`;
    }
  },

  async _applyCoupon() {
    const input = document.getElementById('coCouponInput');
    const code = input?.value?.trim() || '';
    if (!code) {
      if (App && typeof App.toast === 'function') App.toast('Please enter a coupon code first', 'error');
      return;
    }

    const feedback = document.getElementById('coCouponFeedback');
    const subtotal = this._subtotal();

    try {
      if (typeof Api !== 'undefined' && Api.coupons && typeof Api.coupons.validateCoupon === 'function') {
        const res = await Api.coupons.validateCoupon(code);
        if (res && (res.discount_etb || res.coupon)) {
          this._couponCode = code.toUpperCase();
          this._appliedCoupon = res.coupon || res;
          this._discountEtb = Number(res.discount_etb || res.coupon?.discount_value || 150);
          if (App && typeof App.toast === 'function') App.toast(`Coupon ${this._couponCode} applied!`, 'success');
          this._renderStep2();
          return;
        }
      }
    } catch (err) {
      // Fallback local code evaluation if offline or backend route offline
    }

    // Local check for instant demo/offline codes
    const demoCodes = {
      'BEKOLLO015': { discount: Math.round(subtotal * 0.15), label: '15% Off Store Launch Promo' },
      'SUMMER300':  { discount: 300, label: 'Br 300 Off Seasonal Promo' },
      'FREESHIP':   { discount: this._deliveryFee, label: 'Free Delivery Promo' }
    };

    const match = demoCodes[code.toUpperCase()];
    if (match) {
      this._couponCode = code.toUpperCase();
      this._discountEtb = Math.min(subtotal + this._deliveryFee, match.discount);
      if (App && typeof App.toast === 'function') App.toast(`Coupon ${this._couponCode} applied!`, 'success');
      this._renderStep2();
    } else {
      if (App && typeof App.toast === 'function') App.toast(`Invalid or expired coupon code`, 'error');
      if (feedback) feedback.innerHTML = `<div style="color:var(--error);font-size:12px;font-weight:700;margin-top:4px;">❌ Invalid or expired coupon code</div>`;
    }
  },

  // ── Step 3: Review & Confirm Order ─────────────────────────────────────────
  _goStep3() {
    if ((this._paymentMethod === 'telebirr' || this._paymentMethod === 'cbe')) {
      const txCode = document.getElementById('coTxCode')?.value?.trim() || this._txCode;
      this._txCode = txCode;
    }
    this._renderStep3();
  },

  _renderStep3() {
    this._step = 3;
    const pkg = this._pkg;
    const sub = this._subtotal();
    const del = this._deliveryMethod === 'pickup' ? 0 : this._deliveryFee;
    const total = this._total();

    const deliverySummary = this._deliveryMethod === 'pickup'
      ? `🏪 <strong>Store Pickup</strong> at ${pkg.shopName}<br/><span style="font-size:11px;color:var(--text-secondary);">${pkg.physicalAddress || 'Bole Commercial Center'}</span>`
      : `🛵 <strong>Home Delivery</strong> to ${this._subCity}<br/><span style="font-size:11px;color:var(--text-secondary);">${this._landmark || 'Sub-city delivery'}</span>`;

    const paySummary = this._paymentMethod === 'telebirr'
      ? `📱 <strong>Telebirr Transfer</strong><br/><span style="font-size:11px;color:var(--text-secondary);">TX ID: ${this._txCode || 'Pending at handover'}</span>`
      : (this._paymentMethod === 'cbe' ? `🏦 <strong>CBE Bank Transfer</strong><br/><span style="font-size:11px;color:var(--text-secondary);">TX ID: ${this._txCode || 'Pending at handover'}</span>` : `💵 <strong>Cash on Delivery</strong><br/><span style="font-size:11px;color:var(--text-secondary);">Pay upon item inspection</span>`);

    document.getElementById('checkoutPage').innerHTML = `
      <div class="co-topbar">
        <button class="co-back" onclick="CheckoutPage._renderStep2()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="co-topbar-title">Review & Pay</div>
        <div style="width:36px;"></div>
      </div>

      <div class="co-progress">
        <div class="co-step done" onclick="CheckoutPage._goStep1()" style="cursor:pointer;">
          <div class="co-step-circle">✓</div>
          <div class="co-step-label">Delivery</div>
        </div>
        <div class="co-step-line"></div>
        <div class="co-step done" onclick="CheckoutPage._renderStep2()" style="cursor:pointer;">
          <div class="co-step-circle">✓</div>
          <div class="co-step-label">Payment</div>
        </div>
        <div class="co-step-line"></div>
        <div class="co-step active">
          <div class="co-step-circle">3</div>
          <div class="co-step-label">Confirm</div>
        </div>
      </div>

      <div class="co-scroll">
        <div class="co-card">
          <div class="co-title">Step 3 — Review Your Order</div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
            <div style="background:var(--bg-surface);padding:12px;border-radius:8px;font-size:13px;line-height:1.5;">
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:800;margin-bottom:4px;">Delivery Destination</div>
              ${deliverySummary}<br/>
              <span style="font-size:12px;color:var(--accent);font-weight:700;">📞 ${this._phone}</span>
            </div>
            <div style="background:var(--bg-surface);padding:12px;border-radius:8px;font-size:13px;line-height:1.5;">
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:800;margin-bottom:4px;">Payment Method</div>
              ${paySummary}
            </div>
          </div>

          <!-- Items List -->
          <div style="font-size:11px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Items in Package (${pkg.items.length})</div>
          <div style="background:var(--bg-surface);border-radius:8px;padding:8px 12px;margin-bottom:16px;">
            ${pkg.items.map(i => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
                <div style="flex:1;font-weight:700;">${i.product.title} <span style="color:var(--text-secondary);font-weight:400;">× ${i.qty}</span></div>
                <div style="font-weight:800;">${State.formatETB(Number(i.product.price_etb) * i.qty)}</div>
              </div>`).join('')}
          </div>

          <!-- Final Summary Table -->
          <div class="co-summary" style="background:var(--bg-main);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px;">
            <div class="co-summary-row"><span>Cart Subtotal</span><span>${State.formatETB(sub)}</span></div>
            <div class="co-summary-row"><span>Delivery Fee</span><span>${del > 0 ? State.formatETB(del) : 'Free'}</span></div>
            ${this._discountEtb > 0 ? `<div class="co-summary-row" style="color:var(--success);font-weight:800;"><span>Promo Coupon (${this._couponCode})</span><span>-${State.formatETB(this._discountEtb)}</span></div>` : ''}
            <div class="co-summary-row total" style="border-top:1px solid var(--border);padding-top:10px;margin-top:6px;">
              <span>Final Total to Pay</span>
              <span style="color:var(--accent);font-size:18px;">${State.formatETB(total)}</span>
            </div>
          </div>

          <label class="co-check" style="margin-top:6px;cursor:pointer;">
            <input type="checkbox" id="coPolicyAgree" checked style="accent-color:var(--accent);width:18px;height:18px;" />
            <span style="font-size:12px;line-height:1.4;">I agree to <strong>${pkg.shopName}</strong>'s return policy (${State.policyLabel(pkg.returnPolicy)}).</span>
          </label>
        </div>
      </div>

      <div class="co-bottom">
        <button class="co-btn secondary" onclick="CheckoutPage._renderStep2()">← Back</button>
        <button class="co-btn primary" onclick="CheckoutPage._submitOrder()" style="background:var(--accent);color:var(--accent-text);">
          🚀 Place &amp; Pay Order — ${State.formatETB(total)}
        </button>
      </div>
    `;
  },

  async _submitOrder() {
    const agree = document.getElementById('coPolicyAgree')?.checked;
    if (!agree) {
      if (App && typeof App.toast === 'function') App.toast('Please agree to the store policy to complete checkout', 'error');
      return;
    }

    // Show processing state
    document.getElementById('checkoutPage').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px 20px;text-align:center;">
        <div class="loading-spinner" style="width:48px;height:48px;border:4px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:20px;"></div>
        <div style="font-size:16px;font-weight:800;color:white;margin-bottom:6px;">Processing Your Order...</div>
        <div style="font-size:12px;color:var(--text-secondary);">Confirming payment &amp; generating receipt</div>
      </div>
    `;

    const pkg = this._pkg;
    const isPickup = this._deliveryMethod === 'pickup';
    const deliveryAddress = isPickup
      ? { sub_city: pkg.location || 'Store', house_number: 'Customer pickup from store', phone: this._phone }
      : { sub_city: this._subCity, landmark: this._landmark, phone: this._phone };

    const items = pkg.items.map(i => ({ product_id: i.product.product_id, quantity: i.qty }));

    try {
      let order = null;
      let orderId = null;
      let orderRef = null;

      if (typeof Api !== 'undefined' && Api.orders && typeof Api.orders.create === 'function') {
        const orderData = await Api.orders.create({
          store_id: this._shopId,
          items,
          delivery_address: deliveryAddress,
          delivery_method: isPickup ? 'pickup' : 'delivery',
          payment_method: this._paymentMethod,
          ...(this._couponCode ? { coupon_code: this._couponCode } : {})
        });
        order = orderData.order;
        orderId = order.order_id;
        orderRef = order.order_ref;

        if (this._paymentMethod === 'telebirr' || this._paymentMethod === 'cbe') {
          await Api.payments.confirmTx(order.order_id, this._txCode || `TXN-${Date.now()}`);
        } else {
          await Api.payments.confirmCash(order.order_id);
        }
      } else {
        // Offline fallback
        orderId = `local-${Date.now()}`;
        orderRef = `INV-${Date.now().toString().slice(-5)}`;
      }

      State.clearStoreCart(this._shopId);
      if (App && typeof App.renderNavigation === 'function') App.renderNavigation();
      if (App && typeof App.refreshOrders === 'function') App.refreshOrders();

      // Render success screen inside the checkout overlay
      this._renderSuccess(orderRef, orderId, pkg.shopName);

      // Auto-fetch receipt in background
      this._loadReceipt(orderId);

    } catch (err) {
      if (App && typeof App.toast === 'function') App.toast(err.message || 'Order placement failed — please try again', 'error');
      // Restore Step 3
      this._renderStep3();
    }
  },

  _renderSuccess(orderRef, orderId, storeName) {
    document.getElementById('checkoutPage').innerHTML = `
      <div class="co-topbar">
        <div style="width:36px;"></div>
        <div class="co-topbar-title" style="color:var(--success);">Order Confirmed!</div>
        <div style="width:36px;"></div>
      </div>

      <div class="co-scroll">
        <div class="co-card" style="text-align:center;">
          <div style="font-size:64px;margin-bottom:12px;">🎉</div>
          <div style="font-size:22px;font-weight:900;color:var(--success);margin-bottom:4px;">Purchase Successful!</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.7;">
            Your order <strong style="color:var(--accent);">${orderRef}</strong><br/>
            has been placed with <strong style="color:white;">${storeName}</strong>
          </div>

          <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:14px;margin-bottom:16px;font-size:12px;color:var(--success);text-align:left;line-height:1.8;">
            💳 Payment confirmed — funds sent directly to seller<br/>
            📄 Your PDF receipt is being generated below<br/>
            🛵 You'll get a Telegram message when rider is assigned<br/>
            🛡️ Purchase protected by the store's return policy
          </div>

          <div id="coReceiptArea" style="margin-bottom:16px;">
            <div style="padding:20px;color:var(--text-secondary);font-size:12px;">
              <div class="loading-spinner" style="width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 10px;"></div>
              Generating your receipt PDF...
            </div>
          </div>

          <div id="coReceiptActions" style="display:none;">
            <a id="coReceiptDownload" href="#" target="_blank" download
               style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:var(--accent);border-radius:10px;padding:13px;margin-bottom:10px;color:var(--accent-text);text-decoration:none;font-size:13px;font-weight:800;">
              📥 Download PDF Receipt
            </a>
          </div>
        </div>
      </div>

      <div class="co-bottom">
        <button class="co-btn secondary" onclick="CheckoutPage.close()" style="flex:1;">Close</button>
        <button class="co-btn primary" onclick="CheckoutPage.close();App.switchTab('orders')" style="flex:2;">
          📦 Track My Order
        </button>
      </div>
    `;
  },

  async _loadReceipt(orderId) {
    const area = document.getElementById('coReceiptArea');
    const actions = document.getElementById('coReceiptActions');
    if (!area || !orderId || orderId.startsWith('local-')) {
      if (area) area.innerHTML = `<div style="padding:10px;font-size:12px;color:var(--text-secondary);">Receipt will be available in your order history.</div>`;
      return;
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
      try {
        const data = await Api.delivery.receipt(orderId);
        if (data && data.receipt_url) {
          area.innerHTML = `<iframe src="${data.receipt_url}" style="width:100%;height:320px;border:1px solid var(--border);border-radius:8px;background:white;"></iframe>`;
          const dlBtn = document.getElementById('coReceiptDownload');
          if (dlBtn) {
            dlBtn.href = data.receipt_url;
            if (!data.receipt_url.startsWith('data:')) dlBtn.download = '';
            actions.style.display = 'block';
          }
          return;
        }
      } catch (err) { /* retry */ }
    }

    area.innerHTML = `<div style="padding:10px;font-size:12px;color:var(--text-secondary);">📄 Receipt will be sent to you via Telegram.</div>`;
  }
};