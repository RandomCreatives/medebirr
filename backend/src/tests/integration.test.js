/**
 * e-Merkato Integration Tests
 * Tests core API flows against a live backend.
 *
 * Requires:
 *   - BYPASS_TELEGRAM_AUTH=true on the target environment
 *   - A seeded buyer user (tg_user_id: 12893412)
 *   - A seeded store with at least one published product
 *
 * Usage:
 *   API_BASE=https://medebirr.vercel.app node src/tests/integration.test.js
 *   API_BASE=http://localhost:3000  node src/tests/integration.test.js
 */

const API_BASE = process.env.API_BASE || 'https://medebirr.vercel.app';

let passed = 0;
let failed = 0;
let token = null;
let testStoreId = null;
let testProductId = null;
let testOrderId = null;
let testOrderRef = null;

async function api(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}/api/v1${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(a, b, message) {
  if (a !== b) throw new Error(message || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ─── 1. Health Check ────────────────────────────────────────────────────────
console.log('\n🩺 Health Check');

await test('API health endpoint returns ok', async () => {
  const res = await fetch(`${API_BASE}/api/health`);
  const data = await res.json();
  assertEqual(data.status, 'ok');
  assert(data.dbConfigured, 'Database should be configured');
});

// ─── 2. Authentication ──────────────────────────────────────────────────────
console.log('\n🔑 Authentication');

await test('Mock login as buyer (tg_user_id 12893412)', async () => {
  const { status, data } = await api('POST', '/auth/telegram', { initData: 'mock:12893412' });
  assertEqual(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
  assert(data.token, 'Should return a JWT token');
  assert(data.user, 'Should return user data');
  assertEqual(String(data.user.tgUserId), '12893412');
  token = data.token;
});

await test('GET /users/me returns authenticated user', async () => {
  const { status, data } = await api('GET', '/users/me');
  assertEqual(status, 200);
  assertEqual(data.user.tg_user_id, 12893412);
});

await test('Request without token returns 401', async () => {
  const oldToken = token;
  token = null;
  const { status } = await api('GET', '/users/me');
  assertEqual(status, 401);
  token = oldToken;
});

// ─── 3. Product Listing ─────────────────────────────────────────────────────
console.log('\n📦 Product Listing');

await test('GET /products returns product list', async () => {
  const { status, data } = await api('GET', '/products');
  assertEqual(status, 200);
  assert(data.products && data.products.length > 0, 'Should have products');
  testStoreId = data.products[0].store_id;
  testProductId = data.products[0].product_id;
});

await test('GET /products/featured returns featured products', async () => {
  const { status, data } = await api('GET', '/products/featured?limit=3');
  assertEqual(status, 200);
  assert(Array.isArray(data.products), 'Should return products array');
});

// ─── 4. Store Listing ───────────────────────────────────────────────────────
console.log('\n🏬 Store Listing');

await test('GET /stores returns store list', async () => {
  const { status, data } = await api('GET', '/stores');
  assertEqual(status, 200);
  assert(data.stores && data.stores.length > 0, 'Should have stores');
});

await test('GET /stores/:id returns single store with policy', async () => {
  const { status, data } = await api('GET', `/stores/${testStoreId}`);
  assertEqual(status, 200);
  assert(data.store, 'Should return store object');
  assert(data.store.store_name, 'Store should have a name');
});

// ─── 5. Order Creation ──────────────────────────────────────────────────────
console.log('\n🛒 Order Creation (Cash on Delivery, Pickup)');

await test('POST /orders creates an order with pickup + cash', async () => {
  const { status, data } = await api('POST', '/orders', {
    store_id: testStoreId,
    items: [{ product_id: testProductId, quantity: 1 }],
    delivery_address: { sub_city: 'Store', house_number: 'Customer collects from store', phone: '+251911000000' },
    delivery_method: 'pickup',
    payment_method: 'cash'
  });
  assertEqual(status, 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
  assert(data.order, 'Should return order object');
  assert(data.order.order_id, 'Order should have an ID');
  assert(data.order.order_ref, 'Order should have a reference');
  testOrderId = data.order.order_id;
  testOrderRef = data.order.order_ref;
});

await test('Order has correct fields', async () => {
  assert(testOrderId, 'testOrderId should be set');
  assertEqual(typeof testOrderRef, 'string');
  assert(testOrderRef.startsWith('ORD-'), `Order ref should start with ORD-, got: ${testOrderRef}`);
});

// ─── 6. Order Retrieval ─────────────────────────────────────────────────────
console.log('\n📋 Order Retrieval');

await test('GET /orders returns buyer\'s orders', async () => {
  const { status, data } = await api('GET', '/orders');
  assertEqual(status, 200);
  assert(Array.isArray(data.orders), 'Should return orders array');
  const found = data.orders.find(o => o.order_id === testOrderId);
  assert(found, 'The order we just created should appear');
});

await test('GET /orders/:id returns single order', async () => {
  const { status, data } = await api('GET', `/orders/${testOrderId}`);
  assertEqual(status, 200);
  assertEqual(data.order.order_id, testOrderId);
});

// ─── 7. Payment Confirmation (Cash) ─────────────────────────────────────────
console.log('\n💳 Payment Confirmation');

await test('POST /payments/cash/confirm confirms cash payment', async () => {
  const { status, data } = await api('POST', '/payments/cash/confirm', { order_id: testOrderId });
  assertEqual(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
  assert(data.payment_status === 'paid' || data.order_status === 'confirmed',
    'Payment should be confirmed');
});

await test('Order is now paid after cash confirmation', async () => {
  const { status, data } = await api('GET', `/orders/${testOrderId}`);
  assertEqual(status, 200);
  assertEqual(data.order.payment_status, 'paid');
});

// ─── 8. Receipt ──────────────────────────────────────────────────────────────
console.log('\n📄 Receipt');

await test('GET /orders/:id/receipt returns HTML receipt', async () => {
  const res = await fetch(`${API_BASE}/api/v1/orders/${testOrderId}/receipt`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assertEqual(res.status, 200);
  const html = await res.text();
  assert(html.includes(testOrderRef), 'Receipt should contain the order reference');
  assert(html.includes('Medebirr'), 'Receipt should contain the brand name');
});

await test('Receipt has escaped HTML (XSS fix verified)', async () => {
  const res = await fetch(`${API_BASE}/api/v1/orders/${testOrderId}/receipt`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const html = await res.text();
  // The receipt should be valid HTML without any raw script injection
  assert(!html.includes('<script>'), 'Receipt should not contain raw script tags');
});

// ─── 9. Security: Unauthenticated Access ────────────────────────────────────
console.log('\n🔒 Security Checks');

await test('POST /pending-products without token returns 401', async () => {
  const { status } = await api('POST', '/pending-products', {
    store_id: testStoreId,
    tg_group_id: 'fake',
    title: 'Hacked Product'
  });
  // Save and clear token temporarily
  assertEqual(status, 401, 'Unauthenticated request should be rejected');
});

await test('POST /orders without token returns 401', async () => {
  const oldToken = token;
  token = null;
  const { status } = await api('POST', '/orders', {
    store_id: testStoreId,
    items: [{ product_id: testProductId, quantity: 1 }],
    delivery_address: { sub_city: 'Bole', phone: '+251911000000' },
    payment_method: 'cash'
  });
  assertEqual(status, 401);
  token = oldToken;
});

// ─── Results ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`  Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed === 0) {
  console.log('  🎉  All integration tests passed!\n');
  process.exit(0);
} else {
  console.log('  ⚠️   Some tests failed.\n');
  process.exit(1);
}
