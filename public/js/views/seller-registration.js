/* ═══════════════════════════════════════════════════
   Seller Registration (extracted from app.js)
   Welcome → Slide-to-open → Terms → Registration → Submit
═══════════════════════════════════════════════════ */
(function() {

// ── Register Store Modal ──────────────────────────
App.openRegisterStoreModal = function() {
  this._showSellerWelcome();
};

// ── Floating Overlay Helpers ────────────────────────────────
App._openFloat = function(html) {
  const o = document.getElementById('floatOverlay');
  const c = document.getElementById('floatCard');
  if (!o || !c) return false;
  c.innerHTML = html;
  o.classList.add('fo-open');
  return true;
};
App._closeFloat = function() {
  const o = document.getElementById('floatOverlay');
  if (o) o.classList.remove('fo-open');
};

// ── Seller Welcome (floating, luxury) ───────────────────────
App._showSellerWelcome = function() {
  this._openFloat(`
    <div class="fo-section">
      <div class="fo-brand">
        <div class="fo-brand-logo">M</div>
        <div class="fo-brand-name">Medebirr</div>
      </div>
      <div class="fo-title">Launch Your Medeb</div>
      <div class="fo-sub">Zero commission. Direct payments. Ethiopia's marketplace.</div>

      <div style="margin-bottom:20px;">
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:14px;">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">💰</div>
          <div>
            <div style="font-size:12px;font-weight:800;color:white;">Keep Every Birr</div>
            <div style="font-size:11px;color:var(--text-secondary);line-height:1.4;">Buyers pay you directly. No middleman, no delay.</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:14px;">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">📢</div>
          <div>
            <div style="font-size:12px;font-weight:800;color:white;">Auto-Broadcast</div>
            <div style="font-size:11px;color:var(--text-secondary);line-height:1.4;">Post in Telegram. Bot lists it. Buyers purchase.</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🚀</div>
          <div>
            <div style="font-size:12px;font-weight:800;color:white;">Live in 60 Seconds</div>
            <div style="font-size:11px;color:var(--text-secondary);line-height:1.4;">Name, payment, Telegram link — done.</div>
          </div>
        </div>
      </div>
    </div>

    <div class="fo-divider"></div>

    <div style="padding:20px 24px 24px;">
      <div class="slide-to-enter" style="position:relative;bottom:auto;left:auto;right:auto;">
        <div class="slide-track" id="sellerSlideTrack">
          <div class="slide-thumb" id="sellerSlideThumb">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div class="slide-label" id="sellerSlideLabel">Slide to launch your medeb →</div>
        </div>
      </div>
    </div>
  `);

  setTimeout(() => this._initSellerSlideToOpen(), 50);
};

App._sellerSlideDragging = false;
App._sellerSlideStartX = 0;
App._sellerSlideThumbLeft = 4;

App._initSellerSlideToOpen = function() {
  const thumb = document.getElementById('sellerSlideThumb');
  const track = document.getElementById('sellerSlideTrack');
  if (!thumb || !track) return;

  const getTrackWidth = () => track.offsetWidth;
  const maxLeft = () => getTrackWidth() - 56;

  const onStart = (clientX) => {
    this._sellerSlideDragging = true;
    this._sellerSlideStartX = clientX - this._sellerSlideThumbLeft;
    thumb.style.transition = 'none';
  };

  const onMove = (clientX) => {
    if (!this._sellerSlideDragging) return;
    const x = clientX - this._sellerSlideStartX;
    const clamped = Math.max(4, Math.min(x, maxLeft()));
    this._sellerSlideThumbLeft = clamped;
    thumb.style.left = clamped + 'px';
    const pct = clamped / maxLeft();
    const label = document.getElementById('sellerSlideLabel');
    if (label) label.style.opacity = 1 - pct;
  };

  const onEnd = () => {
    if (!this._sellerSlideDragging) return;
    this._sellerSlideDragging = false;
    thumb.style.transition = 'left 0.2s ease';

    const pct = this._sellerSlideThumbLeft / maxLeft();
    if (pct > 0.8) {
      thumb.style.left = maxLeft() + 'px';
      track.classList.add('done');
      const label = document.getElementById('sellerSlideLabel');
      if (label) { label.textContent = '✓ Launching...'; label.style.opacity = 1; }
      setTimeout(() => this._showSellerTerms(), 350);
    } else {
      thumb.style.left = '4px';
      this._sellerSlideThumbLeft = 4;
      const label = document.getElementById('sellerSlideLabel');
      if (label) label.style.opacity = 1;
    }
  };

  const onMoveBound = (e) => onMove(e.clientX);
  const onEndBound = () => onEnd();

  thumb.addEventListener('mousedown', (e) => { e.preventDefault(); onStart(e.clientX); });
  document.addEventListener('mousemove', onMoveBound);
  document.addEventListener('mouseup', onEndBound);

  thumb.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX), { passive: true });
  thumb.addEventListener('touchmove', (e) => { e.preventDefault(); onMove(e.touches[0].clientX); }, { passive: false });
  thumb.addEventListener('touchend', onEnd);
};

