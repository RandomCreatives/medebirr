/* ═══════════════════════════════════════════════════
   CheckoutPage — Full-screen floating checkout
   Step 1: Delivery (built first, others follow)
══════════════════════════════════════════════════ */

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

  // ── Step 1: Delivery ──────────────────────────────
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

    area.innerHTML = `
      ${this._geoLocation ? `
        <div class="co-card accent-green" style="margin-top:16px;">
          <div class="co-card-title" style="color:var(--success);">📍 Location detected</div>
          <div class="co-card-body">Sub-city: <strong>${detected}</strong></div>
        </div>` : `
        <div class="co-card accent-gold" style="margin-top:16px;">
          <div class="co-card-title" style="color:var(--accent);">📍 Allow location for faster checkout</div>
          <div class="co-card-body">We'll auto-fill your sub-city.</div>
        </div>`}

      <div class="co-field">
        <label class="co-label">Sub-City</label>
        <select class="form-select" id="coSubCity">
          ${subcities.map(s => `<option ${s === detected ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>

      <div class="co-field">
        <label class="co-label">Landmark / House No</label>
        <input class="form-input" id="coLandmark" placeholder="e.g. Near Edna Mall, House 412" />
      </div>

      <label class="co-check">
        <input type="checkbox" id="coSaveAddress" style="accent-color:var(--accent);" />
        <span>Save this address for future orders</span>
      </label>
    `;
  },

  _goStep2() {
    if (this._deliveryMethod !== 'pickup') {
      const subCity = document.getElementById('coSubCity')?.value;
      if (!subCity) { App.toast('Please select your sub-city', 'error'); return; }
    }
    App.toast('Step 2 coming next!', 'info');
  }
};
