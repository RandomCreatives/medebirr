/* ═══════════════════════════════════════════════════
   Medebirr API Client
   All HTTP communication with the backend
═══════════════════════════════════════════════════ */

const API_BASE = window.API_BASE || '/api/v1';

const Api = {
  _token: null,

  setToken(token) {
    this._token = token;
    localStorage.setItem('em_token', token);
  },

  getToken() {
    if (!this._token) this._token = localStorage.getItem('em_token');
    return this._token;
  },

  clearToken() {
    this._token = null;
    localStorage.removeItem('em_token');
  },

  async _fetch(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const options = { method, headers };
    if (body && method !== 'GET') options.body = JSON.stringify(body);
    try {
      const res = await fetch(`${API_BASE}${path}`, options);
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error || 'API Error'), { status: res.status, data });
      return data;
    } catch (err) {
      if (err.status) throw err;
      throw new Error('Network error — check your connection');
    }
  },

  get:    (path)        => Api._fetch('GET',    path),
  post:   (path, body)  => Api._fetch('POST',   path, body),
  put:    (path, body)  => Api._fetch('PUT',    path, body),
  delete: (path)        => Api._fetch('DELETE', path),

  // ── Auth ───────────────────────────────────────────
  auth: {
    telegram: (initData) => Api.post('/auth/telegram', { initData })
  },

  // ── Products ───────────────────────────────────────
  products: {
    list:   (params = {}) => { const qs = new URLSearchParams(params).toString(); return Api.get(`/products${qs ? '?' + qs : ''}`); },
    get:    (id)          => Api.get(`/products/${id}`),
    create: (data)        => Api.post('/products', data),
    update: (id, data)    => Api.put(`/products/${id}`, data),
    delete: (id)          => Api.delete(`/products/${id}`)
  },

  // ── Stores ─────────────────────────────────────────
  stores: {
    list:         (params = {}) => { const qs = new URLSearchParams(params).toString(); return Api.get(`/stores${qs ? '?' + qs : ''}`); },
    get:          (id)          => Api.get(`/stores/${id}`),
    create:       (data)        => Api.post('/stores', data),
    update:       (id, data)    => Api.put(`/stores/${id}`, data),
    updatePolicy: (id, data)    => Api.put(`/stores/${id}/policy`, data),
    stats:        (id)          => Api.get(`/stores/${id}/stats`)
  },

  // ── Orders ─────────────────────────────────────────
  orders: {
    create:          (data)               => Api.post('/orders', data),
    list:            (params = {})        => { const qs = new URLSearchParams(params).toString(); return Api.get(`/orders${qs ? '?' + qs : ''}`); },
    get:             (id)                 => Api.get(`/orders/${id}`),
    storeOrders:     (storeId, params={}) => { const qs = new URLSearchParams(params).toString(); return Api.get(`/orders/store/${storeId}${qs ? '?' + qs : ''}`); },
    dispatch:        (id, data)           => Api.put(`/orders/${id}/dispatch`, data),
    confirmDelivery: (id)                 => Api.put(`/orders/${id}/confirm-delivery`, {})
  },

  // ── Payments ───────────────────────────────────────
  payments: {
    initiateTelebirr: (orderId) => Api.post('/payments/telebirr/initiate', { order_id: orderId }),
    initiateChapa:    (orderId) => Api.post('/payments/chapa/initiate',    { order_id: orderId }),
    confirmCash:      (orderId) => Api.post('/payments/cash/confirm',      { order_id: orderId })
  },

  // ── Bot / Telegram Group ───────────────────────────
  bot: {
    verifyGroup: (storeId, groupUsername) => Api.post('/bot/verify-group', { store_id: storeId, group_username: groupUsername }),
    groupStatus: (storeId)               => Api.get(`/bot/group-status/${storeId}`),
    setWebhook:  ()                      => Api.post('/bot/set-webhook', {})
  },

  // ── Users ──────────────────────────────────────────
  users: {
    me:             ()          => Api.get('/users/me'),
    addresses:      ()          => Api.get('/users/me/addresses'),
    addAddress:     (data)      => Api.post('/users/me/addresses', data),
    deleteAddress:  (id)        => Api.delete(`/users/me/addresses/${id}`),
    wishlist:       ()          => Api.get('/users/me/wishlist'),
    addWishlist:    (productId) => Api.post(`/users/me/wishlist/${productId}`, {}),
    removeWishlist: (productId) => Api.delete(`/users/me/wishlist/${productId}`),
    notifications:  ()          => Api.get('/users/me/notifications')
  }
};
