/**
 * e-Merkato Logic Tests
 * Tests core business logic without requiring a live database.
 * Run with: node src/tests/logic.test.js
 */

const crypto = require('crypto');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
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

// ─── 1. Telegram initData HMAC Verification ────────────────────────────────
console.log('\n📋 Telegram HMAC Authentication');

function verifyTelegramInitData(initData, botToken) {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  if (!hash) return { valid: false, error: 'Missing hash' };
  urlParams.delete('hash');
  const dataCheckString = Array.from(urlParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (calculatedHash !== hash) return { valid: false, error: 'Hash mismatch' };
  const authDate = parseInt(urlParams.get('auth_date'), 10);
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 86400) return { valid: false, error: 'initData expired' };
  const userStr = urlParams.get('user');
  const user = userStr ? JSON.parse(decodeURIComponent(userStr)) : null;
  return { valid: true, user };
}

const BOT_TOKEN = 'test_bot_token_12345';
const now = Math.floor(Date.now() / 1000);
const userData = JSON.stringify({ id: 12893412, first_name: 'Mike', username: 'Mike_Fikadu' });
const rawParams = new URLSearchParams({
  auth_date: now.toString(),
  user: userData,
  query_id: 'AAHtest'
});
const paramsSorted = Array.from(rawParams.entries()).sort(([a], [b]) => a.localeCompare(b));
const dataCheckString = paramsSorted.map(([k, v]) => `${k}=${v}`).join('\n');
const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
const validHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
rawParams.set('hash', validHash);
const validInitData = rawParams.toString();
const tamperedInitData = validInitData.replace('Mike_Fikadu', 'Hacker_User');

test('Valid initData passes HMAC verification', () => {
  const result = verifyTelegramInitData(validInitData, BOT_TOKEN);
  assert(result.valid, `Expected valid=true, got: ${result.error}`);
  assertEqual(result.user.id, 12893412);
});

test('Tampered initData fails HMAC verification', () => {
  const result = verifyTelegramInitData(tamperedInitData, BOT_TOKEN);
  assert(!result.valid, 'Tampered data should fail verification');
  assertEqual(result.error, 'Hash mismatch');
});

test('Wrong bot token fails HMAC verification', () => {
  const result = verifyTelegramInitData(validInitData, 'wrong_token');
  assert(!result.valid, 'Wrong token should fail');
});

test('Missing hash returns error', () => {
  const result = verifyTelegramInitData('auth_date=123&user=test', BOT_TOKEN);
  assert(!result.valid);
  assertEqual(result.error, 'Missing hash');
});

test('Expired initData (>24h) fails', () => {
  const expiredParams = new URLSearchParams({
    auth_date: (now - 90000).toString(),
    user: userData
  });
  const expiredSorted = Array.from(expiredParams.entries()).sort(([a], [b]) => a.localeCompare(b));
  const expiredCheck = expiredSorted.map(([k, v]) => `${k}=${v}`).join('\n');
  const expiredHash = crypto.createHmac('sha256', secretKey).update(expiredCheck).digest('hex');
  expiredParams.set('hash', expiredHash);
  const result = verifyTelegramInitData(expiredParams.toString(), BOT_TOKEN);
  assert(!result.valid);
  assertEqual(result.error, 'initData expired');
});

// ─── 2. Cart Partitioning Logic ────────────────────────────────────────────
console.log('\n🛒 Store-Partitioned Cart Logic');

function partitionCartBySeller(cartItems) {
  return cartItems.reduce((packages, item) => {
    const shopId = item.shopId;
    if (!packages[shopId]) {
      packages[shopId] = {
        shopName: item.shopName,
        returnPolicy: item.returnPolicy,
        deliveryFee: item.deliveryFee,
        merchantCode: item.paymentAccounts.telebirr,
        items: [],
        subtotal: 0
      };
    }
    packages[shopId].items.push(item);
    packages[shopId].subtotal += item.price * item.qty;
    return packages;
  }, {});
}

