/* ═══════════════════════════════════════════════════
   Store Settings (extracted from app.js)
   Toggles, delivery rules, tax, policy, payments, coupons
═══════════════════════════════════════════════════ */
(function() {

App.toggleAutoDetect = async function(enabled) {
  if (!State.currentStoreId) return;
  try {
    await Api.storeSettings.update(State.currentStoreId, { auto_detect_products: enabled });
    if (State.stores[0]) State.stores[0].auto_detect_products = enabled;
    this.toast(`Auto-detect ${enabled ? 'enabled' : 'disabled'}`, 'success');
  } catch (err) {
    this.toast(err.message || 'Failed to update setting', 'error');
    const toggle = document.getElementById('autoDetectToggle');
    if (toggle) toggle.checked = !enabled;
  }
};

App.toggleTelegramNotifs = async function(enabled) {
  if (!State.currentStoreId) return;
  try {
    await Api.stores.update(State.currentStoreId, { telegram_notifs: enabled });
    if (State.stores[0]) State.stores[0].telegram_notifs = enabled;
    this.toast(`Telegram notifications ${enabled ? 'enabled' : 'disabled'}`, 'success');
  } catch (err) {
    this.toast(err.message || 'Failed to update setting', 'error');
    const toggle = document.getElementById('telegramNotifsToggle');
    if (toggle) toggle.checked = !enabled;
  }
};

// Lightweight store-flag toggles
App._storeToggle = function(field, enabled, toggleId) {
  if (!State.currentStoreId) return Promise.resolve();
  if (State.stores[0]) State.stores[0][field] = enabled;
  return Api.stores.update(State.currentStoreId, { [field]: enabled })
    .then(() => this.toast(`${field.replace(/_/g,' ')} ${enabled ? 'enabled' : 'disabled'}`, 'success'))
    .catch(err => {
      this.toast(err.message || 'Setting not saved yet', 'info');
      const t = document.getElementById(toggleId);
      if (t) t.checked = !enabled;
    });
};

App.toggleSelfDelivery    = function(enabled) { return App._storeToggle('self_delivery_enabled', enabled, 'selfDeliveryToggle'); };
App.toggleCompanyDelivery = function(enabled) { return App._storeToggle('company_delivery_enabled', enabled, 'companyDeliveryToggle'); };
App.toggleAutoInvoice     = function(enabled) { return App._storeToggle('auto_invoice', enabled, 'autoInvoiceToggle'); };
App.toggleLowStock        = function(enabled) { return App._storeToggle('low_stock_alerts', enabled, 'lowStockToggle'); };
App.toggleNewOrderAlerts  = function(enabled) { return App._storeToggle('new_order_alerts', enabled, 'newOrderToggle'); };
App.toggleTwoFactor       = function(enabled) { return App._storeToggle('two_factor_enabled', enabled, 'twoFactorToggle'); };

App.saveDeliveryRules = async function() {
  try {
    const addis = document.getElementById('addisFee')?.value;
    const regional = document.getElementById('regionalFee')?.value;
    await Api.stores.updatePolicy(State.currentStoreId, {
      addis_delivery_fee: addis ? Number(addis) : undefined,
      regional_dispatch_fee: regional ? Number(regional) : undefined
    });
    this.toast('Delivery rules saved!', 'success');
  } catch (err) {
    this.toast(err.message || 'Failed to save delivery rules', 'error');
  }
};

App.saveTaxConfig = async function() {
  try {
    const taxRate = document.getElementById('taxRate')?.value;
    const taxTin = document.getElementById('taxTin')?.value?.trim();
    await Api.stores.update(State.currentStoreId, {
      tax_rate: taxRate ? Number(taxRate) : 0,
      tax_tin: taxTin || ''
    });
    this.toast('Tax & invoice settings saved!', 'success');
  } catch (err) {
    this.toast(err.message || 'Tax settings not saved yet', 'info');
  }
};

App.savePolicy = async function() {
  const storeId = State.currentStoreId;
  if (!storeId) return;
  const data = {
    return_policy_type: document.getElementById('policyType')?.value,
    custom_policy_text: document.getElementById('policyText')?.value,
    addis_delivery_fee: parseFloat(document.getElementById('addisFee')?.value),
    regional_dispatch_fee: parseFloat(document.getElementById('regionalFee')?.value),
    telebirr_enabled: document.getElementById('telebirrEnabled')?.checked,
    cbe_enabled: document.getElementById('cbeEnabled')?.checked,
    cash_on_delivery: document.getElementById('cashEnabled')?.checked,
    telegram_notifs: document.getElementById('telegramNotifsToggle')?.checked
  };
  try {
    await Api.stores.updatePolicy(storeId, data);
    const storeData = await Api.stores.get(storeId);
    State.stores[0] = { ...State.stores[0], ...storeData.store };
    this.toast('Store settings saved!', 'success');
  } catch (err) {
    this.toast(err.message || 'Save failed', 'error');
  }
};

// Persisted progress bar for payment account saves
App._payoutProgress = 0;

App._startProgress = function() {
  const wrap = document.getElementById('payoutProgress');
  const bar = document.getElementById('payoutProgressBar');
  const status = document.getElementById('payoutProgressStatus');
  const btn = document.getElementById('savePayoutBtn');
  if (wrap) wrap.style.display = 'block';
  if (status) { status.style.display = 'block'; }
  if (btn) btn.disabled = true;
  if (!bar) return null;
  let pct = this._payoutProgress || 0;
  bar.style.width = pct + '%';
  const timer = setInterval(() => {
    if (pct < 90) { pct += Math.max(1, (90 - pct) / 12); bar.style.width = pct + '%'; }
  }, 120);
  return {
    setStatus: (t) => { if (status) status.textContent = t; },
    finish: (success) => {
      clearInterval(timer);
      if (success) { pct = 100; bar.style.width = '100%'; }
      this._payoutProgress = success ? 0 : (Math.round(pct));
      if (status) status.textContent = success ? 'Saved!' : `Stopped at ${Math.round(pct)}% — tap save to resume`;
      setTimeout(() => {
        if (wrap) wrap.style.display = 'none';
        if (status) status.style.display = 'none';
        if (btn) btn.disabled = false;
        if (bar) bar.style.width = '0%';
      }, success ? 700 : 2500);
    }
  };
};

App.savePaymentAccounts = async function() {
  const storeId = State.currentStoreId;
  if (!storeId) return;
  const data = {
    telebirr_merchant_id: document.getElementById('telebirrMerchantId')?.value?.trim() || null,
    telebirr_account_name: document.getElementById('telebirrAccountName')?.value?.trim() || null,
    cbe_account_number: document.getElementById('cbeAccountNumber')?.value?.trim() || null,
    cbe_account_name: document.getElementById('cbeAccountName')?.value?.trim() || null
  };
  const ui = this._startProgress();
  try {
    const result = await Api.stores.update(storeId, data);
    if (result.store) {
      State.stores[0] = { ...State.stores[0], ...result.store };
      if (State.storeDetail) State.storeDetail = { ...State.storeDetail, ...result.store };
    }
    if (ui) ui.finish(true);
    this.toast('Payment accounts saved!', 'success');
  } catch (err) {
    if (ui) ui.finish(false);
    this.toast(err.message || 'Save failed — retry to continue', 'error');
  }
};

App.saveCouponPolicy = async function() {
  const storeId = State.currentStoreId;
  if (!storeId) return;
  const data = {
    share_coupon_active: document.getElementById('shareCouponToggle')?.checked || false,
    share_required: parseInt(document.getElementById('shareRequired')?.value) || 3,
    share_discount: parseFloat(document.getElementById('shareDiscount')?.value) || 5,
    coupon_validity_days: parseInt(document.getElementById('couponValidityDays')?.value) || 7,
    group_buy_active: document.getElementById('groupBuyToggle')?.checked || false,
    group_min_members: parseInt(document.getElementById('groupMinMembers')?.value) || 3,
    group_discount: parseFloat(document.getElementById('groupDiscount')?.value) || 10
  };
  try {
    const result = await Api.stores.updateCouponPolicy(storeId, data);
    State.couponPolicy = result.policy;
    this.toast('Coupon settings saved!', 'success');
  } catch (err) {
    this.toast(err.message || 'Save failed', 'error');
  }
};

App._verifyGroupFromPolicy = async function() {
  const groupUsername = document.getElementById('groupUsernameInput')?.value?.trim();
  if (!groupUsername) { this.toast('Enter a group username first', 'error'); return; }
  const resultEl = document.getElementById('policyGroupVerifyResult');
  if (resultEl) resultEl.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);">🔍 Checking...</div>`;
  try {
    const result = await Api.bot.verifyGroup(State.currentStoreId, groupUsername);
    const meData = await Api.users.me();
    State.stores = meData.stores || [];
    if (resultEl) resultEl.innerHTML = `<div style="font-size:12px;color:var(--success);">✅ Verified! @medebirrbot is admin of <strong>${result.chatTitle}</strong>. Products will now auto-post here.</div>`;
    this.toast('Group connected!', 'success');
  } catch (err) {
    if (resultEl) resultEl.innerHTML = `<div style="font-size:12px;color:var(--danger);">❌ ${err.message}</div>`;
    this.toast('Verification failed', 'error');
  }
};

})();
