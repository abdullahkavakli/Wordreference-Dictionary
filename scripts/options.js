(() => {
  'use strict';

  const defaultSettings = {
    modifier: 'alt',
    ipaDialect: 'us',
    langPair: 'tr',
    spanishDialect: 'es-ES',
    portugueseDialect: 'pt-PT',
    shortcutModifier: 'alt',
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
  const shortcutModifierSelect = document.getElementById('shortcut-modifier-select');
  const statusEl        = document.getElementById('status');
  const ipaStatusEl     = document.getElementById('ipa-status');
  const shortcutStatus   = document.getElementById('shortcut-status');
  const shortcut2Status  = document.getElementById('shortcut2-status');
  const popupShortcutStatus = document.getElementById('popup-shortcut-status');
  const shortcutModifierStatus = document.getElementById('shortcut-modifier-status');
  const shortcutDisps    = document.querySelectorAll('.shortcut-key-display');
  const shortcut2Disps   = document.querySelectorAll('.shortcut-key2-display');
  const popupShortcutDisps = document.querySelectorAll('.popup-shortcut-key-display');
  const shortcutModifierDisps = document.querySelectorAll('.shortcut-modifier-display');
  const favoritesListEl = document.getElementById('favorites-list');
  const favoritesCountEl = document.getElementById('favorites-count');
  const favoritesExportBtn = document.getElementById('favorites-export-btn');
  const favoritesClearBtn = document.getElementById('favorites-clear-btn');
  const favoritesStatusEl = document.getElementById('favorites-status');

  let favoritesCache = [];

  function modifierLabel(value) {
    switch (value) {
      case 'ctrl': return 'Ctrl';
      case 'shift': return 'Shift';
      case 'meta': return 'Meta';
      case 'none': return 'No modifier';
      case 'alt':
      default: return 'Alt';
    }
  }

  function renderShortcutModifier(value) {
    const label = modifierLabel(value);
    shortcutModifierDisps.forEach(el => { el.textContent = label; });
  }

  function showSaved(el) {
    const target = el || statusEl;
    target.style.display = 'inline';
    clearTimeout(showSaved._t);
    showSaved._t = setTimeout(() => { target.style.display = 'none'; }, 1400);
  }

  function showFavoritesStatus(text, isError = false) {
    if (!favoritesStatusEl) return;
    favoritesStatusEl.textContent = text || '';
    favoritesStatusEl.style.color = isError ? '#b00020' : '#2e7d32';
    favoritesStatusEl.style.display = text ? 'inline' : 'none';
    clearTimeout(showFavoritesStatus._t);
    if (text) {
      showFavoritesStatus._t = setTimeout(() => {
        favoritesStatusEl.style.display = 'none';
      }, 1800);
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getDirLabel(dir) {
    const code = String(dir || '').trim().toLowerCase();
    if (code === 'definition') return 'English definition';

    const labels = {
      tr: 'Turkish', es: 'Spanish', it: 'Italian', pt: 'Portuguese',
      fr: 'French', de: 'German', nl: 'Dutch', sv: 'Swedish',
      ar: 'Arabic', zh: 'Chinese', ru: 'Russian', gr: 'Greek',
      pl: 'Polish', ro: 'Romanian', cz: 'Czech', ja: 'Japanese',
      ko: 'Korean', is: 'Icelandic'
    };

    const fwd = code.match(/^en([a-z]{2})$/);
    if (fwd && labels[fwd[1]]) return `English -> ${labels[fwd[1]]}`;
    const rev = code.match(/^([a-z]{2})en$/);
    if (rev && labels[rev[1]]) return `${labels[rev[1]]} -> English`;
    return code || 'Unknown';
  }

  function formatDate(ts) {
    const num = Number(ts);
    if (!num) return '-';
    try {
      return new Date(num).toLocaleString();
    } catch (_) {
      return '-';
    }
  }

  function updateFavoritesButtons() {
    const hasItems = favoritesCache.length > 0;
    if (favoritesExportBtn) favoritesExportBtn.disabled = !hasItems;
    if (favoritesClearBtn) favoritesClearBtn.disabled = !hasItems;
  }

  async function renderFavorites() {
    if (!favoritesListEl || !window.WRFavorites) return;

    try {
      favoritesCache = await window.WRFavorites.listFavorites();
      if (favoritesCountEl) {
        favoritesCountEl.textContent = favoritesCache.length
          ? `${favoritesCache.length} favorite${favoritesCache.length === 1 ? '' : 's'} saved.`
          : 'No favorites yet.';
      }

      if (!favoritesCache.length) {
        favoritesListEl.innerHTML = '<div class="favorite-item">No favorites saved yet.</div>';
        updateFavoritesButtons();
        return;
      }

      favoritesListEl.innerHTML = favoritesCache.map(item => `
        <div class="favorite-item">
          <div>
            <div class="favorite-head">
              <span class="favorite-word">${escapeHtml(item.word)}</span>
              <span class="favorite-ipa">${escapeHtml(item.ipa || '')}</span>
            </div>
            <div>${escapeHtml(item.explanation || '(No explanation available)')}</div>
            <div class="favorite-meta">${escapeHtml(getDirLabel(item.dir))} · ${escapeHtml(formatDate(item.createdAt))}</div>
          </div>
          <button type="button" class="favorite-delete" data-favorite-delete="${escapeHtml(item.id)}">Delete</button>
        </div>
      `).join('');

      updateFavoritesButtons();
    } catch (_) {
      favoritesListEl.innerHTML = '<div class="favorite-item">Could not load favorites.</div>';
      favoritesCache = [];
      updateFavoritesButtons();
    }
  }

  function buildExportRows(items) {
    function pickExplanation(item) {
      return String(
        item.explanation ||
        item.definition ||
        item.meaning ||
        item.gloss ||
        ''
      ).trim();
    }

    return items.map(item => ({
      Word: item.word || '',
      IPA: item.ipa || '',
      Explanation: pickExplanation(item)
    }));
  }

  function downloadFavoritesAsXlsx(items) {
    if (!window.XLSX) throw new Error('XLSX library unavailable');
    const rows = buildExportRows(items);
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 26 },
      { wch: 20 },
      { wch: 60 }
    ];
    window.XLSX.utils.book_append_sheet(wb, ws, 'Favorites');

    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    window.XLSX.writeFile(wb, `wr-favorites-${stamp}.xlsx`);
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
    if (shortcutModifierSelect) {
      shortcutModifierSelect.value = (stored && stored.shortcutModifier) ? stored.shortcutModifier : defaultSettings.shortcutModifier;
    }
    renderShortcutModifier(((stored && stored.shortcutModifier) || defaultSettings.shortcutModifier));
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

  if (shortcutModifierSelect) {
    shortcutModifierSelect.addEventListener('change', () => {
      chrome.storage.sync.set({ shortcutModifier: shortcutModifierSelect.value }, () => {
        showSaved(shortcutModifierStatus);
        renderShortcutModifier(shortcutModifierSelect.value);
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

  if (favoritesListEl) {
    favoritesListEl.addEventListener('click', async event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const deleteBtn = target.closest('[data-favorite-delete]');
      if (!deleteBtn) return;

      const id = deleteBtn.getAttribute('data-favorite-delete');
      if (!id || !window.WRFavorites) return;

      deleteBtn.setAttribute('disabled', 'disabled');
      try {
        await window.WRFavorites.removeFavorite(id);
        showFavoritesStatus('Deleted');
        await renderFavorites();
      } catch (_) {
        showFavoritesStatus('Delete failed', true);
      }
    });
  }

  if (favoritesClearBtn) {
    favoritesClearBtn.addEventListener('click', async () => {
      if (!window.WRFavorites || favoritesCache.length === 0) return;
      if (!window.confirm('Clear all favorites?')) return;

      try {
        await window.WRFavorites.clearFavorites();
        showFavoritesStatus('All favorites cleared');
        await renderFavorites();
      } catch (_) {
        showFavoritesStatus('Clear failed', true);
      }
    });
  }

  if (favoritesExportBtn) {
    favoritesExportBtn.addEventListener('click', async () => {
      if (!window.WRFavorites) return;

      try {
        if (!favoritesCache.length) {
          favoritesCache = await window.WRFavorites.listFavorites();
        }
        if (!favoritesCache.length) {
          showFavoritesStatus('No favorites to export', true);
          return;
        }

        downloadFavoritesAsXlsx(favoritesCache);
        showFavoritesStatus('Excel exported');
      } catch (_) {
        showFavoritesStatus('Export failed', true);
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.favorites) {
      renderFavorites();
    }
  });

  renderFavorites();
})();
