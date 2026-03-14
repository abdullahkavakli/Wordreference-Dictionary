(() => {
  'use strict';

  const defaultSettings = {
    modifier: 'alt',
    ipaDialect: 'us',
    langPair: 'tr',
    spanishDialect: 'es-ES',
    portugueseDialect: 'pt-PT',
    shortcutKey: 'q',
    shortcutKey2: 'x',
    popupShortcutKey: 'z'
  };
  const select             = document.getElementById('modifier-select');
  const ipaSelect          = document.getElementById('ipa-dialect-select');
  const langPairSelect     = document.getElementById('lang-pair-select');
  const langPairStatus     = document.getElementById('lang-pair-status');
  const spanishSelect      = document.getElementById('spanish-dialect-select');
  const spanishStatus      = document.getElementById('spanish-dialect-status');
  const portugueseSelect   = document.getElementById('portuguese-dialect-select');
  const portugueseStatus   = document.getElementById('portuguese-dialect-status');
  const shortcutSelect   = document.getElementById('shortcut-key-select');
  const shortcut2Select  = document.getElementById('shortcut-key2-select');
  const popupShortcutSelect = document.getElementById('popup-shortcut-key-select');
  const statusEl        = document.getElementById('status');
  const ipaStatusEl     = document.getElementById('ipa-status');
  const shortcutStatus   = document.getElementById('shortcut-status');
  const shortcut2Status  = document.getElementById('shortcut2-status');
  const popupShortcutStatus = document.getElementById('popup-shortcut-status');
  const shortcutDisps    = document.querySelectorAll('.shortcut-key-display');
  const shortcut2Disps   = document.querySelectorAll('.shortcut-key2-display');
  const popupShortcutDisps = document.querySelectorAll('.popup-shortcut-key-display');

  function showSaved(el) {
    const target = el || statusEl;
    target.style.display = 'inline';
    clearTimeout(showSaved._t);
    showSaved._t = setTimeout(() => { target.style.display = 'none'; }, 1400);
  }

  chrome.storage.sync.get(defaultSettings, stored => {
    select.value    = (stored && stored.modifier)    ? stored.modifier    : defaultSettings.modifier;
    ipaSelect.value = (stored && stored.ipaDialect)  ? stored.ipaDialect  : defaultSettings.ipaDialect;
    if (langPairSelect) {
      langPairSelect.value = (stored && stored.langPair) ? stored.langPair : defaultSettings.langPair;
    }
    if (spanishSelect) {
      spanishSelect.value = (stored && stored.spanishDialect) ? stored.spanishDialect : defaultSettings.spanishDialect;
    }
    if (portugueseSelect) {
      portugueseSelect.value = (stored && stored.portugueseDialect) ? stored.portugueseDialect : defaultSettings.portugueseDialect;
    }
    if (shortcutSelect) {
      shortcutSelect.value = (stored && stored.shortcutKey) ? stored.shortcutKey : defaultSettings.shortcutKey;
    }
    shortcutDisps.forEach(el => {
      el.textContent = ((stored && stored.shortcutKey) || defaultSettings.shortcutKey).toUpperCase();
    });
    if (shortcut2Select) {
      shortcut2Select.value = (stored && stored.shortcutKey2) ? stored.shortcutKey2 : defaultSettings.shortcutKey2;
    }
    shortcut2Disps.forEach(el => {
      el.textContent = ((stored && stored.shortcutKey2) || defaultSettings.shortcutKey2).toUpperCase();
    });
    if (popupShortcutSelect) {
      popupShortcutSelect.value = (stored && stored.popupShortcutKey) ? stored.popupShortcutKey : defaultSettings.popupShortcutKey;
    }
    popupShortcutDisps.forEach(el => {
      el.textContent = ((stored && stored.popupShortcutKey) || defaultSettings.popupShortcutKey).toUpperCase();
    });
  });

  select.addEventListener('change', () => {
    chrome.storage.sync.set({ modifier: select.value }, () => showSaved(statusEl));
  });

  ipaSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ ipaDialect: ipaSelect.value }, () => showSaved(ipaStatusEl));
  });

  if (langPairSelect) {
    langPairSelect.addEventListener('change', () => {
      chrome.storage.sync.set({ langPair: langPairSelect.value }, () => showSaved(langPairStatus));
    });
  }

  if (spanishSelect) {
    spanishSelect.addEventListener('change', () => {
      chrome.storage.sync.set({ spanishDialect: spanishSelect.value }, () => showSaved(spanishStatus));
    });
  }

  if (portugueseSelect) {
    portugueseSelect.addEventListener('change', () => {
      chrome.storage.sync.set({ portugueseDialect: portugueseSelect.value }, () => showSaved(portugueseStatus));
    });
  }

  if (shortcutSelect) {
    shortcutSelect.addEventListener('change', () => {
      chrome.storage.sync.set({ shortcutKey: shortcutSelect.value }, () => {
        showSaved(shortcutStatus);
        shortcutDisps.forEach(el => { el.textContent = shortcutSelect.value.toUpperCase(); });
      });
    });
  }

  if (shortcut2Select) {
    shortcut2Select.addEventListener('change', () => {
      chrome.storage.sync.set({ shortcutKey2: shortcut2Select.value }, () => {
        showSaved(shortcut2Status);
        shortcut2Disps.forEach(el => { el.textContent = shortcut2Select.value.toUpperCase(); });
      });
    });
  }

  if (popupShortcutSelect) {
    popupShortcutSelect.addEventListener('change', () => {
      chrome.storage.sync.set({ popupShortcutKey: popupShortcutSelect.value }, () => {
        showSaved(popupShortcutStatus);
        popupShortcutDisps.forEach(el => { el.textContent = popupShortcutSelect.value.toUpperCase(); });
      });
    });
  }
})();
