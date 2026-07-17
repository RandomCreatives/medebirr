/**
 * Cache-buster automation for public/index.html.
 *
 * Vercel serves public/ assets with immutable caching, so every change to a
 * JS/CSS file must bump its ?v= query param or stale code is served forever.
 * This script rewrites ALL ?v= tokens in index.html to a single, consistent
 * value (the short git SHA, falling back to a timestamp when not in a repo)
 * so the bump is automatic and uniform — no more forgetting one script tag.
 *
 * Run: npm run bump-cache   (also wired into `npm run build`)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const INDEX = path.join(__dirname, '..', 'public', 'index.html');

function computeToken() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..') }).toString().trim();
  } catch (_) {
    // Fall back to a UTC date stamp when not inside a git checkout.
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }
}

function main() {
  if (!fs.existsSync(INDEX)) {
    console.error(`index.html not found at ${INDEX}`);
    process.exit(1);
  }
  const token = computeToken();
  let html = fs.readFileSync(INDEX, 'utf8');
  const before = (html.match(/\?v=[\w.-]+/g) || []).length;
  html = html.replace(/\?v=[\w.-]+/g, `?v=${token}`);
  fs.writeFileSync(INDEX, html, 'utf8');
  const after = (html.match(/\?v=[\w.-]+/g) || []).length;
  console.log(`✅ Cache-buster set to v=${token} across ${after} asset reference(s) (was ${before}).`);
}

main();
