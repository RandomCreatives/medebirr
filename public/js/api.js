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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    options.signal = controller.signal;
    try {
      const res = await fetch(`${API_BASE}${path}`, options);
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error || 'API Error'), { status: res.status, data });
      return data;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') throw new Error('Request timed out');
      if (err.status) throw err;
      throw new Error('Network error — check your connection');
    }
  },

  get:    (path)        => Api._fetch('GET',    path),
  post:   (path, body)  => Api._fetch('POST',   path, body),
  put:    (path, body)  => Api._fetch('PUT',    path, body),
  patch:  (path, body)  => Api._fetch('PATCH',  path, body),
  delete: (path)        => Api._fetch('DELETE', path),

  // ── Auth ───────────────────────────────────────────
  auth: {
    telegram: (initData) => Api.post('/auth/telegram', { initData })
  },

  // ── Products ───────────────────────────────────────
  products: {
    featured: (limit=12)  => Api.get(`/products/featured?limit=${limit}`),
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
    stats:        (id)          => Api.get(`/stores/${id}/stats`),
    delete:       (id)          => Api.delete(`/stores/${id}`)
  },

  // ── Orders ─────────────────────────────────────────
  orders: {
    create:          (data)               => Api.post('/orders', data),
    list:            (params = {})        => { const qs = new URLSearchParams(params).toString(); return Api.get(`/orders${qs ? '?' + qs : ''}`); },
    get:             (id)                 => Api.get(`/orders/${id}`),
    storeOrders:     (storeId, params={}) => { const qs = new URLSearchParams(params).toString(); return Api.get(`/orders/store/${storeId}${qs ? '?' + qs : ''}`); },
    dispatch:        (id, data)           => Api.put(`/orders/${id}/dispatch`, data),
    confirmDelivery: (id)                 => Api.put(`/orders/${id}/confirm-delivery`, {}),
    cancel:          (id)                 => Api.patch(`/orders/${id}/cancel`, {}),
    cancelAsSeller:  (id, data)           => Api.patch(`/orders/${id}/cancel-seller`, data),
    reviews:         (storeId)            => Api.get(`/reviews/store/${storeId}`),
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
    updateMe:       (data)      => Api.put('/users/me', data),
    addresses:      ()          => Api.get('/users/me/addresses'),
    addAddress:     (data)      => Api.post('/users/me/addresses', data),
    updateAddress:  (id, data)  => Api.put(`/users/me/addresses/${id}`, data),
    deleteAddress:  (id)        => Api.delete(`/users/me/addresses/${id}`),
    wishlist:       ()          => Api.get('/users/me/wishlist'),
    addWishlist:    (productId) => Api.post(`/users/me/wishlist/${productId}`, {}),
    removeWishlist: (productId) => Api.delete(`/users/me/wishlist/${productId}`),
    notifications:  ()          => Api.get('/users/me/notifications'),
    paymentMethods: ()          => Api.get('/users/me/payment-methods'),
    addPaymentMethod:  (data)   => Api.post('/users/me/payment-methods', data),
    deletePaymentMethod: (id)   => Api.delete(`/users/me/payment-methods/${id}`),
    setDefaultPayment:   (id)   => Api.patch(`/users/me/payment-methods/${id}/default`, {}),
    coupons:        ()          => Api.get('/users/me/coupons'),
    validateCoupon: (code)      => Api.post('/coupons/validate', { code }),
    settings:       ()          => Api.get('/users/me/settings'),
    updateSettings: (data)      => Api.put('/users/me/settings', data),
  },

  // ── Reviews ────────────────────────────────────────
  reviews: {
    create: (data) => Api.post('/reviews', data),
    list:   (productId) => Api.get(`/reviews/product/${productId}`)
  },

  // ── Pending Products (Telegram → App pipeline) ─────
  pending: {
    list:     (storeId)              => Api.get(`/pending-products/store/${storeId}`),
    complete: (id, data)             => Api.put(`/pending-products/${id}/complete`, data),
    publish:  (id, data = {})        => Api.post(`/pending-products/${id}/publish`, data),
    discard:  (id)                   => Api.delete(`/pending-products/${id}`)
  },

  // ── Images ─────────────────────────────────────────
  images: {
    upload: async (storeId, files) => {
      const formData = new FormData();
      formData.append('store_id', storeId);
      for (let i = 0; i < files.length; i++) {
        formData.append('images', files[i]);
      }
      const token = Api.getToken();
      const res = await fetch(`${API_BASE}/images/upload`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data;
    }
  },

  // ── Store Settings & Verification ──────────────────
  storeSettings: {
    update: (storeId, data) => Api.put(`/stores/${storeId}/settings`, data),
    verification: (storeId) => Api.get(`/stores/${storeId}/verification`),
    requestVerification: (storeId, data) => Api.post(`/stores/${storeId}/verify-request`, data)
  },

  // ── Delivery Verification ─────────────────────────
  delivery: {
    qr:            (orderId)          => Api.get(`/delivery/${orderId}/qr`),
    scan:          (orderId, data)     => Api.post(`/delivery/${orderId}/scan`, data),
    settle:        (orderId)           => Api.post(`/delivery/${orderId}/settle`),
    receipt:       (orderId)           => Api.get(`/delivery/${orderId}/receipt`),
    initiateReturn:(orderId, data = {}) => Api.post(`/delivery/${orderId}/return`, data)
  }
};
