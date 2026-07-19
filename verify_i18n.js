const fs = require('fs');
const text = fs.readFileSync('i18n_terms.csv', 'utf8');
let f = '', q = false, fields = [], all = [];
for (let c = 0; c < text.length; c++) {
  const ch = text[c];
  if (q) {
    if (ch === '"') {
      if (text[c + 1] === '"') { f += '"'; c++; }
      else q = false;
    } else f += ch;
  } else {
    if (ch === '"') q = true;
    else if (ch === ',') { fields.push(f); f = ''; }
    else if (ch === '\n') { fields.push(f); all.push(fields); fields = []; f = ''; }
    else f += ch;
  }
}
if (fields.length) all.push(fields);

console.log('Total rows (incl header):', all.length);
const short = all.filter(r => { const e = r[1] || ''; return e.length < 4 && /[a-zA-Z]/.test(e); });
console.log('--- rows with English <4 chars containing a letter (potential truncations) ---');
short.forEach(r => console.log(JSON.stringify(r)));
console.log('count:', short.length);
console.log('--- sample rows from different categories ---');
const seen = {};
all.slice(1).forEach(r => { const cat = r[2]; if (!seen[cat]) { seen[cat] = 1; console.log(JSON.stringify(r)); } });