// ── Terms & Conditions (floating, luxury) ───────────────────
App._showSellerTerms = function() {
  this._openFloat(`
    <div class="fo-section" style="padding-bottom:12px;">
      <div class="fo-brand">
        <div class="fo-brand-logo">M</div>
        <div class="fo-brand-name">Medebirr</div>
      </div>
      <div class="fo-title">Terms &amp; Conditions</div>
      <div class="fo-sub" style="margin-bottom:14px;">Please review before launching your Medeb</div>

      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:14px;max-height:260px;overflow-y:auto;font-size:11px;color:var(--text-secondary);line-height:1.7;">
        <div style="font-weight:800;color:white;margin-bottom:6px;">1. Seller Responsibilities</div>
        You are solely responsible for your store's products, pricing, and customer service. All listings must be accurate and comply with Ethiopian law.

        <div style="font-weight:800;color:white;margin:10px 0 6px;">2. Payments</div>
        Payments are made directly from buyers to you via Telebirr, CBE, or cash. Medebirr does not hold, escrow, or process your funds. You receive 100% of the sale price.

        <div style="font-weight:800;color:white;margin:10px 0 6px;">3. Zero Commission</div>
        Medebirr charges zero commission on sales. The platform is free for sellers. Transaction fees from Telebirr/CBE are borne by the buyer.

        <div style="font-weight:800;color:white;margin:10px 0 6px;">4. Product Listings</div>
        Products must be legal, accurately described, and available. Counterfeit, prohibited, or misleading items are grounds for immediate removal.

        <div style="font-weight:800;color:white;margin:10px 0 6px;">5. Store Suspension</div>
        Medebirr reserves the right to suspend stores that violate these terms, engage in fraud, or receive repeated buyer complaints.

        <div style="font-weight:800;color:white;margin:10px 0 6px;">6. Data &amp; Privacy</div>
        Your store information (name, phone, category) is displayed to buyers. Personal data is not sold to third parties. See our full Privacy Policy for details.

        <div style="font-weight:800;color:white;margin:10px 0 6px;">7. Limitation of Liability</div>
        Medebirr is a marketplace platform. We are not a party to transactions between buyers and sellers. Disputes must be resolved directly between parties.
      </div>
    </div>

    <div class="fo-divider"></div>

    <div class="fo-actions">
      <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin-bottom:16px;" onclick="event.stopPropagation()">
        <input type="checkbox" id="sellerTosCheck" style="accent-color:var(--accent);width:18px;height:18px;margin-top:1px;flex-shrink:0;"/>
        <span style="font-size:11px;color:var(--text-secondary);line-height:1.5;">
          I have read and agree to Medebirr's <strong style="color:white;">Terms &amp; Conditions</strong> and understand my responsibilities as a seller.
        </span>
      </label>
      <button id="sellerTosBtn" onclick="App._confirmSellerTerms()" disabled
        style="width:100%;padding:14px;border-radius:12px;border:none;font-size:14px;font-weight:800;cursor:pointer;transition:all 0.2s;
        background:var(--border);color:var(--text-muted);pointer-events:none;">
        Launch My Medeb
      </button>
      <button onclick="App._closeFloat()" style="width:100%;padding:10px;border-radius:10px;border:none;background:transparent;color:var(--text-secondary);font-size:12px;font-weight:600;cursor:pointer;margin-top:6px;">
        Go Back
      </button>
    </div>
  `);

  const check = document.getElementById('sellerTosCheck');
  const btn = document.getElementById('sellerTosBtn');
  if (check && btn) {
    check.addEventListener('change', () => {
      if (check.checked) {
        btn.disabled = false;
        btn.style.background = 'var(--accent)';
        btn.style.color = 'var(--accent-text)';
        btn.style.pointerEvents = 'auto';
      } else {
        btn.disabled = true;
        btn.style.background = 'var(--border)';
        btn.style.color = 'var(--text-muted)';
        btn.style.pointerEvents = 'none';
      }
    });
  }
};

