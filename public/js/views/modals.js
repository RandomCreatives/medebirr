/* ═══════════════════════════════════════════════════
   Modal Sheets: Checkout, Product Detail, Add Product, Rider Assignment
═══════════════════════════════════════════════════ */

const Modals = {

  open(html) {
    document.getElementById('modalSheet').innerHTML = html;
    document.getElementById('modalBackdrop').classList.add('open');
  },

  close() {
    document.getElementById('modalBackdrop').classList.remove('open');
  },

  // ── Checkout Sheet ────────────────────────────────
  async openCheckout(shopId) {
    const pkg = State.cart[shopId];
    if (!pkg) return;

    const sub = State.pkgSubtotal(shopId);
    const total = State.pkgTotal(shopId);
    const addresses = State.addresses.length
      ? State.addresses.map(a => `<option value="${a.address_id}"${a.is_default?' selected':''}>${a.label}: ${a.sub_city}, ${a.woreda || ''} · ${a.phone}</option>`).join('')
      : '<option value="new">+ Add new address</option>';

    this.open(`
      <div class="modal-handle"></div>
      <div class="modal-title">Checkout: ${pkg.shopName}</div>
      <div class="modal-sub" style="color:var(--success);">✅ ${State.policyLabel(pkg.returnPolicy)}</div>

      <div class="form-group">
        <label class="form-label">📍 Delivery Destination</label>
        <select class="form-select" id="checkoutAddress" onchange="Modals._handleAddressChange(this.value)">
          ${addresses}
        </select>
        <div id="newAddressForm" style="display:none;margin-top:10px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div class="form-group"><label class="form-label">Sub-City</label><input class="form-input" id="newSubCity" placeholder="Bole, Kirkos..."/></div>
            <div class="form-group"><label class="form-label">Woreda</label><input class="form-input" id="newWoreda" placeholder="Woreda 03"/></div>
          </div>
          <div class="form-group"><label class="form-label">House / Landmark</label><input class="form-input" id="newHouse" placeholder="Near Edna Mall, House 412"/></div>
          <div class="form-group"><label class="form-label">Phone Number</label><input class="form-input" id="newPhone" placeholder="+251 911 234 567" type="tel"/></div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">💳 Payment Method</label>
        <p style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">
          Money settles directly to <strong>${pkg.shopName}</strong>'s verified account — zero marketplace holding.
        </p>
        <label class="payment-option selected" onclick="Modals._selectPayment(this,'chapa')">
          <input type="radio" name="payMethod" value="chapa" checked />
          <div><div class="payment-name">💳 Chapa — Card / Bank Transfer</div><div class="payment-desc">Pay securely via Chapa. Supports CBE, Awash Bank, telebirr & cards.</div></div>
        </label>
        <label class="payment-option" onclick="Modals._selectPayment(this,'telebirr')">
          <input type="radio" name="payMethod" value="telebirr" />
          <div><div class="payment-name">📱 Telebirr SuperApp Push</div><div class="payment-desc">Direct push to your Telebirr-registered phone.</div></div>
        </label>
        ${pkg.cashEnabled ? `<label class="payment-option" onclick="Modals._selectPayment(this,'cash')"><input type="radio" name="payMethod" value="cash"/><div><div class="payment-name">💵 Cash on Delivery</div><div class="payment-desc">Pay the seller's rider at your door.</div></div></label>` : ''}
      </div>

      <div style="background:var(--bg-surface);border-radius:var(--radius-sm);padding:12px;margin-bottom:14px;font-size:13px;">
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;">
          <input type="checkbox" id="policyAgreement" style="accent-color:var(--accent);margin-top:2px;flex-shrink:0;">
          <span style="color:var(--text-secondary);line-height:1.5;">I agree to <strong style="color:white;">${pkg.shopName}'s ${State.policyLabel(pkg.returnPolicy)}</strong> policy for this order.</span>
        </label>
      </div>

      <div style="background:var(--bg-surface);border-radius:var(--radius-sm);padding:12px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px;"><span style="color:var(--text-secondary);">Subtotal</span><span>${State.formatETB(sub)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;"><span style="color:var(--text-secondary);">Delivery</span><span>${State.formatETB(pkg.deliveryFee)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:900;border-top:1px solid var(--border);padding-top:8px;"><span>Total</span><span style="color:var(--accent);">${State.formatETB(total)}</span></div>
      </div>

      <button class="btn-primary" onclick="App.placeOrder('${shopId}')">
        Place Order & Pay ${State.formatETB(total)} →
      </button>
    `);
  },

  _selectPayment(label, value) {
    document.querySelectorAll('.payment-option').forEach(el => el.classList.remove('selected'));
    label.classList.add('selected');
  },

  _handleAddressChange(val) {
    const newForm = document.getElementById('newAddressForm');
    if (newForm) newForm.style.display = val === 'new' ? 'block' : 'none';
  },

  // ── Product Detail Sheet ──────────────────────────
  openProductDetail(product) {
    const inWishlist = State.wishlist.has(product.product_id);
    const gradient = BuyerViews._categoryGradient(product.category);
    this.open(`
      <div class="modal-handle"></div>
      <div class="product-gallery" style="background:${gradient};">
        <span style="font-size:60px;">${this._categoryEmoji(product.category)}</span>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div style="flex:1;margin-right:10px;">
          <div class="product-title-lg">${product.title}</div>
          <div class="product-store-link" onclick="Modals.close()">🏪 ${product.store_name} ${product.verified_badge ? '<span class="verified-check">✓</span>' : ''}</div>
        </div>
        <button onclick="App.toggleWishlist('${product.product_id}')" style="background:none;border:none;font-size:22px;cursor:pointer;">
          ${inWishlist ? '❤️' : '🤍'}
        </button>
      </div>

      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;">
        <span class="product-price-lg">${State.formatETB(product.price_etb)}</span>
        ${product.compare_price ? `<span style="font-size:14px;color:var(--text-muted);text-decoration:line-through;">${State.formatETB(product.compare_price)}</span>` : ''}
      </div>

      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">
        📍 ${product.location_sub_city || 'Addis Ababa'} · ${product.store_rating ? `⭐ ${product.store_rating}` : ''}
        ${product.stock_quantity > 0 ? `· <span style="color:var(--success);">In Stock (${product.stock_quantity})</span>` : '<span style="color:var(--danger);">Out of Stock</span>'}
      </div>

      ${product.description ? `<p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:12px;">${product.description}</p>` : ''}

      <div class="policy-box">
        🛡️ <strong>${State.policyLabel(product.return_policy_type)}</strong><br>
        <span style="color:var(--text-secondary);">${product.custom_policy_text || 'See store for full policy details.'}</span>
      </div>

      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="btn-secondary" onclick="Modals.close()">← Back</button>
        <button class="btn-primary" onclick="App.addToCart('${product.product_id}');Modals.close();" ${product.stock_quantity <= 0 ? 'disabled style="opacity:0.5;"' : ''}>
          🛒 Add to Cart
        </button>
      </div>
    `);
  },

  _categoryEmoji(cat) {
    const map = { electronics: '📱', fashion: '👗', groceries: '☕', footwear: '👟' };
    return map[cat] || '🏪';
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
        ${isEdit ? 'Save Changes' : '🚀 Publish to e-Merkato Hub'}
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
  showPaymentProcessing(txRef, amount, merchant) {
    this.open(`
      <div class="modal-handle"></div>
      <div style="text-align:center;padding:20px 0;">
        <div style="font-size:48px;margin-bottom:16px;">📱</div>
        <div style="font-size:18px;font-weight:900;margin-bottom:8px;">Telebirr Payment</div>
        <div style="font-size:14px;color:var(--text-secondary);margin-bottom:20px;">
          Confirm <strong style="color:var(--accent);">${State.formatETB(amount)}</strong> on your phone<br/>
          <span style="font-size:12px;">Settlement: Directly to seller's Telebirr (${merchant})</span>
        </div>
        <div style="background:var(--bg-surface);border-radius:var(--radius-md);padding:14px;margin-bottom:20px;font-size:12px;color:var(--text-secondary);">
          <div style="margin-bottom:4px;">Transaction Ref: <strong style="color:white;">${txRef}</strong></div>
          <div>A push notification has been sent to your Telebirr-registered phone.</div>
        </div>
        <div class="loading-spinner" style="margin:0 auto 16px auto;"></div>
        <div style="font-size:12px;color:var(--text-secondary);">Waiting for your PIN confirmation...</div>
        <button class="btn-secondary" style="margin-top:20px;" onclick="App.simulatePaymentSuccess('${txRef}')">
          ✅ Simulate Successful Payment (Demo)
        </button>
      </div>
    `);
  },

  // ── Order Confirmation ────────────────────────────
  showOrderConfirmed(orderRef, storeName) {
    this.open(`
      <div class="modal-handle"></div>
      <div style="text-align:center;padding:20px 0;">
        <div style="font-size:54px;margin-bottom:16px;">🎉</div>
        <div style="font-size:20px;font-weight:900;margin-bottom:8px;color:var(--success);">Order Confirmed!</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.6;">
          <strong style="color:white;">${orderRef}</strong> placed with ${storeName}.<br/>
          Payment settled directly to the seller.<br/>
          You'll receive a Telegram alert when your rider is assigned.
        </div>
        <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:var(--radius-md);padding:14px;margin-bottom:20px;font-size:12px;color:var(--success);">
          🛡️ Your purchase is protected by the store's return policy.<br/>
          Confirm delivery via QR handshake when rider arrives.
        </div>
        <button class="btn-primary" onclick="Modals.close();App.switchTab('orders')">Track My Order</button>
      </div>
    `);
  }
};
