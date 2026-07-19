/* Delta generator for i18n.
 * Scans public/js for translation calls (State.t('key'), t('key'), I18n.t('key'))
 * and emits a CSV of keys that are MISSING or EMPTY in public/js/i18n/am.js.
 * This is the "new words since last translation" batch — small and focused.
 *
 * Usage: node scripts/gen-i18n-csv.js
 * Output: i18n_terms_delta.csv  (Key,English,Category,Context,Amharic,Technical)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT, 'public', 'js');
const EN_FILE = path.join(ROOT, 'public', 'js', 'i18n', 'en.js');
const AM_FILE = path.join(ROOT, 'public', 'js', 'i18n', 'am.js');
const CSV_FILE = path.join(ROOT, 'i18n_terms_delta.csv');

// Load en + am locale maps
function loadLocale(file) {
  const map = {};
  if (!fs.existsSync(file)) return map;
  const src = fs.readFileSync(file, 'utf8');
  const re = /'([^']+)'\s*:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(src))) map[m[1]] = m[2];
  return map;
}
const en = loadLocale(EN_FILE);
const am = loadLocale(AM_FILE);

// Scan source files for t('key') usage
const used = new Set();
const keyRe = /(?:\bState\.t|\bI18n\.t|\bt)\(\s*'([^']+)'/g;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'i18n') walk(p); }
    else if (e.name.endsWith('.js') && e.name !== 'en.js' && e.name !== 'am.js' && e.name !== 'i18n.js') {
      const src = fs.readFileSync(p, 'utf8');
      let m;
      while ((m = keyRe.exec(src))) used.add(m[1]);
    }
  }
}
walk(JS_DIR);

// Build delta: used keys not present / empty in am.js
let csv = 'Key,English,Category,Context,Amharic,Technical\n';
let missing = 0;
const catOf = (k) => k.split('.')[0] || 'shared';
for (const key of [...used].sort()) {
  const amVal = am[key];
  const enVal = en[key];
  if (amVal == null || amVal === '') {
    const enText = enVal != null ? enVal : key;
    const cat = catOf(key);
    const ctx = 'auto-detected from code';
    const tech = ['general'].includes(cat) ? 'Yes' : 'No';
    const esc = (s) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
    csv += [key, enText, cat, ctx, '', tech].map(esc).join(',') + '\n';
    missing++;
  }
}
fs.writeFileSync(CSV_FILE, csv, 'utf8');
console.log(`Scanned ${used.size} used keys. Missing/empty in am.js: ${missing}`);
console.log(`Wrote ${CSV_FILE}`);
