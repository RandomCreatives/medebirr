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
      <div class="fo-title">${State.t('seller.welcome.launch')}</div>
      <div class="fo-sub">${State.t('seller.welcome.sub')}</div>

      <div style="margin-bottom:20px;">
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:14px;">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">💰</div>
          <div>
            <div style="font-size:12px;font-weight:800;color:white;">${State.t('seller.welcome.keepBirr')}</div>
            <div style="font-size:11px;color:var(--text-secondary);line-height:1.4;">${State.t('seller.welcome.keepBirrDesc')}</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:14px;">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">📢</div>
          <div>
            <div style="font-size:12px;font-weight:800;color:white;">${State.t('seller.welcome.autoBroadcast')}</div>
            <div style="font-size:11px;color:var(--text-secondary);line-height:1.4;">${State.t('seller.welcome.autoBroadcastDesc')}</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🚀</div>
          <div>
            <div style="font-size:12px;font-weight:800;color:white;">${State.t('seller.welcome.live60')}</div>
            <div style="font-size:11px;color:var(--text-secondary);line-height:1.4;">${State.t('seller.welcome.live60Desc')}</div>
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
          <div class="slide-label" id="sellerSlideLabel">${State.t('seller.welcome.slide')}</div>
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
      if (label) { label.textContent = State.t('seller.welcome.launching'); label.style.opacity = 1; }
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
      <div class="fo-title">${State.t('seller.terms.title')}</div>
      <div class="fo-sub" style="margin-bottom:14px;">${State.t('seller.terms.sub')}</div>

      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:14px;max-height:260px;overflow-y:auto;font-size:11px;color:var(--text-secondary);line-height:1.7;">
        <div style="font-weight:800;color:white;margin-bottom:6px;">${State.t('seller.terms.sellerResponsibilities')}</div>
        You are solely responsible for your store's products, pricing, and customer service. All listings must be accurate and comply with Ethiopian law.

        <div style="font-weight:800;color:white;margin:10px 0 6px;">${State.t('seller.terms.payments')}</div>
        Payments are made directly from buyers to you via Telebirr, CBE, or cash. Medebirr does not hold, escrow, or process your funds. You receive 100% of the sale price.

        <div style="font-weight:800;color:white;margin:10px 0 6px;">${State.t('seller.terms.zeroCommission')}</div>
        Medebirr charges zero commission on sales. The platform is free for sellers. Transaction fees from Telebirr/CBE are borne by the buyer.

        <div style="font-weight:800;color:white;margin:10px 0 6px;">${State.t('seller.terms.listings')}</div>
        Products must be legal, accurately described, and available. Counterfeit, prohibited, or misleading items are grounds for immediate removal.

        <div style="font-weight:800;color:white;margin:10px 0 6px;">${State.t('seller.terms.suspension')}</div>
        Medebirr reserves the right to suspend stores that violate these terms, engage in fraud, or receive repeated buyer complaints.

        <div style="font-weight:800;color:white;margin:10px 0 6px;">${State.t('seller.terms.dataPrivacy')}</div>
        Your store information (name, phone, category) is displayed to buyers. Personal data is not sold to third parties. See our full Privacy Policy for details.

        <div style="font-weight:800;color:white;margin:10px 0 6px;">${State.t('seller.terms.liability')}</div>
        Medebirr is a marketplace platform. We are not a party to transactions between buyers and sellers. Disputes must be resolved directly between parties.
      </div>
    </div>

    <div class="fo-divider"></div>

    <div class="fo-actions">
      <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;margin-bottom:16px;" onclick="event.stopPropagation()">
        <input type="checkbox" id="sellerTosCheck" style="accent-color:var(--accent);width:18px;height:18px;margin-top:1px;flex-shrink:0;"/>
        <span style="font-size:11px;color:var(--text-secondary);line-height:1.5;">
          ${State.t('seller.terms.agree')}
        </span>
      </label>
      <button id="sellerTosBtn" onclick="App._confirmSellerTerms()" disabled
        style="width:100%;padding:14px;border-radius:12px;border:none;font-size:14px;font-weight:800;cursor:pointer;transition:all 0.2s;
        background:var(--border);color:var(--text-muted);pointer-events:none;">
        ${State.t('seller.terms.launch')}
      </button>
      <button onclick="App._closeFloat()" style="width:100%;padding:10px;border-radius:10px;border:none;background:transparent;color:var(--text-secondary);font-size:12px;font-weight:600;cursor:pointer;margin-top:6px;">
        ${State.t('seller.terms.goBack')}
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
    <div class="modal-title">${State.t('seller.register.title')}</div>
    <p style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5;">
      ${State.t('seller.register.intro')}
    </p>

    <!-- Wizard Progress Bar -->
    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-surface);padding:10px 14px;border-radius:8px;margin-bottom:18px;border:1px solid var(--border);">
      <div id="regStepBadge1" style="font-size:11px;font-weight:800;color:var(--accent);">${State.t('seller.register.step1')}</div>
      <div style="width:16px;height:1px;background:var(--border);"></div>
      <div id="regStepBadge2" style="font-size:11px;font-weight:700;color:var(--text-muted);">Verify Phone</div>
      <div style="width:16px;height:1px;background:var(--border);"></div>
      <div id="regStepBadge3" style="font-size:11px;font-weight:700;color:var(--text-muted);">${State.t('seller.register.step2')}</div>
      <div style="width:16px;height:1px;background:var(--border);"></div>
      <div id="regStepBadge4" style="font-size:11px;font-weight:700;color:var(--text-muted);">${State.t('seller.register.step3')}</div>
    </div>

    <!-- ── CARD STEP 1: STORE PROFILE ── -->
    <div id="regStepCard1" style="display:block;">
      <div style="font-size:12px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;">${State.t('seller.register.profileStep')}</div>

      <div class="form-group">
        <label class="form-label">${State.t('seller.register.storeName')}</label>
        <input class="form-input" id="regStoreName" placeholder="${State.t('seller.register.storeNamePlaceholder')}"/>
      </div>

      <div class="form-group">
        <label class="form-label">${State.t('seller.register.whatSell')}</label>
        <select class="form-select" id="regCategory">
          <option value="fashion">${State.t('seller.register.catFashion')}</option>
          <option value="electronics">${State.t('seller.register.catElectronics')}</option>
          <option value="groceries">${State.t('seller.register.catGroceries')}</option>
          <option value="footwear">${State.t('seller.register.catFootwear')}</option>
          <option value="furniture">${State.t('seller.register.catFurniture')}</option>
          <option value="beauty">${State.t('seller.register.catBeauty')}</option>
          <option value="other">${State.t('seller.register.catOther')}</option>
        </select>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
        <div class="form-group">
          <label class="form-label">${State.t('seller.register.subCity')}</label>
          <select class="form-select" id="regSubCity">
            ${['Bole','Kirkos','Yeka','Lideta','Gulele','Nifas Silk','Addis Ketema','Akaki Kality','Lemi Kura','Kolfe Keranio','Outside Addis'].map(s=>`<option>${s === 'Outside Addis' ? State.t('seller.register.outsideAddis') : s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${State.t('seller.register.businessPhone')}</label>
          <input class="form-input" id="regPhone" type="tel" placeholder="${State.t('seller.register.phonePlaceholder')}"/>
        </div>
      </div>

      <button class="btn-primary" onclick="App._nextRegStep(1, 2)" style="margin-top:8px;">
        ${State.t('seller.register.nextFinancials')}
      </button>
    </div>

    <!-- ── CARD STEP 2: PHONE VERIFICATION ── -->
    <div id="regStepCard2" style="display:none;">
      <div style="font-size:12px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;">📱 Phone Verification</div>

      <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px;color:white;line-height:1.5;">
        A verification code will be sent to your Telegram. Make sure you have started <strong>@medebirrbot</strong>.
      </div>

      <div class="form-group">
        <label class="form-label">Phone Number</label>
        <div style="font-size:15px;font-weight:900;color:white;padding:8px 0;" id="regVerifyPhoneDisplay"></div>
      </div>

      <div class="form-group">
        <label class="form-label">Verification Code</label>
        <input class="form-input" id="regOtpCode" placeholder="Enter 6-character code" style="font-family:monospace;font-size:18px;letter-spacing:4px;text-transform:uppercase;text-align:center;" maxlength="6" autocomplete="off"/>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;" id="regOtpStatus"></div>
      </div>

      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn-secondary" onclick="App._showRegStep(1)" style="flex:1;">Back</button>
        <button class="btn-primary" id="regSendOtpBtn" onclick="App._sendOtpVerify()" style="flex:1;">Send Code</button>
        <button class="btn-primary" id="regVerifyOtpBtn" onclick="App._verifyOtpCode()" style="flex:1;display:none;" disabled>Verify</button>
      </div>

      <div style="margin-top:12px;text-align:center;">
        <button id="regResendOtpBtn" style="display:none;background:none;border:none;color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;" onclick="App._sendOtpVerify()">Resend Code</button>
        <span id="regOtpTimer" style="display:none;font-size:11px;color:var(--text-muted);"></span>
      </div>
    </div>

    <!-- ── CARD STEP 3: TELEBIRR & PASSWORD ── -->
    <div id="regStepCard3" style="display:none;">
      <div style="font-size:12px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;">${State.t('seller.register.paymentsStep')}</div>

      <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px;color:white;line-height:1.5;">
        ${State.t('seller.register.directCheckout')}
      </div>

      <div class="form-group">
        <label class="form-label">${State.t('seller.register.telebirrShortcode')}</label>
        <input class="form-input" id="regTelebirr" type="tel" placeholder="${State.t('seller.register.telebirrPlaceholder')}"/>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${State.t('seller.register.telebirrNote')}</div>
      </div>

      <div class="form-group">
        <label class="form-label">${State.t('seller.register.password')}</label>
        <input class="form-input" id="regPassword" type="password" placeholder="${State.t('seller.register.passwordPlaceholder')}" style="font-family:monospace;"/>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${State.t('seller.register.passwordNote')}</div>
      </div>

      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn-secondary" onclick="App._showRegStep(2)" style="flex:1;">${State.t('seller.register.back')}</button>
        <button class="btn-primary" onclick="App._nextRegStep(3, 4)" style="flex:2;">${State.t('seller.register.nextTelegram')}</button>
      </div>
    </div>

    <!-- ── CARD STEP 4: TELEGRAM GROUP & LAUNCH ── -->
    <div id="regStepCard4" style="display:none;">
      <div style="font-size:12px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;">${State.t('seller.register.telegramStep')}</div>

      <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px;color:white;line-height:1.5;">
        ${State.t('seller.register.autoPost')}
      </div>

      <div class="form-group">
        <label class="form-label">${State.t('seller.register.groupUsername')}</label>
        <div style="position:relative;">
          <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:14px;">@</span>
          <input class="form-input" id="regGroupUsername" placeholder="${State.t('seller.register.groupPlaceholder')}" style="padding-left:28px;"/>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${State.t('seller.register.groupNote')}</div>
      </div>

      <!-- Make bot admin instructions -->
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:800;color:white;margin-bottom:6px;">${State.t('seller.register.addAdmin')}</div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.7;">
          ${State.t('seller.register.addAdminSteps')}
        </div>
      </div>

      <div id="groupVerifyResult" style="display:none;margin-bottom:10px;"></div>
      <button id="verifyGroupBtn" style="display:none;margin-bottom:12px;width:100%;" class="btn-secondary" onclick="App._verifyGroupLink()">
        ${State.t('seller.register.verifyAdmin')}
      </button>

      <div class="form-group">
        <label class="form-label">${State.t('seller.register.briefDesc')}</label>
        <textarea class="form-textarea" id="regDesc" placeholder="${State.t('seller.register.briefPlaceholder')}" style="height:60px;"></textarea>
      </div>

      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="btn-secondary" onclick="App._showRegStep(3)" style="flex:1;">${State.t('seller.register.back')}</button>
        <button class="btn-primary" onclick="App.submitRegisterStore()" style="flex:2;background:var(--success);color:white;">
          ${State.t('seller.register.launchFree')}
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
  [1, 2, 3, 4].forEach(s => {
    const card = document.getElementById(`regStepCard${s}`);
    const badge = document.getElementById(`regStepBadge${s}`);
    if (card) card.style.display = s === step ? 'block' : 'none';
    if (badge) {
      badge.style.color = s === step ? 'var(--accent)' : (s < step ? 'var(--success)' : 'var(--text-muted)');
      badge.style.fontWeight = s === step ? '800' : '700';
    }
  });
  if (step === 1) {
    Validation.attachNameSanitizer('#regStoreName');
    Validation.attachPhoneSanitizer('#regPhone');
  }
};

App._nextRegStep = function(fromStep, toStep) {
  if (fromStep === 1) {
    const name = document.getElementById('regStoreName')?.value?.trim();
    const phone = document.getElementById('regPhone')?.value?.trim();
    if (!name) {
      App.toast(State.t('seller.register.nameRequired'), 'error');
      document.getElementById('regStoreName')?.focus();
      return;
    }
    const nameResult = Validation.validateName(name, 'Store name');
    if (!nameResult.valid) { App.toast(nameResult.error, 'error'); return; }
    if (!phone) {
      App.toast(State.t('seller.register.phoneRequired'), 'error');
      document.getElementById('regPhone')?.focus();
      return;
    }
    const phoneResult = Validation.validatePhone(phone);
    if (!phoneResult.valid) { App.toast(phoneResult.error, 'error'); return; }
    // Store phone for later
    App._regPhone = phoneResult.normalized;
    // Show phone on verification step
    const display = document.getElementById('regVerifyPhoneDisplay');
    if (display) display.textContent = phoneResult.normalized;
  } else if (fromStep === 2) {
    // OTP must be verified to proceed
    if (!App._regPhoneVerified) {
      App.toast('Please verify your phone number first', 'error');
      return;
    }
  } else if (fromStep === 3) {
    const telebirr = document.getElementById('regTelebirr')?.value?.trim();
    const pwd = document.getElementById('regPassword')?.value?.trim();
    if (!telebirr || !pwd) {
      App.toast(State.t('seller.register.accountRequired'), 'error');
      if (!telebirr) document.getElementById('regTelebirr')?.focus();
      else document.getElementById('regPassword')?.focus();
      return;
    }
    if (pwd.length < 4) {
      App.toast(State.t('seller.register.passwordLength'), 'error');
      document.getElementById('regPassword')?.focus();
      return;
    }
  }
  this._showRegStep(toStep);
};

App._sendOtpVerify = async function() {
  const phone = App._regPhone;
  if (!phone) { App.toast('Enter your phone number first', 'error'); return; }
  const btn = document.getElementById('regSendOtpBtn');
  const verifyBtn = document.getElementById('regVerifyOtpBtn');
  const status = document.getElementById('regOtpStatus');
  const resendBtn = document.getElementById('regResendOtpBtn');
  const timer = document.getElementById('regOtpTimer');
  btn.disabled = true;
  btn.textContent = 'Sending...';
  status.textContent = '';
  try {
    const result = await Api.otp.send(phone);
    btn.style.display = 'none';
    verifyBtn.style.display = 'block';
    verifyBtn.disabled = false;
    status.innerHTML = '✅ Code sent to your Telegram';
    // Start 60s resend timer
    let sec = 60;
    timer.style.display = 'inline';
    resendBtn.style.display = 'none';
    timer.textContent = `Resend in ${sec}s`;
    const t = setInterval(() => {
      sec--;
      if (sec <= 0) { clearInterval(t); timer.style.display = 'none'; resendBtn.style.display = 'inline'; }
      else timer.textContent = `Resend in ${sec}s`;
    }, 1000);
    document.getElementById('regOtpCode')?.focus();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Send Code';
    status.textContent = '❌ ' + (err.message || 'Failed to send code');
  }
};

App._verifyOtpCode = async function() {
  const code = document.getElementById('regOtpCode')?.value?.trim();
  const phone = App._regPhone;
  const btn = document.getElementById('regVerifyOtpBtn');
  const status = document.getElementById('regOtpStatus');
  if (!code || code.length !== 6) { App.toast('Enter the 6-character code from Telegram', 'error'); return; }
  btn.disabled = true;
  btn.textContent = 'Verifying...';
  status.textContent = '';
  try {
    await Api.otp.verify(phone, code);
    App._regPhoneVerified = true;
    status.innerHTML = '✅ Phone verified!';
    btn.textContent = '✅ Verified';
    btn.style.background = 'var(--success)';
    // Auto-advance to next step after 1s
    setTimeout(() => App._nextRegStep(2, 3), 1000);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Verify';
    status.textContent = '❌ ' + (err.message || 'Invalid code');
    document.getElementById('regOtpCode')?.focus();
  }
};

// Called after store is created to verify group link
App._verifyGroupLink = async function() {
  const groupUsername = document.getElementById('regGroupUsername')?.value?.trim();
  if (!groupUsername) return;
  const resultEl = document.getElementById('groupVerifyResult');
  const verifyBtn = document.getElementById('verifyGroupBtn');

  if (resultEl) {
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<div style="padding:10px;font-size:12px;color:var(--text-secondary);">${State.t('shared.loading')}</div>`;
  }
  if (verifyBtn) verifyBtn.disabled = true;

  // We need a store_id — check if store is already registered
  const storeId = State.currentStoreId;
  if (!storeId) {
    if (resultEl) resultEl.innerHTML = `<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:10px;font-size:12px;color:var(--warning);">${State.t('seller.register.registerFirst')}</div>`;
    if (verifyBtn) verifyBtn.disabled = false;
    return;
  }

  try {
    const result = await Api.bot.verifyGroup(storeId, groupUsername);
    if (resultEl) resultEl.innerHTML = `
      <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:12px;font-size:12px;color:var(--success);margin-bottom:10px;">
        ${State.t('seller.register.verified', { result })}
      </div>`;
  } catch (err) {
    const hint = err.data?.hint || 'Make sure the bot is added as admin first.';
    if (resultEl) resultEl.innerHTML = `
      <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:12px;font-size:12px;color:var(--danger);margin-bottom:10px;">
        ❌ ${err.message}<br/>
        <span style="color:var(--text-secondary);margin-top:4px;display:block;">${hint}</span>
      </div>`;
    if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = State.t('seller.register.tryAgain'); }
  }
};