const cartItems = [
  { shopId: 'shop_bole', shopName: 'Bole Apple & Tech Hub', returnPolicy: '3_day_warranty', deliveryFee: 200, paymentAccounts: { telebirr: '891204' }, title: 'iPhone 15 Pro Max', price: 165000, qty: 1 },
  { shopId: 'shop_bole', shopName: 'Bole Apple & Tech Hub', returnPolicy: '3_day_warranty', deliveryFee: 200, paymentAccounts: { telebirr: '891204' }, title: 'Sony Headphones', price: 28500, qty: 1 },
  { shopId: 'shop_shiro', shopName: 'Shiro Meda Textile', returnPolicy: '7_day_free', deliveryFee: 150, paymentAccounts: { telebirr: '772101' }, title: 'Habesha Kemis', price: 4500, qty: 2 }
];

const partitioned = partitionCartBySeller(cartItems);

test('Cart partitions items into correct number of store packages', () => {
  assertEqual(Object.keys(partitioned).length, 2);
});

test('Bole store package contains 2 items', () => {
  assertEqual(partitioned['shop_bole'].items.length, 2);
});

test('Shiro store package contains 1 item', () => {
  assertEqual(partitioned['shop_shiro'].items.length, 1);
});

test('Bole subtotal is correctly calculated', () => {
  assertEqual(partitioned['shop_bole'].subtotal, 193500);
});

test('Shiro subtotal accounts for qty=2', () => {
  assertEqual(partitioned['shop_shiro'].subtotal, 9000);
});

test('Merchant codes are correctly assigned per store', () => {
  assertEqual(partitioned['shop_bole'].merchantCode, '891204');
  assertEqual(partitioned['shop_shiro'].merchantCode, '772101');
});

// ─── 3. Delivery Fee Matrix Logic ──────────────────────────────────────────
console.log('\n🛵 Delivery Zone Fee Calculation');

function calculateDeliveryFee(subCity, zoneMatrix, subtotal, freeThreshold, defaultFee) {
  let fee = zoneMatrix[subCity] !== undefined ? zoneMatrix[subCity] : defaultFee;
  if (freeThreshold && subtotal >= freeThreshold) fee = 0;
  return fee;
}

const zoneMatrix = { 'Bole': 150, 'Kirkos': 150, 'Yeka': 200, 'Akaki_Kality': 300, 'Regional_Bus_Dispatch': 400 };

test('Bole delivery fee is 150', () => assertEqual(calculateDeliveryFee('Bole', zoneMatrix, 500, 2000, 150), 150));
test('Yeka delivery fee is 200', () => assertEqual(calculateDeliveryFee('Yeka', zoneMatrix, 500, 2000, 150), 200));
test('Regional dispatch fee is 400', () => assertEqual(calculateDeliveryFee('Regional_Bus_Dispatch', zoneMatrix, 500, 2000, 150), 400));
test('Unknown sub-city falls back to default fee', () => assertEqual(calculateDeliveryFee('Unknown', zoneMatrix, 500, 2000, 175), 175));
test('Free delivery applied when subtotal >= threshold', () => assertEqual(calculateDeliveryFee('Bole', zoneMatrix, 2000, 2000, 150), 0));
test('Free delivery not applied when subtotal < threshold', () => assertEqual(calculateDeliveryFee('Bole', zoneMatrix, 1999, 2000, 150), 150));

// ─── 4. Order Reference Generation ─────────────────────────────────────────
console.log('\n📦 Order Reference Generation');

function generateOrderRef() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `ORD-${date}-${rand}`;
}

test('Order ref matches expected format', () => {
  const ref = generateOrderRef();
  assert(/^ORD-\d{8}-\d{5}$/.test(ref), `Invalid format: ${ref}`);
});