App._confirmSellerTerms = function() {
  const check = document.getElementById('sellerTosCheck');
  if (!check || !check.checked) return;
  this._closeFloat();
  setTimeout(() => this.openRegisterStoreModal_(), 250);
};

// ── Registration Modal (wizard, 3 steps) ─────────────────────
App.openRegisterStoreModal_ = function() {
  const botUsername = 'medebirrbot';
  Modals.open(`
    <div class="modal-handle"></div>
    <div class="modal-title">🏪 Open Your Shop on Medebirr</div>
    <p style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5;">
      List your products, reach buyers across Ethiopia. Zero commission. Payments land directly in your account.
    </p>

    <!-- Wizard Progress Bar -->
    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-surface);padding:10px 14px;border-radius:8px;margin-bottom:18px;border:1px solid var(--border);">
      <div id="regStepBadge1" style="font-size:11px;font-weight:800;color:var(--accent);">1. Profile</div>
      <div style="width:20px;height:1px;background:var(--border);"></div>
      <div id="regStepBadge2" style="font-size:11px;font-weight:700;color:var(--text-muted);">2. Security</div>
      <div style="width:20px;height:1px;background:var(--border);"></div>
      <div id="regStepBadge3" style="font-size:11px;font-weight:700;color:var(--text-muted);">3. Telegram Group</div>
    </div>

    <!-- ── CARD STEP 1: STORE PROFILE ── -->
    <div id="regStepCard1" style="display:block;">
      <div style="font-size:12px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;">Step 1 — Store Profile Details</div>

      <div class="form-group">
        <label class="form-label">Store / Shop Name</label>
        <input class="form-input" id="regStoreName" placeholder="e.g. Bole Fashion House"/>
      </div>

      <div class="form-group">
        <label class="form-label">What do you sell?</label>
        <select class="form-select" id="regCategory">
          <option value="fashion">👗 Fashion & Traditional Clothing</option>
          <option value="electronics">📱 Electronics & Phones</option>
          <option value="groceries">☕ Coffee, Food & Groceries</option>
          <option value="footwear">👟 Footwear</option>
          <option value="furniture">🪑 Furniture & Home</option>
          <option value="beauty">💄 Beauty & Personal Care</option>
          <option value="other">📦 Other</option>
        </select>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
        <div class="form-group">
          <label class="form-label">Sub-City</label>
          <select class="form-select" id="regSubCity">
            ${['Bole','Kirkos','Yeka','Lideta','Gulele','Nifas Silk','Addis Ketema','Akaki Kality','Lemi Kura','Kolfe Keranio','Outside Addis'].map(s=>`<option>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Business Phone</label>
          <input class="form-input" id="regPhone" type="tel" placeholder="+251 9XX XXX XXX"/>
        </div>
      </div>

      <button class="btn-primary" onclick="App._nextRegStep(1, 2)" style="margin-top:8px;">
        Next: Financials &amp; Password →
      </button>
    </div>

    <!-- ── CARD STEP 2: TELEBIRR & PASSWORD ── -->
    <div id="regStepCard2" style="display:none;">
      <div style="font-size:12px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;">Step 2 — Payments &amp; Security</div>

      <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px;color:white;line-height:1.5;">
        💡 <strong>Direct Seller Checkout:</strong> Buyers transfer money directly to your Telebirr shortcode or account during checkout. Zero platform commission or escrow delay!
      </div>

      <div class="form-group">
        <label class="form-label">Your Telebirr Shortcode / Phone</label>
        <input class="form-input" id="regTelebirr" type="tel" placeholder="e.g. 891204 or +251 9XX XXX XXX"/>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Displayed to buyers upon order placement.</div>
      </div>

      <div class="form-group">
        <label class="form-label">🔑 Seller Studio Password</label>
        <input class="form-input" id="regPassword" type="password" placeholder="Minimum 4 characters" style="font-family:monospace;"/>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Required to unlock and manage your Seller Studio dashboard.</div>
      </div>

      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn-secondary" onclick="App._showRegStep(1)" style="flex:1;">← Back</button>
        <button class="btn-primary" onclick="App._nextRegStep(2, 3)" style="flex:2;">Next: Connect Telegram →</button>
      </div>
    </div>

    <!-- ── CARD STEP 3: TELEGRAM GROUP & LAUNCH ── -->
    <div id="regStepCard3" style="display:none;">
      <div style="font-size:12px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;">Step 3 — Connect Your Telegram Group</div>

      <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px;color:white;line-height:1.5;">
        📢 When connected, products published in your Seller Studio automatically post to your Telegram channel/group with an interactive <strong>Buy Now</strong> button!
      </div>

      <div class="form-group">
        <label class="form-label">Telegram Group / Channel Username</label>
        <div style="position:relative;">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:14px;">@</span>
          <input class="form-input" id="regGroupUsername" placeholder="e.g. BoleAppleDeals" style="padding-left:28px;"/>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Must be a public channel or group where the bot is added as admin.</div>
      </div>

      <!-- Make bot admin instructions -->
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:800;color:white;margin-bottom:6px;">📋 How to add @${botUsername} as admin:</div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.7;">
          1. Open your Telegram group or channel → <strong>Administrators</strong><br/>
          2. Tap <strong>Add Administrator</strong> &amp; search <strong style="color:var(--accent);">@${botUsername}</strong><br/>
          3. Enable <strong>Post Messages</strong> &amp; save!
        </div>
      </div>

      <div id="groupVerifyResult" style="display:none;margin-bottom:10px;"></div>
      <button id="verifyGroupBtn" style="display:none;margin-bottom:12px;width:100%;" class="btn-secondary" onclick="App._verifyGroupLink()">
        ✅ Verify @${botUsername} is Admin
      </button>

      <div class="form-group">
        <label class="form-label">Brief Description (optional)</label>
        <textarea class="form-textarea" id="regDesc" placeholder="What makes your shop special?" style="height:60px;"></textarea>
      </div>

      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="btn-secondary" onclick="App._showRegStep(2)" style="flex:1;">← Back</button>
        <button class="btn-primary" onclick="App.submitRegisterStore()" style="flex:2;background:var(--success);color:white;">
          🚀 Launch My Store Free!
        </button>
      </div>
    </div>
  `);

  document.getElementById('regGroupUsername')?.addEventListener('input', function() {
    const verifyBtn = document.getElementById('verifyGroupBtn');
    if (verifyBtn) verifyBtn.style.display = this.value.trim() ? 'block' : 'none';
  });
};

App._showRegStep = function(step) {
  [1, 2, 3].forEach(s => {
    const card = document.getElementById(`regStepCard${s}`);
    const badge = document.getElementById(`regStepBadge${s}`);
    if (card) card.style.display = s === step ? 'block' : 'none';
    if (badge) {
      badge.style.color = s === step ? 'var(--accent)' : (s < step ? 'var(--success)' : 'var(--text-muted)');
      badge.style.fontWeight = s === step ? '800' : '700';
    }
  });
};

App._nextRegStep = function(fromStep, toStep) {
  if (fromStep === 1) {
    const name = document.getElementById('regStoreName')?.value?.trim();
    if (!name) {
      App.toast('Please enter your store / shop name to proceed', 'error');
      document.getElementById('regStoreName')?.focus();
      return;
    }
  } else if (fromStep === 2) {
    const telebirr = document.getElementById('regTelebirr')?.value?.trim();
    const pwd = document.getElementById('regPassword')?.value?.trim();
    if (!telebirr || !pwd) {
      App.toast('Please enter your Telebirr account and seller password', 'error');
      if (!telebirr) document.getElementById('regTelebirr')?.focus();
      else document.getElementById('regPassword')?.focus();
      return;
    }
    if (pwd.length < 4) {
      App.toast('Seller password must be at least 4 characters long', 'error');
      document.getElementById('regPassword')?.focus();
      return;
    }
  }
  this._showRegStep(toStep);
};

// Called after store is created to verify group link
App._verifyGroupLink = async function() {
  const groupUsername = document.getElementById('regGroupUsername')?.value?.trim();
  if (!groupUsername) return;
  const resultEl = document.getElementById('groupVerifyResult');
  const verifyBtn = document.getElementById('verifyGroupBtn');

  if (resultEl) {
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<div style="padding:10px;font-size:12px;color:var(--text-secondary);">🔍 Checking...</div>`;
  }
  if (verifyBtn) verifyBtn.disabled = true;

  // We need a store_id — check if store is already registered
  const storeId = State.currentStoreId;
  if (!storeId) {
    if (resultEl) resultEl.innerHTML = `<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:10px;font-size:12px;color:var(--warning);">Register your store first, then verify the group.</div>`;
    if (verifyBtn) verifyBtn.disabled = false;
    return;
  }

  try {
    const result = await Api.bot.verifyGroup(storeId, groupUsername);
    if (resultEl) resultEl.innerHTML = `
      <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:12px;font-size:12px;color:var(--success);margin-bottom:10px;">
        ✅ <strong>Verified!</strong> @medebirrbot is admin of <strong style="color:white;">${result.chatTitle}</strong><br/>
        <span style="color:var(--text-secondary);">Products will now auto-post to this group when published.</span>
      </div>`;
  } catch (err) {
    const hint = err.data?.hint || 'Make sure the bot is added as admin first.';
    if (resultEl) resultEl.innerHTML = `
      <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:12px;font-size:12px;color:var(--danger);margin-bottom:10px;">
        ❌ ${err.message}<br/>
        <span style="color:var(--text-secondary);margin-top:4px;display:block;">${hint}</span>
      </div>`;
    if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = '🔄 Try Again'; }
  }
};

