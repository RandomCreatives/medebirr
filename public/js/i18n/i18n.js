/* e-Merkato i18n loader
 * Exposes window.I18n with a t(key, vars) helper.
 * Locale maps (I18N_en, I18N_am, I18N_or) are loaded as separate scripts
 * before this file in index.html.
 */
(function () {
  const locales = {
    en: window.I18N_en || {},
    am: window.I18N_am || {},
    or: window.I18N_or || {}
  };

  function interpolate(str, vars) {
    if (!vars || typeof str !== 'string') return str;
    return str.replace(/\$\{[\s]*([\w.]+)[\s]*\}/g, (m, path) => {
      const val = path.split('.').reduce((o, k) => (o == null ? o : o[k]), vars);
      return val != null ? val : m;
    });
  }

  function t(key, vars) {
    const lang = (window.State && window.State.language) || 'en';
    const locale = locales[lang] || locales.en;
    const val = locale[key] != null && locale[key] !== '' ? locale[key] : (locales.en[key] != null ? locales.en[key] : key);
    return interpolate(val, vars);
  }

  window.I18n = { locales, t, interpolate };
})();
