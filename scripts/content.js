/**
 * WordReference Dictionary Extension
 * Copyright (c) 2026 Abdullah Kavakli. All rights reserved.
 * Proprietary License. Unauthorized redistribution prohibited.
 */
(() => {
  'use strict';

  const POPUP_ID = 'wr-selection-popup';
  const STYLE_ID = 'wr-selection-style';
  const MAX_ROWS = 6;
  const WR_BASE = 'https://www.wordreference.com';

  // ── Settings ────────────────────────────────────────────────────────────────

  const defaultSettings = {
    modifier: 'alt',
    ipaDialect: 'us',
    langPair: 'tr',
    portugueseDialect: 'pt-PT',
    shortcutKey: 'q',
    shortcutKey2: 'x',
    popupShortcutKey: 'z'
  };
  let settings = { ...defaultSettings };

  function loadSettings() {
    chrome.storage.sync.get(defaultSettings, stored => {
      settings = { ...defaultSettings, ...stored };
    });
  }

  // ── Styles ───────────────────────────────────────────────────────────────────

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${POPUP_ID} {
        position: absolute;
        z-index: 2147483647;
        background: #fff;
        color: #222;
        border: 1px solid #c8d4e8;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,.16);
        padding: 10px 14px;
        min-width: 260px;
        max-width: 380px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
        font-size: 13px;
        line-height: 1.4;
      }
      #${POPUP_ID} .wr-hd {
        font-weight: 700;
        color: #15437e;
        margin-bottom: 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #${POPUP_ID} .wr-hd a {
        font-size: 11px;
        color: #1a73e8;
        text-decoration: none;
        font-weight: 400;
      }
      #${POPUP_ID} .wr-hd a:hover { text-decoration: underline; }
      #${POPUP_ID} .wr-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px 10px;
        padding: 3px 0;
        border-top: 1px solid #f0f0f0;
      }
      #${POPUP_ID} .wr-row:first-of-type { border-top: none; }
      #${POPUP_ID} .wr-from { font-weight: 600; }
      #${POPUP_ID} .wr-pos  { font-size: 11px; color: #888; }
      #${POPUP_ID} .wr-err  { color: #b00020; }
      #${POPUP_ID} .wr-load { color: #555; }
      #${POPUP_ID} .wr-more { display:block; margin-top:6px; font-size:11px; color:#1a73e8; text-decoration:none; }
      #${POPUP_ID} .wr-more:hover { text-decoration:underline; }
      #${POPUP_ID} .wr-ipa { font-size: 12px; color: #666; font-style: italic; font-weight: 400; margin-left: 4px; }
    `;
    document.head.appendChild(style);
  }

  // ── Popup DOM ────────────────────────────────────────────────────────────────

  function removePopup() {
    const el = document.getElementById(POPUP_ID);
    if (el) el.remove();
  }

  function createPopup(pos) {
    removePopup();
    ensureStyles();
    const popup = document.createElement('div');
    popup.id = POPUP_ID;
    popup.style.left = `${Math.max(8, pos.x)}px`;
    popup.style.top = `${Math.max(8, pos.y)}px`;
    popup.innerHTML = `<div class="wr-load">Searching…</div>`;
    document.body.appendChild(popup);
    return popup;
  }

  // ── Selection helpers ────────────────────────────────────────────────────────

  function getSelectionText() {
    const sel = window.getSelection();
    return sel ? sel.toString().trim() : '';
  }

  function getSelectionPosition() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { x: 16, y: 16 };
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    return {
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 8
    };
  }

  // ── Language detection ───────────────────────────────────────────────────────

  function detectTargetLanguageDir(str, lang) {
    const t = str.toLowerCase();
    switch (lang) {
      case 'tr': return /[ğüşıöç]/.test(t) ? 'tren' : 'entr';
      case 'es': return /[áéíóúüñ¿¡]/.test(t) ? 'esen' : 'enes';
      case 'it': return /[àèìîòù]/.test(t) ? 'iten' : 'enit';
      case 'pt': return /[ãõáéíóúâêôç]/.test(t) ? 'pten' : 'enpt';
      case 'fr': return /[éèêëàâîïôûùüÿçœæ]/.test(t) ? 'fren' : 'enfr';
      case 'de': return /[äöüß]/.test(t) ? 'deen' : 'ende';
      case 'nl': return /[ëïé]/.test(t) ? 'nlen' : 'ennl';
      case 'sv': return /[åäö]/.test(t) ? 'sven' : 'ensv';
      case 'ar': return /[\u0600-\u06FF]/.test(str) ? 'aren' : 'enar';
      case 'zh': return /[\u4E00-\u9FFF]/.test(str) ? 'zhen' : 'enzh';
      case 'ru': return /[\u0400-\u04FF]/.test(str) ? 'ruen' : 'enru';
      case 'gr': return /[\u0370-\u03FF]/.test(str) ? 'gren' : 'engr';
      case 'pl': return /[ąćęłńóśźż]/.test(t) ? 'plen' : 'enpl';
      case 'ro': return /[ăâîșț]/.test(t) ? 'roen' : 'enro';
      case 'cz': return /[áčďéěíňóřšťúůýž]/.test(t) ? 'czen' : 'encz';
      case 'ja': return /[\u3040-\u30FF\u4E00-\u9FFF]/.test(str) ? 'jaen' : 'enja';
      case 'ko': return /[\uAC00-\uD7AF\u3130-\u318F]/.test(str) ? 'koen' : 'enko';
      case 'is': return /[áéíóúýðþæö]/.test(t) ? 'isen' : 'enis';
      default: return 'entr';
    }
  }

  function resolveDir(str) {
    return detectTargetLanguageDir(str, settings.langPair);
  }

  // ── Parser ───────────────────────────────────────────────────────────────────

  function parseWR(doc) {
    const table = doc.querySelector('table#WRD, table.WRD');
    if (!table) return [];

    const rows = [];
    let entry = null;

    for (const row of table.querySelectorAll('tr')) {
      const frCell = row.querySelector('td.FrWrd');
      const toCell = row.querySelector('td.ToWrd');
      if (!toCell) continue;

      const getWord = cell => {
        const c = cell.cloneNode(true);
        c.querySelectorAll('em, sup, .tooltip').forEach(e => e.remove());
        return c.textContent.replace(/\s+/g, ' ').trim();
      };
      const getPos = cell => {
        const em = cell.querySelector('em.POS2, em');
        return em ? em.textContent.trim() : '';
      };

      const toWord = getWord(toCell);
      const toPos = getPos(toCell);

      if (frCell) {
        entry = { from: getWord(frCell), fromPos: getPos(frCell), translations: [] };
        rows.push(entry);
      }
      if (entry && toWord) {
        entry.translations.push({ word: toWord, pos: toPos });
      }
    }
    return rows;
  }

  // ── IPA extraction ───────────────────────────────────────────────────────────

  function extractIPA(doc) {
    const dialect = settings.ipaDialect || 'us';

    function readPronSpan(el) {
      const clone = el.cloneNode(true);
      // Remove tooltip inner spans, keep <i>/<sup> which hold IPA chars
      clone.querySelectorAll('span').forEach(s => s.remove());
      return clone.textContent.trim();
    }

    // UK IPA: span.pronWR
    let ukIPA = null;
    const ukEl = doc.querySelector('span.pronWR');
    if (ukEl) ukIPA = readPronSpan(ukEl) || null;

    // US IPA: span.pronRH where text starts with / (not the respelling variant)
    let usIPA = null;
    for (const el of doc.querySelectorAll('span.pronRH')) {
      const t = readPronSpan(el);
      if (t.startsWith('/')) { usIPA = t; break; }
    }

    if (dialect === 'us') return usIPA || ukIPA;
    return ukIPA || usIPA;
  }

  // ── Fetch + show ─────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Stream the response and stop as soon as the WRD table is complete.
  // WR pages are 200–400 KB but the IPA + translation table are in the first ~30 KB.
  async function fetchWRPage(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        const wrdIdx = html.search(/id=["']WRD["']/);
        if (wrdIdx !== -1) {
          const tableClose = html.indexOf('</table>', wrdIdx);
          if (tableClose !== -1) {
            html = html.slice(0, tableClose + 8);
            break;
          }
        }
        if (html.length > 80000) break; // safety cap
      }
    } finally {
      reader.cancel().catch(() => { });
    }
    return html;
  }

  async function showPopupForSelection() {
    const term = getSelectionText();
    if (!term || term.length < 2) return;

    const popup = createPopup(getSelectionPosition());
    const dir = resolveDir(term);
    const url = `${WR_BASE}/${dir}/${encodeURIComponent(term)}`;

    try {
      const html = await fetchWRPage(url);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const rows = parseWR(doc);

      if (!rows.length) {
        popup.innerHTML = `<div class="wr-err">No results for "<strong>${escapeHtml(term)}</strong>".</div>`;
        return;
      }

      const displayRows = rows.slice(0, MAX_ROWS);
      const hasMore = rows.length > MAX_ROWS;

      // Render translations immediately, leave IPA placeholder empty
      popup.innerHTML = `
        <div class="wr-hd">
          <span>${escapeHtml(term)}<span class="wr-ipa" id="wr-ipa-inline"></span></span>
          <a href="${url}" target="_blank" rel="noopener">Open WR ↗</a>
        </div>
        ${displayRows.map(e => `
          <div class="wr-row">
            <div class="wr-from">
              ${escapeHtml(e.from)}
              ${e.fromPos ? `<span class="wr-pos"> (${escapeHtml(e.fromPos)})</span>` : ''}
            </div>
            <div>
              ${e.translations.slice(0, 2).map(t =>
        `${escapeHtml(t.word)}${t.pos ? ` <span class="wr-pos">(${escapeHtml(t.pos)})</span>` : ''}`
      ).join(', ')}
            </div>
          </div>`).join('')}
        ${hasMore ? `<a class="wr-more" href="${url}" target="_blank" rel="noopener">See all ${rows.length} results on WordReference.com…</a>` : ''}
      `;

      // Extract IPA after browser has painted the translations
      queueMicrotask(() => {
        const ipa = extractIPA(doc);
        const ipaEl = document.getElementById('wr-ipa-inline');
        if (ipa && ipaEl) ipaEl.textContent = ipa;
      });
    } catch (_) {
      popup.innerHTML = `<div class="wr-err">Failed to fetch results.</div>`;
    }
  }

  // ── Event wiring ─────────────────────────────────────────────────────────────

  function matchesModifier(event) {
    switch (settings.modifier) {
      case 'none': return !event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey;
      case 'ctrl': return event.ctrlKey;
      case 'shift': return event.shiftKey;
      case 'meta': return event.metaKey;
      case 'alt':
      default: return event.altKey;
    }
  }

  document.addEventListener('dblclick', event => {
    if (!matchesModifier(event)) return;
    const term = getSelectionText();
    if (term && term.length >= 2) showPopupForSelection();
  });

  document.addEventListener('keydown', event => {
    if (!event.key) return;  // guard against synthetic/IME events with no key
    if (event.key === 'Escape') {
      removePopup();
      return;
    }
    // In-page translation shortcuts (customizable)
    const sKey = (settings.shortcutKey || 'q').toLowerCase();
    const sKey2 = (settings.shortcutKey2 || 'x').toLowerCase();
    const pKey = (settings.popupShortcutKey || 'z').toLowerCase();
    const pressed = typeof event.key === 'string' ? event.key.toLowerCase() : '';

    if (!pressed) return;

    if (event.altKey && pressed === pKey) {
      event.preventDefault();
      chrome.runtime.sendMessage({ type: 'WR_OPEN_POPUP' });
      return;
    }
    if (event.altKey && (pressed === sKey || pressed === sKey2)) {
      const term = getSelectionText();
      if (term && term.length >= 2) {
        event.preventDefault();
        showPopupForSelection();
      }
    }
  });

  document.addEventListener('click', event => {
    const popup = document.getElementById(POPUP_ID);
    if (popup && !popup.contains(event.target)) removePopup();
  });

  chrome.runtime.onMessage.addListener(msg => {
    if (msg && msg.type === 'WR_SHOW_POPUP') showPopupForSelection();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.modifier) settings.modifier = changes.modifier.newValue;
    if (changes.ipaDialect) settings.ipaDialect = changes.ipaDialect.newValue;
    if (changes.langPair) settings.langPair = changes.langPair.newValue;
    if (changes.shortcutKey) settings.shortcutKey = changes.shortcutKey.newValue;
    if (changes.shortcutKey2) settings.shortcutKey2 = changes.shortcutKey2.newValue;
    if (changes.popupShortcutKey) settings.popupShortcutKey = changes.popupShortcutKey.newValue;
  });

  loadSettings();
})();
