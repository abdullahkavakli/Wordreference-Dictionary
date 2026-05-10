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
  const FETCH_TIMEOUT_MS = 3400;
  const FETCH_BACKOFF_MS = 300;
  const HEDGE_OFFSETS_MS = [0, 1100, 1700];

  function buildFavoritesApiFallback() {
    const STORAGE_KEY = 'favorites';
    const SCHEMA_VERSION = 1;
    const MAX_FAVORITES = 5000;

    function normalizeWord(word) {
      return String(word || '').trim().toLowerCase();
    }

    function normalizeDir(dir) {
      return String(dir || '').trim().toLowerCase();
    }

    function makeFavoriteId(word, dir) {
      return `${normalizeDir(dir)}::${normalizeWord(word)}`;
    }

    function storageGet(query) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(query, result => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(result || {});
        });
      });
    }

    function storageSet(values) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set(values, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      });
    }

    function normalizeItem(item) {
      if (!item || typeof item !== 'object') return null;
      const word = String(item.word || '').trim();
      const dir = String(item.dir || '').trim();
      if (!word || !dir) return null;
      return {
        id: item.id || makeFavoriteId(word, dir),
        word,
        ipa: String(item.ipa || '').trim(),
        explanation: String(item.explanation || '').trim(),
        dir,
        langPair: String(item.langPair || '').trim(),
        source: String(item.source || '').trim(),
        url: String(item.url || '').trim(),
        createdAt: Number(item.createdAt) || Date.now()
      };
    }

    async function readStore() {
      const defaults = { [STORAGE_KEY]: { schemaVersion: SCHEMA_VERSION, items: [] } };
      const result = await storageGet(defaults);
      let store = result[STORAGE_KEY];

      if (Array.isArray(store)) {
        store = { schemaVersion: SCHEMA_VERSION, items: store };
      }

      if (!store || typeof store !== 'object') {
        store = { schemaVersion: SCHEMA_VERSION, items: [] };
      }

      if (!Array.isArray(store.items)) store.items = [];
      if (store.schemaVersion !== SCHEMA_VERSION) store.schemaVersion = SCHEMA_VERSION;

      const deduped = [];
      const seen = new Set();
      for (const raw of store.items) {
        const item = normalizeItem(raw);
        if (!item || seen.has(item.id)) continue;
        seen.add(item.id);
        deduped.push(item);
      }
      deduped.sort((a, b) => b.createdAt - a.createdAt);
      if (deduped.length > MAX_FAVORITES) deduped.length = MAX_FAVORITES;
      store.items = deduped;
      return store;
    }

    async function writeStore(store) {
      await storageSet({ [STORAGE_KEY]: store });
    }

    async function isFavoriteId(id) {
      const store = await readStore();
      return store.items.some(item => item.id === id);
    }

    async function addFavorite(candidate) {
      const item = normalizeItem(candidate);
      if (!item) throw new Error('Invalid favorite data');
      const store = await readStore();
      const existing = store.items.find(entry => entry.id === item.id);
      if (existing) return { added: false, item: existing };
      store.items.unshift(item);
      if (store.items.length > MAX_FAVORITES) {
        store.items.length = MAX_FAVORITES;
      }
      await writeStore(store);
      return { added: true, item };
    }

    async function removeFavorite(id) {
      const store = await readStore();
      const next = store.items.filter(item => item.id !== id);
      if (next.length === store.items.length) return false;
      store.items = next;
      await writeStore(store);
      return true;
    }

    return {
      makeFavoriteId,
      isFavoriteId,
      addFavorite,
      removeFavorite
    };
  }

  const favoritesApi = window.WRFavorites || buildFavoritesApiFallback();

  // ── Settings ────────────────────────────────────────────────────────────────

  const defaultSettings = {
    modifier: 'alt',
    ipaDialect: 'us',
    langPair: 'tr',
    portugueseDialect: 'pt-PT',
    shortcutModifier: 'alt',
    shortcutKey: 'q',
    shortcutKey2: 'x',
    popupShortcutKey: 'z'
  };
  let settings = { ...defaultSettings };
  let settingsReadyPromise = null;
  let popupRequestToken = 0;

  function loadSettings() {
    settingsReadyPromise = new Promise(resolve => {
      chrome.storage.sync.get(defaultSettings, stored => {
        settings = { ...defaultSettings, ...stored };
        resolve();
      });
    });
    return settingsReadyPromise;
  }

  async function ensureSettingsLoaded() {
    if (!settingsReadyPromise) loadSettings();
    await settingsReadyPromise;
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
        background: #fefcf8;
        color: #1f2933;
        border: 1px solid #d8cfbe;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(31, 41, 51, .18);
        padding: 10px 12px;
        min-width: 260px;
        max-width: 380px;
        font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
        font-size: 13px;
        line-height: 1.4;
      }
      #${POPUP_ID} .wr-hd {
        font-weight: 700;
        color: #6f4e37;
        margin-bottom: 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }
      #${POPUP_ID} .wr-hd a {
        font-size: 11px;
        color: #6f4e37;
        text-decoration: none;
        font-weight: 600;
      }
      #${POPUP_ID} .wr-hd a:hover {
        color: #533729;
        text-decoration: underline;
      }
      #${POPUP_ID} .wr-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #${POPUP_ID} .wr-fav-btn {
        border: 1px solid #6f4e37;
        color: #6f4e37;
        background: #fefcf8;
        border-radius: 6px;
        font-size: 18px;
        line-height: 1;
        padding: 1px 6px;
        cursor: pointer;
        transition: transform .12s ease, color .15s ease, border-color .15s ease;
      }
      #${POPUP_ID} .wr-fav-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        color: #8a5f42;
        border-color: #8a5f42;
      }
      #${POPUP_ID} .wr-fav-btn:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }
      #${POPUP_ID} .wr-fav-btn.is-saved {
        color: #e8a000;
        border-color: #e8a000;
      }
      #${POPUP_ID} .wr-fav-btn.is-saved:hover {
        color: #b87000;
        border-color: #b87000;
      }
      #${POPUP_ID} .wr-fav-status {
        font-size: 11px;
        color: #2e7d32;
        margin-bottom: 4px;
      }
      #${POPUP_ID} .wr-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px 10px;
        padding: 5px 0;
        border-top: 1px solid #e7dece;
      }
      #${POPUP_ID} .wr-row:first-of-type { border-top: none; }
      #${POPUP_ID} .wr-from { font-weight: 600; }
      #${POPUP_ID} .wr-pos  { font-size: 11px; color: #6a7480; }
      #${POPUP_ID} .wr-err  { color: #b00020; }
      #${POPUP_ID} .wr-load { color: #6a7480; }
      #${POPUP_ID} .wr-more { display:block; margin-top:6px; font-size:11px; color:#6f4e37; text-decoration:none; font-weight:600; }
      #${POPUP_ID} .wr-more:hover { color:#533729; text-decoration:underline; }
      #${POPUP_ID} .wr-ipa { font-size: 12px; color: #6a7480; font-style: italic; font-weight: 400; margin-left: 4px; }
      #${POPUP_ID} .wr-def-row {
        display: block;
        padding: 5px 0;
        border-top: 1px solid #e7dece;
      }
      #${POPUP_ID} .wr-def-row:first-of-type { border-top: none; }
      #${POPUP_ID} .wr-def-index { color: #6a7480; font-size: 11px; margin-right: 4px; }
      #${POPUP_ID} .wr-def-example { display: block; margin-top: 2px; }
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

  function getSelectionText(sourceTarget) {
    const sel = window.getSelection();
    const selected = sel ? sel.toString().trim() : '';
    if (selected) return selected;

    const target = sourceTarget && sourceTarget.nodeType === 1 ? sourceTarget : document.activeElement;
    if (!target) return '';

    const isTextInput = target.tagName === 'TEXTAREA'
      || (target.tagName === 'INPUT' && /^(text|search|url|tel|password|email)$/i.test(target.type || ''));
    if (!isTextInput) return '';

    const start = typeof target.selectionStart === 'number' ? target.selectionStart : 0;
    const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : 0;
    if (end <= start) return '';
    return String(target.value || '').slice(start, end).trim();
  }

  function getSelectionPosition(sourceTarget) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect && (rect.width > 0 || rect.height > 0)) {
        return {
          x: rect.left + window.scrollX,
          y: rect.bottom + window.scrollY + 8
        };
      }
    }

    if (sourceTarget && typeof sourceTarget.getBoundingClientRect === 'function') {
      const rect = sourceTarget.getBoundingClientRect();
      return {
        x: rect.left + window.scrollX,
        y: rect.bottom + window.scrollY + 8
      };
    }

    return { x: 16, y: 16 };
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
      const glossCell = row.querySelector('td.To2');
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
      const gloss = glossCell ? glossCell.textContent.replace(/[()]/g, '').trim() : '';

      if (frCell) {
        entry = { from: getWord(frCell), fromPos: getPos(frCell), translations: [] };
        rows.push(entry);
      }
      if (entry && toWord) {
        entry.translations.push({ word: toWord, pos: toPos, gloss });
      }
    }
    return rows;
  }

  function getFirstBilingualExplanation(rows) {
    const LANGUAGE_LABELS = new Set([
      'english', 'ingilizce',
      'turkish', 'turkce', 'türkçe',
      'spanish', 'español', 'espanol',
      'italian', 'italiano',
      'portuguese', 'portugues', 'português',
      'french', 'francais', 'français',
      'german', 'deutsch'
    ]);

    for (const entry of rows || []) {
      for (const translation of (entry && entry.translations) || []) {
        const gloss = String((translation && translation.gloss) || '').trim();
        if (gloss) return gloss;
        const word = String((translation && translation.word) || '').trim();
        if (!word) continue;
        const normalized = word
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        if (LANGUAGE_LABELS.has(normalized)) continue;
        return word;
      }
    }
    return '';
  }

  function getFirstDefinitionExplanation(defs) {
    for (const def of defs || []) {
      const text = String((def && def.text) || '').trim();
      if (text) return text;
    }
    return '';
  }

  function buildContentFavoriteCandidate(term, dir, ipa, explanation) {
    const word = String(term || '').trim();
    if (!word || !dir) return null;
    const id = favoritesApi.makeFavoriteId(word, dir);
    return {
      id,
      word,
      ipa: String(ipa || ''),
      explanation: String(explanation || ''),
      dir,
      langPair: settings.langPair,
      source: 'content',
      url: `${WR_BASE}/${dir}/${encodeURIComponent(word)}`
    };
  }

  function setContentFavoriteStatus(el, text, isError = false) {
    if (!el) return;
    el.style.color = isError ? '#b00020' : '#2e7d32';
    el.textContent = text || '';
  }

  function setContentFavoriteButton(btn, enabled, isSaved) {
    if (!btn) return;
    if (!enabled) {
      btn.disabled = true;
      btn.textContent = '☆';
      btn.title = 'Search first';
      btn.setAttribute('aria-label', 'Add to favorites');
      btn.classList.remove('is-saved');
      return;
    }

    btn.disabled = false;
    btn.textContent = isSaved ? '★' : '☆';
    btn.title = isSaved ? 'Remove from favorites' : 'Add to favorites';
    btn.setAttribute('aria-label', isSaved ? 'Remove from favorites' : 'Add to favorites');
    btn.classList.toggle('is-saved', !!isSaved);
  }

  async function wireContentFavorite(popup, token, candidate) {
    const btn = popup.querySelector('.wr-fav-btn');
    const statusEl = popup.querySelector('.wr-fav-status');
    if (!btn) return;

    if (!candidate || !favoritesApi) {
      setContentFavoriteButton(btn, false, false);
      setContentFavoriteStatus(statusEl, '');
      return;
    }

    let isSaved = false;
    try {
      isSaved = await favoritesApi.isFavoriteId(candidate.id);
    } catch (_) {
      isSaved = false;
    }

    if (!popupCanRender(popup, token)) return;
    setContentFavoriteButton(btn, true, isSaved);

    btn.addEventListener('click', async event => {
      if (!event.isTrusted) return;
      if (!favoritesApi || !candidate) return;
      const wasSaved = btn.classList.contains('is-saved');
      btn.disabled = true;

      if (wasSaved) {
        setContentFavoriteStatus(statusEl, 'Removing...');
        try {
          await favoritesApi.removeFavorite(candidate.id);
          if (!popupCanRender(popup, token)) return;
          setContentFavoriteButton(btn, true, false);
          setContentFavoriteStatus(statusEl, 'Removed');
        } catch (_) {
          if (!popupCanRender(popup, token)) return;
          setContentFavoriteButton(btn, true, true);
          setContentFavoriteStatus(statusEl, 'Remove failed', true);
        }
      } else {
        setContentFavoriteStatus(statusEl, 'Saving...');
        try {
          const result = await favoritesApi.addFavorite(candidate);
          if (!popupCanRender(popup, token)) return;
          setContentFavoriteButton(btn, true, true);
          setContentFavoriteStatus(statusEl, result && result.added ? 'Saved' : '');
        } catch (_) {
          if (!popupCanRender(popup, token)) return;
          setContentFavoriteButton(btn, true, false);
          setContentFavoriteStatus(statusEl, 'Save failed', true);
        }
      }
    });
  }

  // ── English monolingual definition parser ─────────────────────────────────────

  function parseEnDef(doc) {
    const defs = [];

    // Random House entries
    doc.querySelectorAll('div.entryRH').forEach(entry => {
      entry.querySelectorAll('ol > li').forEach(li => {
        const defEl = li.querySelector('.rh_def');
        if (!defEl) return;
        const clone = defEl.cloneNode(true);
        let example = '';
        const exEl = clone.querySelector('.rh_ex');
        if (exEl) { example = exEl.textContent.trim(); exEl.remove(); }
        clone.querySelectorAll('.rh_lab, .rh_cat').forEach(el => el.remove());
        const text = clone.textContent.replace(/\s+/g, ' ').trim();
        if (text) defs.push({ text, example });
      });
    });

    // Collins entries
    doc.querySelectorAll('div.superentry.collinsen').forEach(entry => {
      entry.querySelectorAll('li.sense').forEach(li => {
        const defEl = li.querySelector('.definition');
        if (!defEl) return;
        const text = defEl.textContent.replace(/\s+/g, ' ').trim();
        const exEls = li.querySelectorAll('.example');
        const example = exEls.length ? [...exEls].map(e => e.textContent.trim()).join('; ') : '';
        if (text) defs.push({ text, example });
      });
    });

    return defs;
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

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isTransientFetchError(err) {
    if (!err) return false;
    if (err.name === 'AbortError') return true;
    if (typeof err.status === 'number') return err.status === 429 || err.status >= 500;
    const msg = String(err.message || '').toLowerCase();
    return msg.includes('network')
      || msg.includes('failed to fetch')
      || msg.includes('incomplete wordreference payload');
  }

  function popupCanRender(popup, token) {
    return token === popupRequestToken && popup && popup.isConnected && popup.id === POPUP_ID;
  }

  // Stream the response and stop as soon as the WRD table is complete.
  // WR pages are 200–400 KB but the IPA + translation table are in the first ~30 KB.
  // English definition pages have no WRD table and need a larger cap.
  async function fetchWROnce(url, isDefPage, externalSignal) {
    const CAP = isDefPage ? 200000 : 80000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let onExternalAbort = null;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else {
        onExternalAbort = () => controller.abort();
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
    try {
      const resp = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!resp.ok) {
        const httpError = new Error('HTTP ' + resp.status);
        httpError.status = resp.status;
        throw httpError;
      }
      if (!resp.body) throw new Error('Empty response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let html = '';
      let foundCompleteTable = false;
      let capReached = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
          if (!isDefPage) {
            const wrdIdx = html.search(/\b(?:id|class)\s*=\s*["'][^"']*\bWRD\b[^"']*["']/i);
            if (wrdIdx !== -1) {
              const tableClose = html.indexOf('</table>', wrdIdx);
              if (tableClose !== -1) {
                html = html.slice(0, tableClose + 8);
                foundCompleteTable = true;
                break;
              }
            }
          }
          if (html.length > CAP) {
            capReached = true;
            break; // safety cap
          }
        }
      } finally {
        reader.cancel().catch(() => { });
      }

      // If stream ended naturally without early table detection, keep full HTML
      // and let parseWR decide whether results exist.
      if (!isDefPage && capReached && !foundCompleteTable) throw new Error('Incomplete WordReference payload');
      return html;
    } finally {
      clearTimeout(timeoutId);
      if (onExternalAbort) externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }

  // Hedged race: fire attempt 1 at t=0, attempt 2 at +1.5s, attempt 3 at +3s
  // (each with its own 3.4s deadline). First success wins; losers get aborted.
  // If all three lose, fall back to one final sequential attempt #4.
  async function fetchWRPage(url) {
    const isDefPage = url.includes('/definition/');
    const cancel = new AbortController();
    const raceErrors = [];

    const racing = HEDGE_OFFSETS_MS.map(async (offset) => {
      if (offset > 0) await sleep(offset);
      if (cancel.signal.aborted) throw new DOMException('canceled by winner', 'AbortError');
      return fetchWROnce(url, isDefPage, cancel.signal);
    });

    try {
      const html = await Promise.any(racing);
      cancel.abort();
      return html;
    } catch (err) {
      if (err && Array.isArray(err.errors)) {
        for (const e of err.errors) {
          if (!(e && e.name === 'AbortError')) raceErrors.push(e);
        }
      }
    }

    await sleep(FETCH_BACKOFF_MS * 3);
    try {
      return await fetchWROnce(url, isDefPage, null);
    } catch (err) {
      const meaningful = raceErrors.find(e => isTransientFetchError(e) || typeof e.status === 'number');
      throw meaningful || err;
    }
  }

  async function showPopupForSelection(sourceTarget = null, prefetchedTerm = '') {
    const term = prefetchedTerm || getSelectionText(sourceTarget);
    if (!term || term.length < 2) return;

    const pos = getSelectionPosition(sourceTarget);
    await ensureSettingsLoaded();

    const token = ++popupRequestToken;
    const popup = createPopup(pos);
    const isMonolingual = settings.langPair === 'en';
    const dir = isMonolingual ? 'definition' : ('en' + settings.langPair);
    const url = `${WR_BASE}/${dir}/${encodeURIComponent(term)}`;

    try {
      const html = await fetchWRPage(url);
      if (!popupCanRender(popup, token)) return;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const ipa = extractIPA(doc);
      let favoriteCandidate = null;

      if (isMonolingual) {
        const defs = parseEnDef(doc);
        if (!defs.length) {
          if (!popupCanRender(popup, token)) return;
          popup.innerHTML = `<div class="wr-err">No results for "<strong>${escapeHtml(term)}</strong>".</div>`;
          return;
        }

        const displayDefs = defs.slice(0, MAX_ROWS);
        const hasMore = defs.length > MAX_ROWS;

        if (!popupCanRender(popup, token)) return;
        popup.innerHTML = `
          <div class="wr-hd">
            <span>${escapeHtml(term)}<span class="wr-ipa" id="wr-ipa-inline"></span></span>
            <span class="wr-actions">
              <button type="button" class="wr-fav-btn" aria-label="Add to favorites" title="Add to favorites">☆</button>
              <a href="${url}" target="_blank" rel="noopener">Open WR ↗</a>
            </span>
          </div>
          <div class="wr-fav-status" aria-live="polite"></div>
          ${displayDefs.map((d, i) => `
            <div class="wr-def-row">
              <span class="wr-def-index">${i + 1}.</span>
              ${escapeHtml(d.text)}
              ${d.example ? `<span class="wr-pos wr-def-example">${escapeHtml(d.example)}</span>` : ''}
            </div>`).join('')}
          ${hasMore ? `<a class="wr-more" href="${url}" target="_blank" rel="noopener">See all ${defs.length} definitions on WordReference.com…</a>` : ''}
        `;
        favoriteCandidate = buildContentFavoriteCandidate(term, dir, ipa, getFirstDefinitionExplanation(defs));
      } else {
        const rows = parseWR(doc);

        if (!rows.length) {
          if (!popupCanRender(popup, token)) return;
          popup.innerHTML = `<div class="wr-err">No results for "<strong>${escapeHtml(term)}</strong>".</div>`;
          return;
        }

        const displayRows = rows.slice(0, MAX_ROWS);
        const hasMore = rows.length > MAX_ROWS;

        // Render translations immediately, leave IPA placeholder empty
        if (!popupCanRender(popup, token)) return;
        popup.innerHTML = `
          <div class="wr-hd">
            <span>${escapeHtml(term)}<span class="wr-ipa" id="wr-ipa-inline"></span></span>
            <span class="wr-actions">
              <button type="button" class="wr-fav-btn" aria-label="Add to favorites" title="Add to favorites">☆</button>
              <a href="${url}" target="_blank" rel="noopener">Open WR ↗</a>
            </span>
          </div>
          <div class="wr-fav-status" aria-live="polite"></div>
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
        favoriteCandidate = buildContentFavoriteCandidate(term, dir, ipa, getFirstBilingualExplanation(rows));
      }

      wireContentFavorite(popup, token, favoriteCandidate);

      // Extract IPA after browser has painted
      queueMicrotask(() => {
        if (!popupCanRender(popup, token)) return;
        const ipaEl = document.getElementById('wr-ipa-inline');
        if (ipa && ipaEl) ipaEl.textContent = ipa;
      });
    } catch (_) {
      if (!popupCanRender(popup, token)) return;
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

  function matchesShortcutModifier(event) {
    switch (settings.shortcutModifier) {
      case 'none': return !event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey;
      case 'ctrl': return event.ctrlKey;
      case 'shift': return event.shiftKey;
      case 'meta': return event.metaKey;
      case 'alt':
      default: return event.altKey;
    }
  }

  document.addEventListener('dblclick', event => {
    if (!event.isTrusted) return;
    if (!matchesModifier(event)) return;
    const sourceTarget = event.target;
    const immediateTerm = getSelectionText(sourceTarget);
    if (immediateTerm && immediateTerm.length >= 2) {
      showPopupForSelection(sourceTarget, immediateTerm);
      return;
    }
    // Fallback for pages where selection finalizes after dblclick dispatch.
    setTimeout(() => showPopupForSelection(sourceTarget), 0);
  });

  document.addEventListener('keydown', event => {
    if (!event.isTrusted) return;
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

    if (matchesShortcutModifier(event) && pressed === pKey) {
      event.preventDefault();
      chrome.runtime.sendMessage({ type: 'WR_OPEN_POPUP' });
      return;
    }
    if (matchesShortcutModifier(event) && (pressed === sKey || pressed === sKey2)) {
      const term = getSelectionText(event.target);
      if (term && term.length >= 2) {
        event.preventDefault();
        showPopupForSelection(event.target, term);
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
    if (changes.shortcutModifier) settings.shortcutModifier = changes.shortcutModifier.newValue;
    if (changes.shortcutKey) settings.shortcutKey = changes.shortcutKey.newValue;
    if (changes.shortcutKey2) settings.shortcutKey2 = changes.shortcutKey2.newValue;
    if (changes.popupShortcutKey) settings.popupShortcutKey = changes.popupShortcutKey.newValue;
  });

  loadSettings();
})();
