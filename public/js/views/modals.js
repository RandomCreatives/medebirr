/* ═══════════════════════════════════════════════════
   Modal Sheets: Checkout, Product Detail, Add Product, Rider Assignment
═══════════════════════════════════════════════════ */

const Modals = {

  open(html, className = '') {
    const sheet = document.getElementById('modalSheet');
    const backdrop = document.getElementById('modalBackdrop');
    sheet.innerHTML = html;
    sheet.className = 'modal-sheet' + (className ? ' ' + className : '');
    backdrop.classList.add('open');
    if (className) backdrop.classList.add('pdp-backdrop');
  },

  close() {
    const backdrop = document.getElementById('modalBackdrop');
    const sheet = document.getElementById('modalSheet');
    backdrop.classList.remove('open', 'pdp-backdrop');
    sheet.className = 'modal-sheet';
  },

  // ── Checkout Sheet ────────────────────────────────
  async openCheckout(shopId) {
    const pkg = State.cart[shopId];
    if (!pkg) return;

    const sub = State.pkgSubtotal(shopId);
    const total = State.pkgTotal(shopId);

    // Saved addresses as options
    const savedAddressesHtml = State.addresses.length
      ? State.addresses.map(a => `
          <label class="delivery-option" onclick="Modals._selectDelivery(this,'saved')" style="cursor:pointer;">
            <input type="radio" name="deliveryMethod" value="saved_${a.address_id}" style="accent-color:var(--accent);flex-shrink:0;"/>
            <div style="flex:1;">
              <div style="font-weight:800;font-size:13px;">${a.label} ${a.is_default ? '<span style="background:rgba(252,205,4,0.2);color:var(--accent);font-size:9px;padding:1px 6px;border-radius:10px;font-weight:800;">DEFAULT</span>' : ''}</div>
              <div style="font-size:11px;color:var(--text-secondary);">📍 ${a.sub_city}${a.woreda?', '+a.woreda:''} ${a.house_number?'· '+a.house_number:''}</div>
              <div style="font-size:11px;color:var(--text-secondary);">📞 ${a.phone}</div>
            </div>
          </label>`).join('')
      : '';

    this.open(`
      <div class="modal-handle"></div>
      <div class="modal-title">Checkout: ${pkg.shopName}</div>
      <div style="font-size:11px;color:var(--success);font-weight:700;margin-bottom:16px;">✅ ${State.policyLabel(pkg.returnPolicy)}</div>

      <!-- ── STEP 1: How to receive your order ── -->
      <div style="font-size:12px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;">
        📦 Step 1 — How would you like to receive your order?
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;" id="deliveryOptions">

        <!-- Option A: Home/Office Delivery -->
        <label class="delivery-option selected" onclick="Modals._selectDelivery(this,'home')" style="cursor:pointer;">
          <input type="radio" name="deliveryMethod" value="home" checked style="accent-color:var(--accent);flex-shrink:0;"/>
          <div style="flex:1;">
            <div style="font-weight:800;font-size:13px;">🏠 Deliver to my Address</div>
            <div style="font-size:11px;color:var(--text-secondary);">Rider brings it to your door — delivery fee applies</div>
          </div>
          <div style="font-size:11px;color:var(--accent);font-weight:800;">+${State.formatETB(Number(pkg.deliveryFee))}</div>
        </label>

        <!-- Option B: Telegram Location Pin -->
        <label class="delivery-option" onclick="Modals._selectDelivery(this,'telegram_loc')" style="cursor:pointer;">
          <input type="radio" name="deliveryMethod" value="telegram_loc" style="accent-color:var(--accent);flex-shrink:0;"/>
          <div style="flex:1;">
            <div style="font-weight:800;font-size:13px;">📍 Share My Telegram Location</div>
            <div style="font-size:11px;color:var(--text-secondary);">Pin your exact GPS location for the rider</div>
          </div>
          <div style="font-size:11px;color:var(--accent);font-weight:800;">+${State.formatETB(Number(pkg.deliveryFee))}</div>
        </label>

        <!-- Option C: Meet at a landmark -->
        <label class="delivery-option" onclick="Modals._selectDelivery(this,'landmark')" style="cursor:pointer;">
          <input type="radio" name="deliveryMethod" value="landmark" style="accent-color:var(--accent);flex-shrink:0;"/>
          <div style="flex:1;">
            <div style="font-weight:800;font-size:13px;">🗺️ Meet at a Landmark / Kiosk</div>
            <div style="font-size:11px;color:var(--text-secondary);">Pick up at a public meeting point (e.g. near Total station, Edna Mall)</div>
          </div>
          <div style="font-size:11px;color:var(--accent);font-weight:800;">+${State.formatETB(Math.round(Number(pkg.deliveryFee) * 0.5))}</div>
        </label>

        <!-- Option D: Store Pickup -->
        <label class="delivery-option" onclick="Modals._selectDelivery(this,'pickup')" style="cursor:pointer;">
          <input type="radio" name="deliveryMethod" value="pickup" style="accent-color:var(--accent);flex-shrink:0;"/>
          <div style="flex:1;">
            <div style="font-weight:800;font-size:13px;">🏪 Collect from Store Directly</div>
            <div style="font-size:11px;color:var(--text-secondary);">Visit the seller's shop — no delivery fee</div>
          </div>
          <div style="font-size:11px;color:var(--success);font-weight:800;">Free</div>
        </label>

        <!-- Option E: Bus Terminal Dispatch (Regional) -->
        <label class="delivery-option" onclick="Modals._selectDelivery(this,'bus')" style="cursor:pointer;">
          <input type="radio" name="deliveryMethod" value="bus" style="accent-color:var(--accent);flex-shrink:0;"/>
          <div style="flex:1;">
            <div style="font-weight:800;font-size:13px;">🚌 Bus Terminal Dispatch (Regional)</div>
            <div style="font-size:11px;color:var(--text-secondary);">Seller ships to your city via bus terminal (Hawassa, Bahir Dar, Dire Dawa...)</div>
          </div>
          <div style="font-size:11px;color:var(--warning);font-weight:800;">+${State.formatETB(Number(pkg.deliveryFee) * 2 || 400)}</div>
        </label>

        ${savedAddressesHtml ? `
        <div style="font-size:11px;color:var(--text-secondary);font-weight:700;margin-top:4px;padding:4px 0;">── Saved Addresses ──</div>
        ${savedAddressesHtml}` : ''}
      </div>

      <!-- Dynamic form that changes based on delivery method -->
      <div id="deliveryFormArea"></div>

      <!-- ── STEP 2: Contact & Phone ── -->
      <div style="font-size:12px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;margin-top:4px;">
        📱 Step 2 — Your Contact
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
        <div>
          <label class="form-label">Phone Number</label>
          <input class="form-input" id="contactPhone" type="tel" placeholder="+251 9XX XXX XXX" value="${State.user?.phone || ''}"/>
        </div>
        <div>
          <label class="form-label">Telebirr Number</label>
          <input class="form-input" id="telebirrPhone" type="tel" placeholder="+251 9XX XXX XXX" value="${State.user?.phone || ''}"/>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:16px;background:var(--bg-surface);padding:10px;border-radius:8px;">
        📌 Telebirr number: the phone registered to your Telebirr account. A push notification will be sent to confirm payment.
      </div>

      <!-- ── Policy + Summary ── -->
      <div style="background:var(--bg-surface);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;">
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;">
          <input type="checkbox" id="policyAgreement" style="accent-color:var(--accent);margin-top:2px;flex-shrink:0;">
          <span style="color:var(--text-secondary);font-size:12px;line-height:1.5;">I agree to <strong style="color:white;">${pkg.shopName}'s ${State.policyLabel(pkg.returnPolicy)}</strong> policy for this order.</span>
        </label>
      </div>

      <div id="orderSummaryBox" style="background:var(--bg-surface);border-radius:var(--radius-sm);padding:12px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px;"><span style="color:var(--text-secondary);">Subtotal</span><span>${State.formatETB(sub)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;"><span style="color:var(--text-secondary);">Delivery</span><span id="summaryDelivery">${State.formatETB(pkg.deliveryFee)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:17px;font-weight:900;border-top:1px solid var(--border);padding-top:8px;">
          <span>Total</span><span style="color:var(--accent);" id="summaryTotal">${State.formatETB(total)}</span>
        </div>
      </div>

      <button class="btn-primary" onclick="App.placeOrder('${shopId}')">
        🛒 Confirm Order — <span id="btnTotal">${State.formatETB(total)}</span>
      </button>
    `);

    // Init delivery form for default 'home' option
    Modals._renderDeliveryForm('home', pkg);
  },

  _selectDelivery(label, method) {
    document.querySelectorAll('.delivery-option').forEach(el => el.classList.remove('selected'));
    label.classList.add('selected');
    // Find the current shopId from cart
    const shopId = Object.keys(State.cart)[0];
    const pkg = shopId ? State.cart[shopId] : null;
    if (pkg) Modals._renderDeliveryForm(method, pkg);
  },

  _renderDeliveryForm(method, pkg) {
    const area = document.getElementById('deliveryFormArea');
    if (!area) return;

    const baseDelivery = Number(pkg.deliveryFee) || 150;
    // Update delivery cost in summary
    const deliveryCosts = {
      home: baseDelivery,
      telegram_loc: baseDelivery,
      landmark: Math.round(baseDelivery * 0.5),
      pickup: 0,
      bus: baseDelivery * 2 || 400,
      saved: baseDelivery
    };
    const cost = Number(deliveryCosts[method] ?? baseDelivery);
    const sub = Object.values(State.cart).reduce((s, p) =>
      s + p.items.reduce((ss, i) => ss + Number(i.product.price_etb) * i.qty, 0), 0);
    const newTotal = sub + cost;
    const summaryDel = document.getElementById('summaryDelivery');
    const summaryTotal = document.getElementById('summaryTotal');
    const btnTotal = document.getElementById('btnTotal');
    if (summaryDel) summaryDel.textContent = State.formatETB(cost);
    if (summaryTotal) summaryTotal.textContent = State.formatETB(newTotal);
    if (btnTotal) btnTotal.textContent = State.formatETB(newTotal);
    Modals._currentDeliveryFee = cost;

    if (method === 'home') {
      area.innerHTML = `
        <div style="margin-bottom:16px;">
          <label class="form-label">📍 Delivery Address</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
            <div><label class="form-label" style="font-size:10px;">Sub-City</label>
              <select class="form-select" id="addrSubCity">
                ${['Bole','Kirkos','Yeka','Lideta','Gulele','Nifas Silk','Addis Ketema','Akaki Kality','Lemi Kura','Kolfe Keranio'].map(s=>`<option>${s}</option>`).join('')}
              </select>
            </div>
            <div><label class="form-label" style="font-size:10px;">Woreda</label>
              <input class="form-input" id="addrWoreda" placeholder="e.g. Woreda 03"/>
            </div>
          </div>
          <input class="form-input" id="addrHouse" placeholder="House No / Landmark (e.g. Near Edna Mall, House 412)" style="margin-bottom:8px;"/>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;margin-top:4px;">
            <input type="checkbox" id="saveThisAddress" style="accent-color:var(--accent);"> Save this address for future orders
          </label>
        </div>`;
    } else if (method === 'telegram_loc') {
      area.innerHTML = `
        <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:10px;padding:14px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:800;color:#60A5FA;margin-bottom:8px;">📍 Share Your Location via Telegram</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;margin-bottom:12px;">
            After placing the order, the seller will contact you on Telegram to request your live location pin. You can share it directly in the chat.
          </div>
          <input class="form-input" id="addrHouse" placeholder="Area / Landmark hint (optional, e.g. Near CMC Michael Church)" />
        </div>`;
    } else if (method === 'landmark') {
      area.innerHTML = `
        <div style="margin-bottom:16px;">
          <label class="form-label">🗺️ Meeting Point Details</label>
          <select class="form-select" id="addrSubCity" style="margin-bottom:8px;">
            ${['Bole','Kirkos','Yeka','Lideta','Gulele','Nifas Silk','Addis Ketema','Akaki Kality','Lemi Kura','Kolfe Keranio'].map(s=>`<option>${s}</option>`).join('')}
          </select>
          <input class="form-input" id="addrHouse" placeholder="Specific landmark (e.g. Total Station Bole, Edna Mall entrance, Friendship Mall gate 2)"/>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">Rider will meet you at this point. Reduced delivery fee applies.</div>
        </div>`;
    } else if (method === 'pickup') {
      area.innerHTML = `
        <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:10px;padding:14px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:800;color:var(--success);margin-bottom:6px;">🏪 Store Pickup — Free</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;">
            📍 <strong style="color:white;">${pkg.shopName}</strong><br/>
            ${pkg.location ? pkg.location : 'Contact seller for exact address.'}<br/>
            After placing your order, the seller will confirm a pickup time via Telegram.
          </div>
        </div>`;
    } else if (method === 'bus') {
      area.innerHTML = `
        <div style="margin-bottom:16px;">
          <label class="form-label">🚌 Bus Terminal Dispatch</label>
          <select class="form-select" id="addrSubCity" style="margin-bottom:8px;">
            <option value="Hawassa">Hawassa Bus Terminal</option>
            <option value="Bahir Dar">Bahir Dar Bus Terminal</option>
            <option value="Dire Dawa">Dire Dawa Bus Terminal</option>
            <option value="Adama">Adama (Nazret) Terminal</option>
            <option value="Jimma">Jimma Bus Terminal</option>
            <option value="Mekele">Mekele Bus Terminal</option>
            <option value="Gondar">Gondar Bus Terminal</option>
            <option value="Other">Other City</option>
          </select>
          <input class="form-input" id="addrHouse" placeholder="Your exact pickup contact / address in destination city"/>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">Seller will dispatch via intercity bus. You collect from the terminal. Tracking sent via Telegram.</div>
        </div>`;
    }
  },

  _selectPayment(label, value) {
    document.querySelectorAll('.payment-option').forEach(el => el.classList.remove('selected'));
    label.classList.add('selected');
  },

  _handleAddressChange(val) {
    const newForm = document.getElementById('newAddressForm');
    if (newForm) newForm.style.display = val === 'new' ? 'block' : 'none';
  },

  // ── Product Detail Page (Full PDP) ────────────────
  openProductDetail(product) {
    const inWishlist = State.wishlist.has(product.product_id);
    const gradient = BuyerViews._categoryGradient(product.category);
    const emoji = this._categoryEmoji(product.category);
    const savings = product.compare_price ? Math.round((1 - product.price_etb / product.compare_price) * 100) : 0;
    const images = (product.image_urls && product.image_urls.length > 0) ? product.image_urls : null;

    this._currentProduct = product;

    const breadcrumb = `
      <div class="pdp-breadcrumb">
        <a onclick="Modals.close()">Home</a>
        <span>›</span>
        <a onclick="Modals.close();setTimeout(()=>App.handleFilter('${product.category || 'all'}'),100)">${product.category || 'All'}</a>
        <span>›</span>
        <span>${product.title.substring(0, 28)}${product.title.length > 28 ? '...' : ''}</span>
      </div>`;

    this.open(`
      <div class="pdp-full">
        <div class="pdp-close">
          <button onclick="Modals.close()" style="background:none;border:none;color:white;font-size:20px;cursor:pointer;padding:4px;" aria-label="Close">✕</button>
          <div style="font-size:13px;font-weight:700;">Product Details</div>
          <div style="width:28px;"></div>
        </div>

        <div class="pdp-layout">
          <div class="pdp-gallery">
            <div class="pdp-main-image" id="pdpMainImage" style="background:${gradient};">
              ${images ? `<img src="${images[0]}" alt="${product.title}" draggable="false"/>` : `<span style="font-size:80px;">${emoji}</span>`}
            </div>
            <div class="pdp-thumb-strip" id="pdpThumbStrip">
              ${this._renderThumbs(product, images, gradient, emoji)}
            </div>
          </div>

          <div class="pdp-info">
            ${breadcrumb}
            <h1 class="pdp-title">${product.title}</h1>

            <div class="pdp-price-row">
              <span class="pdp-current-price">${State.formatETB(product.price_etb)}</span>
              ${product.compare_price ? `<span class="pdp-compare-price">${State.formatETB(product.compare_price)}</span>` : ''}
              ${savings > 0 ? `<span class="pdp-save-badge">Save ${savings}%</span>` : ''}
            </div>

            <div class="pdp-rating" onclick="document.getElementById('pdpAccordion')?.scrollIntoView({behavior:'smooth'})" role="button" aria-label="Scroll to reviews">
              <span class="pdp-stars">${this._starRating(product.rating || 0)}</span>
              <span>${(product.rating || 0).toFixed(1)}</span>
              <span class="pdp-rating-count">(${product.rating_count || 0} reviews)</span>
            </div>

            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;line-height:1.6;">
              🏪 <strong style="color:white;">${product.store_name}</strong>
              ${product.verified_badge ? '<span class="verified-check">✓ Verified</span>' : ''}
              · 📍 ${product.location_sub_city || 'Addis Ababa'}
              ${product.stock_quantity > 0
                ? `· <span style="color:var(--success);">In Stock (${product.stock_quantity})</span>`
                : `· <span style="color:var(--danger);">Out of Stock</span>`}
            </div>

            ${this._renderVariants(product.variants)}

            <div class="pdp-cta-box">
              <div class="pdp-cta-row">
                <button class="pdp-btn-primary" id="pdpAddToCartBtn" onclick="Modals._pdpAddToCart('${product.product_id}')" ${product.stock_quantity <= 0 ? 'disabled style="opacity:0.4;"' : ''}>
                  🛒 Add to Cart
                </button>
                <button class="pdp-save-btn ${inWishlist ? 'saved' : ''}" id="pdpSaveBtn" onclick="Modals._pdpToggleWishlist('${product.product_id}')" aria-label="Save for later" title="Save for later">
                  <span id="pdpHeartIcon">${inWishlist ? '❤️' : '🤍'}</span>
                </button>
              </div>
            </div>

            <div class="pdp-trust-row">
              <div class="pdp-trust-item"><span class="pdp-trust-icon">🚚</span> Free shipping on orders over ${State.formatETB(product.free_delivery_threshold || 2000)}</div>
              <div class="pdp-trust-item"><span class="pdp-trust-icon">🔄</span> ${State.policyLabel(product.return_policy_type)} — hassle-free returns</div>
              <div class="pdp-trust-item"><span class="pdp-trust-icon">🔒</span> Secure checkout — your data is protected</div>
            </div>
          </div>
        </div>

        <div class="pdp-body">
          ${this._renderBenefits(product)}
          ${this._renderAccordion(product)}
          ${this._renderCrossSell(product)}
          ${this._renderRecommendations(product)}
        </div>
      </div>
    `, 'pdp-full');

    setTimeout(() => this._initAccordion(), 50);
    setTimeout(() => this._initGallery(), 50);
    setTimeout(() => this._initCrossSell(), 50);
  },

  // ── PDP Helpers ────────────────────────────────────

  _categoryEmoji(cat) {
    const map = { electronics: '📱', fashion: '👗', groceries: '☕', footwear: '👟' };
    return map[cat] || '🏪';
  },

  _starRating(rating) {
    const full = Math.floor(rating);
    const half = rating - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  },

  // ── Media Gallery ──────────────────────────────────
  _renderThumbs(product, images, gradient, emoji) {
    if (images) {
      return images.map((url, i) => `
        <div class="pdp-thumb ${i === 0 ? 'active' : ''}" onclick="Modals._switchImage(${i}, '${product.product_id}')">
          <img src="${url}" alt="${product.title} thumbnail ${i + 1}" draggable="false"/>
        </div>
      `).join('');
    }
    // Fallback: 4 colored thumbnails from gradient
    const colors = ['#1f4037', '#2d5a4a', '#3b745d', '#4a8e70'];
    return colors.map((c, i) => `
      <div class="pdp-thumb ${i === 0 ? 'active' : ''}" style="background:${c};" onclick="Modals._switchFallback(${i}, '${product.product_id}')">
        ${emoji}
      </div>
    `).join('');
  },

  _switchImage(index, productId) {
    const product = State.products.find(p => p.product_id === productId) || this._currentProduct;
    if (!product || !product.image_urls || !product.image_urls[index]) return;
    const main = document.getElementById('pdpMainImage');
    if (!main) return;
    main.innerHTML = `<img src="${product.image_urls[index]}" alt="${product.title}" draggable="false"/>`;
    document.querySelectorAll('.pdp-thumb').forEach((el, i) => el.classList.toggle('active', i === index));
  },

  _switchFallback(index, productId) {
    document.querySelectorAll('.pdp-thumb').forEach((el, i) => el.classList.toggle('active', i === index));
    const product = State.products.find(p => p.product_id === productId) || this._currentProduct;
    const gradient = BuyerViews._categoryGradient(product?.category);
    const emoji = this._categoryEmoji(product?.category);
    const main = document.getElementById('pdpMainImage');
    if (!main) return;
    const intensities = [1, 0.85, 0.7, 0.55];
    main.style.background = `linear-gradient(135deg, rgba(252,205,4,${intensities[index] || 1}), rgba(245,158,11,${intensities[index] || 1}))`;
    main.innerHTML = `<span style="font-size:80px;">${emoji}</span>`;
  },

  _initGallery() {
    const main = document.getElementById('pdpMainImage');
    if (!main) return;
    // Desktop hover zoom
    main.addEventListener('mouseenter', () => {
      if (main.querySelector('img')) main.classList.add('zoomed');
    });
    main.addEventListener('mouseleave', () => {
      main.classList.remove('zoomed');
      main.style.transform = '';
    });
    main.addEventListener('mousemove', (e) => {
      if (!main.classList.contains('zoomed')) return;
      const rect = main.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      main.querySelector('img').style.transformOrigin = `${x}% ${y}%`;
    });
    // Mobile touch zoom
    let touchZoom = false;
    main.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) touchZoom = true;
    }, { passive: true });
    main.addEventListener('touchmove', (e) => {
      if (touchZoom) e.preventDefault();
    }, { passive: false });
    main.addEventListener('touchend', () => { touchZoom = false; });
  },

  // ── Variant Selectors ──────────────────────────────
  _renderVariants(variants) {
    if (!variants || !Array.isArray(variants) || variants.length === 0) return '';
    return variants.map(v => {
      const name = v.name || '';
      const options = v.options || [];
      if (options.length === 0) return '';
      const isColor = name.toLowerCase().includes('color') || name.toLowerCase().includes('colour');
      if (isColor) {
        return `
          <div class="pdp-variant-section">
            <div class="pdp-variant-label">${name}: <span id="pdpVarLabel_${name}">${options[0]}</span></div>
            <div class="pdp-swatch-group">
              ${options.map((opt, i) => `
                <div class="pdp-swatch ${i === 0 ? 'active' : ''}"
                     style="background:${this._colorToHex(opt)};"
                     onclick="Modals._selectSwatch(this, '${name}')"
                     title="${opt}"
                     role="button" aria-label="${opt}" tabindex="0">
                </div>
              `).join('')}
            </div>
          </div>`;
      }
      return `
        <div class="pdp-variant-section">
          <div class="pdp-variant-label">${name}: <span id="pdpVarLabel_${name}">${options[0]}</span></div>
          <div class="pdp-swatch-group">
            ${options.map((opt, i) => `
              <div class="pdp-size-pill ${i === 0 ? 'active' : ''}"
                   onclick="Modals._selectSize(this, '${name}')"
                   role="button" aria-label="${opt}" tabindex="0">${opt}</div>
            `).join('')}
          </div>
        </div>`;
    }).join('');
  },

  _colorToHex(color) {
    const map = {
      red: '#EF4444', blue: '#3B82F6', green: '#10B981', yellow: '#FCCD04',
      black: '#111111', white: '#FFFFFF', gray: '#6B7280', grey: '#6B7280',
      purple: '#8B5CF6', pink: '#EC4899', orange: '#F97316', brown: '#92400E',
      gold: '#F59E0B', silver: '#D1D5DB', navy: '#1E3A5F', teal: '#14B8A6',
      beige: '#F5F5DC', cream: '#FFFDD0', maroon: '#800000', coral: '#FF7F50'
    };
    return map[color.toLowerCase()] || color || '#6B7280';
  },

  _selectSwatch(el, name) {
    el.closest('.pdp-swatch-group').querySelectorAll('.pdp-swatch').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    const label = document.getElementById(`pdpVarLabel_${name}`);
    if (label) label.textContent = el.title || 'Selected';
  },

  _selectSize(el, name) {
    el.closest('.pdp-swatch-group').querySelectorAll('.pdp-size-pill').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    const label = document.getElementById(`pdpVarLabel_${name}`);
    if (label) label.textContent = el.textContent;
  },

  // ── CTA Actions ────────────────────────────────────
  _pdpAddToCart(productId) {
    const btn = document.getElementById('pdpAddToCartBtn');
    if (!btn || btn.disabled) return;
    App.addToCart(productId);
    btn.classList.add('added');
    btn.innerHTML = '✓ Added!';
    setTimeout(() => {
      btn.classList.remove('added');
      btn.innerHTML = '🛒 Add to Cart';
    }, 2000);
  },

  _pdpToggleWishlist(productId) {
    const wasIn = State.wishlist.has(productId);
    App.toggleWishlist(productId);
    const icon = document.getElementById('pdpHeartIcon');
    const btn = document.getElementById('pdpSaveBtn');
    if (!icon || !btn) return;
    if (wasIn) {
      icon.textContent = '🤍';
      btn.classList.remove('saved');
    } else {
      icon.textContent = '❤️';
      btn.classList.add('saved');
      icon.classList.remove('heart-anim');
      void icon.offsetWidth;
      icon.classList.add('heart-anim');
    }
  },

  // ── Benefits Grid ──────────────────────────────────
  _renderBenefits(product) {
    const cat = product.category || '';
    const benefits = [
      { icon: '✅', text: `${product.verified_badge ? 'Verified' : 'Trusted'} seller on Medebirr marketplace` },
      { icon: '💰', text: `Best price in ${product.location_sub_city || 'Addis Ababa'} — guaranteed` },
      { icon: '📞', text: 'Direct contact with seller via Telegram after purchase' },
      { icon: '🛡️', text: `${State.policyLabel(product.return_policy_type)} — shop with confidence` }
    ];
    if (cat === 'electronics') benefits.push({ icon: '🔋', text: 'Genuine products with warranty included' });
    if (cat === 'groceries') benefits.push({ icon: '🌿', text: 'Fresh, locally sourced quality guaranteed' });
    if (cat === 'fashion') benefits.push({ icon: '📏', text: 'Ethiopian sizing — find your perfect fit' });

    return `
      <div class="pdp-benefits">
        <div style="font-size:12px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Why buy this</div>
        <div class="pdp-benefits-grid">
          ${benefits.map(b => `
            <div class="pdp-benefit-item">
              <span>${b.icon}</span>
              <span>${b.text}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  },

  // ── Accordion Tabs ─────────────────────────────────
  _renderAccordion(product) {
    const specs = [
      { label: 'Category', value: product.category || '—' },
      { label: 'Subcategory', value: product.sub_category || '—' },
      { label: 'SKU', value: product.sku || '—' },
      { label: 'Stock', value: `${product.stock_quantity || 0} units` },
      { label: 'Store', value: product.store_name || '—' },
      { label: 'Location', value: product.location_sub_city || 'Addis Ababa' }
    ];

    return `
      <div class="pdp-accordion" id="pdpAccordion">
        <div class="pdp-accordion-item open">
          <button class="pdp-accordion-header" onclick="Modals._toggleAccordion(this)" aria-expanded="true">
            Product Story
            <span class="pdp-accordion-arrow">▾</span>
          </button>
          <div class="pdp-accordion-body">
            ${product.description || 'No description provided.'}
          </div>
        </div>

        <div class="pdp-accordion-item">
          <button class="pdp-accordion-header" onclick="Modals._toggleAccordion(this)" aria-expanded="false">
            Specifications & Materials
            <span class="pdp-accordion-arrow">▾</span>
          </button>
          <div class="pdp-accordion-body">
            <div style="display:grid;gap:6px;">
              ${specs.map(s => `
                <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);">
                  <span style="color:var(--text-secondary);">${s.label}</span>
                  <span style="color:white;font-weight:600;text-align:right;">${s.value}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="pdp-accordion-item">
          <button class="pdp-accordion-header" onclick="Modals._toggleAccordion(this)" aria-expanded="false">
            Shipping, Duty & Returns
            <span class="pdp-accordion-arrow">▾</span>
          </button>
          <div class="pdp-accordion-body">
            <div style="margin-bottom:8px;"><strong style="color:white;">Delivery:</strong> Addis Ababa: ${State.formatETB(product.addis_delivery_fee || 150)} · Regional: ${State.formatETB(product.regional_dispatch_fee || 400)}</div>
            <div style="margin-bottom:8px;"><strong style="color:white;">Free shipping:</strong> On orders over ${State.formatETB(product.free_delivery_threshold || 2000)}</div>
            <div style="margin-bottom:8px;"><strong style="color:white;">Returns:</strong> ${State.policyLabel(product.return_policy_type)}</div>
            <div>${product.custom_policy_text || 'Contact the store for full policy details. All purchases are covered by the store\'s return policy.'}</div>
          </div>
        </div>
      </div>`;
  },

  _toggleAccordion(header) {
    const item = header.closest('.pdp-accordion-item');
    if (!item) return;
    const isOpen = item.classList.contains('open');
    item.classList.toggle('open');
    header.setAttribute('aria-expanded', !isOpen);
  },

  _initAccordion() {
    document.querySelectorAll('.pdp-accordion-header').forEach(h => {
      h.addEventListener('click', () => this._toggleAccordion(h));
    });
  },

  // ── Cross-Sell / Frequently Bought Together ────────
  _renderCrossSell(product) {
    const siblings = (State.products || [])
      .filter(p => p.store_id === product.store_id && p.product_id !== product.product_id)
      .slice(0, 2);
    if (siblings.length === 0) return '';

    const total = [product, ...siblings].reduce((sum, p) => sum + Number(p.price_etb), 0);

    return `
      <div class="pdp-cross-sell" id="pdpCrossSell">
        <div class="pdp-cross-sell-title">🛒 Frequently Bought Together</div>
        <div class="pdp-cross-sell-list">
          <label class="pdp-cross-item">
            <input type="checkbox" checked disabled style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;">
            <div class="pdp-cross-item-thumb" style="background:${BuyerViews._categoryGradient(product.category)};">${this._categoryEmoji(product.category)}</div>
            <div class="pdp-cross-item-info">
              <div class="pdp-cross-item-title">${product.title}</div>
              <div class="pdp-cross-item-price">${State.formatETB(product.price_etb)}</div>
            </div>
            <span style="font-size:10px;color:var(--text-secondary);">This item</span>
          </label>
          ${siblings.map(p => `
            <label class="pdp-cross-item">
              <input type="checkbox" class="pdp-cross-checkbox" checked data-price="${p.price_etb}" data-id="${p.product_id}" onchange="Modals._updateCrossTotal()">
              <div class="pdp-cross-item-thumb" style="background:${BuyerViews._categoryGradient(p.category)};">${this._categoryEmoji(p.category)}</div>
              <div class="pdp-cross-item-info">
                <div class="pdp-cross-item-title">${p.title}</div>
                <div class="pdp-cross-item-price">${State.formatETB(p.price_etb)}</div>
              </div>
            </label>
          `).join('')}
        </div>
        <div class="pdp-cross-total">
          <span class="pdp-cross-total-label">Add all <span id="pdpCrossCount">${siblings.length + 1}</span> items</span>
          <span class="pdp-cross-total-price" id="pdpCrossTotal">${State.formatETB(total)}</span>
        </div>
        <button class="pdp-btn-primary" style="margin-top:10px;" onclick="Modals._addCrossSellToCart('${product.product_id}')">
          🛒 Add All <span id="pdpCrossBtnCount">${siblings.length + 1}</span> Items to Cart
        </button>
      </div>`;
  },

  _updateCrossTotal() {
    const checkboxes = document.querySelectorAll('.pdp-cross-checkbox');
    let total = 0;
    let count = 1;
    checkboxes.forEach(cb => {
      if (cb.checked) {
        total += parseFloat(cb.dataset.price);
        count++;
      }
    });
    const mainPrice = this._currentProduct ? parseFloat(this._currentProduct.price_etb) : 0;
    total += mainPrice;
    const countEl = document.getElementById('pdpCrossCount');
    const totalEl = document.getElementById('pdpCrossTotal');
    const btnCountEl = document.getElementById('pdpCrossBtnCount');
    if (countEl) countEl.textContent = count;
    if (totalEl) totalEl.textContent = State.formatETB(total);
    if (btnCountEl) btnCountEl.textContent = count;
  },

  _addCrossSellToCart(mainProductId) {
    App.addToCart(mainProductId);
    document.querySelectorAll('.pdp-cross-checkbox:checked').forEach(cb => {
      App.addToCart(cb.dataset.id);
    });
    this.close();
    App.toast('Added all items to cart!', 'success');
  },

  _initCrossSell() {
    document.querySelectorAll('.pdp-cross-checkbox').forEach(cb => {
      cb.addEventListener('change', () => this._updateCrossTotal());
    });
  },

  // ── Recommendation Carousel ────────────────────────
  _renderRecommendations(product) {
    const similar = (State.products || [])
      .filter(p => p.category === product.category && p.product_id !== product.product_id)
      .slice(0, 8);
    if (similar.length === 0) return '';

    return `
      <div class="pdp-carousel-section">
        <div class="pdp-carousel-title">✨ Similar Items You Might Like</div>
        <div class="pdp-carousel">
          ${similar.map(p => `
            <div class="pdp-carousel-card" onclick="Modals.close();setTimeout(()=>App.openProduct('${p.product_id}'),200)">
              <div class="pdp-carousel-thumb" style="background:${BuyerViews._categoryGradient(p.category)};">
                ${this._categoryEmoji(p.category)}
                <button class="pdp-carousel-quick-add" onclick="event.stopPropagation();App.addToCart('${p.product_id}');this.textContent='✓ Added';setTimeout(()=>this.textContent='+ Add',1500)">+ Add</button>
              </div>
              <div class="pdp-carousel-body">
                <div class="pdp-carousel-item-title">${p.title}</div>
                <div class="pdp-carousel-item-price">${State.formatETB(p.price_etb)}</div>
                <div class="pdp-carousel-item-rating">⭐ ${(p.rating || 0).toFixed(1)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
  },

  // ── Add / Edit Product ────────────────────────────
  openAddProduct(product = null) {
    const isEdit = !!product;
    this.open(`
      <div class="modal-handle"></div>
      <div class="modal-title">${isEdit ? 'Edit Item' : '+ Publish New Item'}</div>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;">Item will appear in the 100k buyer discovery feed and auto-broadcast to your Telegram group.</p>

      <div class="form-group">
        <label class="form-label">Item Title</label>
        <input class="form-input" id="prodTitle" value="${isEdit ? product.title : ''}" placeholder="e.g. Apple iPhone 15 Pro Max (256GB)"/>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="prodDesc">${isEdit ? (product.description || '') : ''}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="form-group">
          <label class="form-label">Price (ETB)</label>
          <input class="form-input" id="prodPrice" type="number" value="${isEdit ? product.price_etb : ''}" placeholder="0"/>
        </div>
        <div class="form-group">
          <label class="form-label">Stock Quantity</label>
          <input class="form-input" id="prodStock" type="number" value="${isEdit ? product.stock_quantity : ''}" placeholder="0"/>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" id="prodCategory">
          <option value="electronics" ${isEdit&&product.category==='electronics'?'selected':''}>📱 Electronics</option>
          <option value="fashion" ${isEdit&&product.category==='fashion'?'selected':''}>👗 Fashion & Traditional</option>
          <option value="groceries" ${isEdit&&product.category==='groceries'?'selected':''}>☕ Coffee & Food</option>
          <option value="footwear" ${isEdit&&product.category==='footwear'?'selected':''}>👟 Footwear</option>
          <option value="other" ${isEdit&&product.category==='other'?'selected':''}>📦 Other</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">SKU / Item Code (optional)</label>
        <input class="form-input" id="prodSku" value="${isEdit ? (product.sku || '') : ''}" placeholder="e.g. AAPL-IP15-256-TI"/>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:13px;cursor:pointer;">
        <input type="checkbox" id="prodPublish" ${!isEdit || product.is_published ? 'checked' : ''} style="accent-color:var(--accent);">
        Publish immediately (goes live in buyer hub)
      </label>
      <button class="btn-primary" onclick="App.${isEdit ? `updateProduct('${product.product_id}')` : 'createProduct()'}">
        ${isEdit ? 'Save Changes' : '🚀 Publish to Medebirr Hub'}
      </button>
    `);
  },

  openEditProduct(productId) {
    const product = State.sellerProducts.find(p => p.product_id === productId);
    if (product) this.openAddProduct(product);
  },

  // ── Assign Rider ──────────────────────────────────
  openAssignRider(orderId) {
    this.open(`
      <div class="modal-handle"></div>
      <div class="modal-title">🛵 Assign Delivery Rider</div>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;">Buyer will receive a Telegram notification with your rider's name and phone.</p>

      <div class="form-group">
        <label class="form-label">Rider Full Name</label>
        <input class="form-input" id="riderName" placeholder="e.g. Abebe Girma"/>
      </div>
      <div class="form-group">
        <label class="form-label">Rider Phone Number</label>
        <input class="form-input" id="riderPhone" type="tel" placeholder="+251 922 000 000"/>
      </div>
      <div class="form-group">
        <label class="form-label">Dispatch Note (optional)</label>
        <input class="form-input" id="dispatchNote" placeholder="Rider is picking up now..."/>
      </div>
      <button class="btn-primary" onclick="App.assignRider('${orderId}')">Confirm Rider Assignment</button>
    `);
  },

  // ── Payment Processing ────────────────────────────
  showPaymentProcessing(txRef, amount, telebirrPhone) {
    this.open(`
      <div class="modal-handle"></div>
      <div style="text-align:center;padding:20px 0;">
        <div style="font-size:48px;margin-bottom:16px;">📱</div>
        <div style="font-size:18px;font-weight:900;margin-bottom:8px;">Check Your Telebirr</div>
        <div style="font-size:14px;color:var(--text-secondary);margin-bottom:20px;line-height:1.7;">
          A push notification has been sent to<br/>
          <strong style="color:var(--accent);font-size:16px;">${telebirrPhone || 'your phone'}</strong><br/>
          <span style="font-size:12px;">Confirm <strong style="color:white;">${State.formatETB(amount)}</strong> with your Telebirr PIN</span>
        </div>
        <div style="background:var(--bg-surface);border-radius:var(--radius-md);padding:14px;margin-bottom:24px;font-size:12px;color:var(--text-secondary);text-align:left;">
          <div style="margin-bottom:6px;">📌 <strong style="color:white;">Steps:</strong></div>
          <div style="line-height:2;">1. Open your Telebirr app<br/>2. Tap the payment notification<br/>3. Enter your 4-digit PIN<br/>4. Return here — order confirms automatically</div>
        </div>
        <div class="loading-spinner" style="margin:0 auto 14px auto;"></div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:20px;">Waiting for payment confirmation...</div>
        <div style="font-size:11px;color:var(--text-muted);">TX Ref: ${txRef}</div>
      </div>
    `);
  },

  // ── Order Confirmation + PDF Receipt ─────────────
  showOrderConfirmed(orderRef, storeName, orderId) {
    this.open(`
      <div class="modal-handle"></div>
      <div style="text-align:center;padding:16px 0 20px 0;">
        <div style="font-size:52px;margin-bottom:14px;">🎉</div>
        <div style="font-size:20px;font-weight:900;margin-bottom:6px;color:var(--success);">Order Confirmed!</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.7;">
          <strong style="color:white;">${orderRef}</strong><br/>
          Placed with <strong style="color:white;">${storeName}</strong><br/>
          Payment settled directly to the seller.
        </div>

        <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:var(--radius-md);padding:14px;margin-bottom:16px;font-size:12px;color:var(--success);text-align:left;line-height:1.8;">
          🛵 You'll get a Telegram message when your rider is assigned<br/>
          🛡️ Purchase protected by the store's return policy<br/>
          ✅ Confirm delivery when rider arrives to start warranty
        </div>

        ${orderId ? `
        <a href="/api/v1/orders/${orderId}/receipt" target="_blank"
           style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:13px;margin-bottom:12px;color:white;text-decoration:none;font-size:13px;font-weight:700;">
          📄 Download PDF Receipt
        </a>` : ''}

        <button class="btn-primary" onclick="Modals.close();App.switchTab('orders')">
          📦 Track My Order
        </button>
      </div>
    `);
  }
};
