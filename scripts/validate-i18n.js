/**
 * Validate that every State.t('key') used in public/js resolves to a
 * key present in the canonical English locale (en.js).
 * Exit code 1 if any key is missing — for CI / pre-commit.
 * Usage: node scripts/validate-i18n.js
 */
const fs = require('fs');
const path = require('path');

// Load en.js keys into a Set
const enSrc = fs.readFileSync(path.resolve(__dirname, '..', 'public/js/i18n/en.js'), 'utf8');
const catalogKeys = new Set();
const keyRe = /'([^']+)'\s*:/g;
let m;
while ((m = keyRe.exec(enSrc))) catalogKeys.add(m[1]);

// Scan every .js (except i18n/) for State.t('...')
const jsDir = path.resolve(__dirname, '..', 'public/js');
const usedKeys = new Set();
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'i18n') walk(p); }
    else if (e.name.endsWith('.js')) {
      const code = fs.readFileSync(p, 'utf8');
      const callRe = /State\.t\('([^']+)'/g;
      let match;
      while ((match = callRe.exec(code))) usedKeys.add(match[1]);
    }
  }
}
walk(jsDir);

let errors = 0;
for (const key of [...usedKeys].sort()) {
  if (!catalogKeys.has(key)) {
    console.error('❌ State.t(\'' + key + '\') used but NOT in en.js catalog');
    errors++;
  }
}
if (errors) {
  console.error(`\n${errors} missing key(s) found. Add them to gen_i18n.js then run node gen_i18n.js`);
  process.exit(1);
} else {
  console.log(`✅ All ${usedKeys.size} State.t() keys resolve to the en.js catalog`);
}