App.submitRegisterStore = async function() {
  const storeName    = document.getElementById('regStoreName')?.value?.trim();
  const phone        = document.getElementById('regPhone')?.value?.trim();
  const subCity      = document.getElementById('regSubCity')?.value;
  const telebirrId   = document.getElementById('regTelebirr')?.value?.trim();
  const desc         = document.getElementById('regDesc')?.value?.trim();
  const groupUsername = document.getElementById('regGroupUsername')?.value?.trim();
  const sellerPassword = document.getElementById('regPassword')?.value?.trim();

  if (!storeName) { App.toast('Store name is required', 'error'); return; }
  if (!phone)     { App.toast('Business phone is required', 'error'); return; }

  try {
    App.toast('Registering your store...', 'info');
    const data = await Api.stores.create({
      store_name: storeName,
      location_sub_city: subCity,
      business_phone: phone,
      telebirr_merchant_id: telebirrId || null,
      tg_channel_username: groupUsername || null,
      description: desc || null,
      seller_password: sellerPassword || null
    });

    // Reload user stores (non-fatal if fails)
    try {
      const meData = await Api.users.me();
      State.stores = meData.stores || [];
      if (State.stores.length > 0) {
        State.currentStoreId = State.stores[0].store_id;
        State.user.isSeller = true;
      }
    } catch (_) {
      // Fallback: use store from create response
      if (data.store) {
        State.stores = [data.store];
        State.currentStoreId = data.store.store_id;
        State.user.isSeller = true;
      }
    }

    // Auto-verify group if username was provided
    let groupVerifyMsg = '';
    if (groupUsername && State.currentStoreId) {
      try {
        const verifyResult = await Api.bot.verifyGroup(State.currentStoreId, groupUsername);
        groupVerifyMsg = `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
          <div style="font-size:16px;">✅</div>
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.4;"><strong style="color:white;">@${groupUsername}</strong> verified — products will auto-post.</div>
        </div>`;
      } catch (e) {
        groupVerifyMsg = `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
          <div style="font-size:16px;">⚠️</div>
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.4;">Add @medebirrbot as admin in your group, then re-verify from settings.</div>
        </div>`;
      }
    }

    // Mark seller as unlocked (they just created the store + set password)
    State.sellerUnlocked = true;
    State.role = 'seller';
    State.currentTab = 'dashboard';

    // Load seller data (non-fatal if fails)
    try { await App.loadSellerData(); } catch (_) {}

    // Show brief floating success, then auto-enter seller studio
    App._openFloat(`
      <div class="fo-section" style="text-align:center;">
        <div style="font-size:48px;margin-bottom:12px;">🎉</div>
        <div class="fo-title">${storeName}</div>
        <div class="fo-sub" style="margin-bottom:16px;">Your Medeb is now live!</div>

        <div style="text-align:left;background:var(--bg-surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:20px;">
          <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
            <div style="font-size:16px;">✅</div>
            <div style="font-size:11px;color:var(--text-secondary);">Store profile created & verified</div>
          </div>
          <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
            <div style="font-size:16px;">✅</div>
            <div style="font-size:11px;color:var(--text-secondary);">Telebirr payment linked</div>
          </div>
          ${groupVerifyMsg || `<div style="display:flex;gap:8px;align-items:flex-start;">
            <div style="font-size:16px;">📦</div>
            <div style="font-size:11px;color:var(--text-secondary);">Ready to add products</div>
          </div>`}
        </div>

        <button class="btn-primary" onclick="App._closeFloat();App.render();" style="width:100%;padding:14px;border-radius:12px;font-size:14px;font-weight:800;background:var(--accent);color:var(--accent-text);">
          Enter Seller Studio →
        </button>
      </div>
    `);

  } catch (err) {
    App.toast(err.message || 'Registration failed', 'error');
  }
};

})();
