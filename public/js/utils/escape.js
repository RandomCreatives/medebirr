/* ═══════════════════════════════════════════════════
   HTML escaping utilities — global `esc` for template literals
   ─────────────────────────────────────────────────────────────
   WHY: every view renders via template literals into innerHTML.
   Any seller/buyer-controlled string (product titles, store names,
   addresses, rider names, chat messages, payment account numbers…)
   interpolated RAW is a stored-XSS sink — and our JWT lives in
   localStorage, so one payload = account takeover.

   RULE: any `${value}` whose content comes from the database or
   user input MUST be wrapped:  ${esc(value)}
   Numbers from State.formatETB, server-generated refs (ORD-…),
   UUIDs and enum statuses are safe by format.

   UMD: also importable from Node tests.
═══════════════════════════════════════════════════ */
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  Object.assign(root, lib);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Escape text for insertion into HTML element content or
      double-quoted attribute values. Also neutralizes backticks
      (attr-breakout in unquoted contexts) and single quotes. */
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/`/g, '&#96;');
  }

  /** Attribute-safe alias (esc already covers quotes/backticks). */
  function escAttr(str) {
    return esc(str);
  }

  /**
   * Sanitize a URL for src/href/CSS url() contexts.
   * Allows http(s), data:image/*, blob:, and relative paths.
   * Anything else (javascript:, data:text/html, vbscript:, quotes,
   * parens that could break out of a CSS url('…') wrapper) → ''.
   */
  function escUrl(url) {
    if (!url) return '';
    const u = String(url).trim();
    if (/["'()<>\s]/.test(u.replace(/%20/gi, ''))) return '';
    if (/^(https?:\/\/|data:image\/|blob:|\.\/|\/|images\/|[^:/]+\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$)/i.test(u)) {
      return u;
    }
    return '';
  }

  return { esc, escAttr, escUrl };
});