App.submitRegisterStore = async function() {
  const storeName    = document.getElementById('regStoreName')?.value?.trim();
  const subCity      = document.getElementById('regSubCity')?.value;
  const telebirrId   = document.getElementById('regTelebirr')?.value?.trim();
  const desc         = document.getElementById('regDesc')?.value?.trim();
  const groupUsername = document.getElementById('regGroupUsername')?.value?.trim();
  const sellerPassword = document.getElementById('regPassword')?.value?.trim();

  if (!storeName) { App.toast(State.t('seller.register.storeRequired'), 'error'); return; }
  const nameResult = Validation.validateName(storeName, 'Store name');
  if (!nameResult.valid) { App.toast(nameResult.error, 'error'); return; }

  if (!App._regPhone) { App.toast('Phone number missing — go back to step 1', 'error'); return; }
  if (!App._regPhoneVerified) { App.toast('Please verify your phone number first', 'error'); return; }

  try {
    App.toast(State.t('seller.register.registering'), 'info');
    const data = await Api.stores.create({
      store_name: storeName,
      location_sub_city: subCity,
      business_phone: App._regPhone,
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
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.4;">${State.t('seller.register.addBotAdmin')}</div>
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
        <div class="fo-sub" style="margin-bottom:16px;">${State.t('seller.register.live')}</div>

        <div style="text-align:left;background:var(--bg-surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:20px;">
          <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
            <div style="font-size:16px;">✅</div>
            <div style="font-size:11px;color:var(--text-secondary);">${State.t('seller.register.profileCreated')}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
            <div style="font-size:16px;">✅</div>
            <div style="font-size:11px;color:var(--text-secondary);">${State.t('seller.register.telebirrLinked')}</div>
          </div>
          ${groupVerifyMsg || `<div style="display:flex;gap:8px;align-items:flex-start;">
            <div style="font-size:16px;">📦</div>
            <div style="font-size:11px;color:var(--text-secondary);">${State.t('seller.register.readyProducts')}</div>
          </div>`}
        </div>

        <button class="btn-primary" onclick="App._closeFloat();App.render();" style="width:100%;padding:14px;border-radius:12px;font-size:14px;font-weight:800;background:var(--accent);color:var(--accent-text);">
          ${State.t('seller.register.enterStudio')}
        </button>
      </div>
    `);

  } catch (err) {
    App.toast(err.message || State.t('seller.register.failed'), 'error');
  }
};

})();