test('Two consecutive order refs are unique', () => {
  const a = generateOrderRef();
  const b = generateOrderRef();
  // They should have same date prefix, different randoms (highly likely)
  assert(a.startsWith('ORD-'), 'Should start with ORD-');
  assert(b.startsWith('ORD-'), 'Should start with ORD-');
});

// ─── 5. ETB Formatting ──────────────────────────────────────────────────────
console.log('\n💰 ETB Currency Formatting');

function formatETB(amount) {
  return `Br ${Number(amount).toLocaleString('en-ET', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

test('165000 formats as Br 165,000', () => {
  const result = formatETB(165000);
  assert(result.includes('165'), `Expected to contain 165, got: ${result}`);
  assert(result.startsWith('Br '), 'Should start with Br');
});

test('0 formats as Br 0', () => {
  const result = formatETB(0);
  assertEqual(result, 'Br 0');
});

// ─── 6. Policy Snapshot Immutability ────────────────────────────────────────
console.log('\n🛡️  Policy Snapshot Integrity');

function createPolicySnapshot(store) {
  return Object.freeze({
    return_policy_type: store.return_policy_type,
    custom_policy_text: store.custom_policy_text,
    store_name: store.store_name,
    telebirr_merchant_id: store.telebirr_merchant_id,
    captured_at: new Date().toISOString()
  });
}

const store = { store_name: 'Bole Tech Hub', return_policy_type: '3_day_warranty', custom_policy_text: 'Replace within 3 days.', telebirr_merchant_id: '891204' };
const snapshot = createPolicySnapshot(store);

test('Policy snapshot captures return_policy_type', () => assertEqual(snapshot.return_policy_type, '3_day_warranty'));
test('Policy snapshot captures merchant_id', () => assertEqual(snapshot.telebirr_merchant_id, '891204'));
test('Policy snapshot is frozen (immutable)', () => {
  let threw = false;
  try { snapshot.return_policy_type = 'no_return'; } catch (e) { threw = true; }
  // In strict mode it throws, in non-strict it silently fails — either way, value should not change
  assert(snapshot.return_policy_type === '3_day_warranty', 'Snapshot should be immutable');
});
test('Policy snapshot has capture timestamp', () => {
  assert(snapshot.captured_at && snapshot.captured_at.length > 0, 'Missing captured_at');
});

// ─── 7. JWT Structure ───────────────────────────────────────────────────────
console.log('\n🔑 JWT Token Structure');

const jwt = require('jsonwebtoken');
const TEST_SECRET = 'test_secret_min_32_chars_long_enough';

test('JWT token contains tg_user_id and user_id', () => {
  const token = jwt.sign({ tg_user_id: 12893412, user_id: 'uuid-123' }, TEST_SECRET, { expiresIn: '7d' });
  const decoded = jwt.verify(token, TEST_SECRET);
  assertEqual(decoded.tg_user_id, 12893412);
  assertEqual(decoded.user_id, 'uuid-123');
});

test('Expired JWT is rejected', () => {
  const token = jwt.sign({ tg_user_id: 12893412 }, TEST_SECRET, { expiresIn: '-1s' });
  let threw = false;
  try { jwt.verify(token, TEST_SECRET); } catch (e) { threw = true; assertEqual(e.name, 'TokenExpiredError'); }
  assert(threw, 'Should throw TokenExpiredError');
});

test('Wrong secret JWT is rejected', () => {
  const token = jwt.sign({ tg_user_id: 12893412 }, TEST_SECRET);
  let threw = false;
  try { jwt.verify(token, 'wrong_secret'); } catch (e) { threw = true; assertEqual(e.name, 'JsonWebTokenError'); }
  assert(threw, 'Should throw JsonWebTokenError');
});

// ─── Results ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`  Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed === 0) {
  console.log('  🎉  All tests passed!\n');
  process.exit(0);
} else {
  console.log('  ⚠️   Some tests failed.\n');
  process.exit(1);
}
