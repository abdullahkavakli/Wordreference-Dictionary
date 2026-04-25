/**
 * Tiny DOM i18n applier — runs on DOMContentLoaded and replaces
 * data-i18n[-attr] markers with chrome.i18n.getMessage values.
 *
 *   <span data-i18n="welcomeTagline"></span>
 *   <input data-i18n-placeholder="popupSearchPlaceholder">
 *   <button data-i18n-aria-label="popupOpenInWR">…</button>
 *   <button data-i18n-title="popupAddFavorite">☆</button>
 *
 * Empty/missing translations leave the existing markup untouched.
 */
(() => {
  'use strict';

  function get(key, ...args) {
    if (!key) return '';
    try {
      const v = chrome.i18n.getMessage(key, args.length ? args : undefined);
      return v || '';
    } catch (_) {
      return '';
    }
  }

  function apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const v = get(el.dataset.i18n);
      if (v) el.textContent = v;
    });

    const attrMap = {
      i18nPlaceholder: 'placeholder',
      i18nTitle: 'title',
      i18nAriaLabel: 'aria-label',
      i18nValue: 'value',
      i18nAlt: 'alt'
    };
    for (const [dataKey, attr] of Object.entries(attrMap)) {
      document.querySelectorAll(`[data-${dataKey.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}]`).forEach(el => {
        const v = get(el.dataset[dataKey]);
        if (v) el.setAttribute(attr, v);
      });
    }

    document.documentElement.lang = (chrome.i18n.getUILanguage() || 'en').split('-')[0];

    const titleEl = document.querySelector('title[data-i18n]');
    if (titleEl) {
      const v = get(titleEl.dataset.i18n);
      if (v) document.title = v;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
