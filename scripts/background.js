/**
 * WordReference Dictionary Extension
 * Copyright (c) 2026 Abdullah Kavakli. All rights reserved.
 * Proprietary License. Unauthorized redistribution prohibited.
 */
'use strict';

const WR_BASE = 'https://www.wordreference.com';

// ── Context menu ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'wr-lookup',
    title: "WordReference: '%s'",
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'wr-lookup' && info.selectionText) {
    const term = info.selectionText.trim();
    const dir = resolveAutoDir(term);
    chrome.tabs.create({ url: `${WR_BASE}/${dir}/${encodeURIComponent(term)}` });
  }
});

// ── Keyboard shortcut → content-script popup ─────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'show-translation-popup') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  // 1) Try the content script that's already running
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'WR_SHOW_POPUP' });
    return;
  } catch { /* no content script listener yet */ }

  // 2) Try injecting the full content script (works on file:// HTML, late pages)
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['scripts/content.js']
    });
    await chrome.tabs.sendMessage(tab.id, { type: 'WR_SHOW_POPUP' });
    return;
  } catch { /* restricted page — PDF viewer, chrome://, etc. */ }

  // 3) Inline selection grab (all frames) — works for some restricted pages
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => (window.getSelection() || '').toString().trim()
    });
    const term = results?.map(r => r.result).find(t => t && t.length >= 2);
    if (term) {
      const dir = resolveAutoDir(term);
      chrome.tabs.create({ url: `${WR_BASE}/${dir}/${encodeURIComponent(term)}` });
      return;
    }
  } catch { /* truly inaccessible page */ }

  // 4) PDF / pages where selection is opaque: show a floating search box
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (wrBase) => {
        const ID = 'wr-pdf-search';
        if (document.getElementById(ID)) {
          document.getElementById(ID).querySelector('input').focus();
          return;
        }
        const box = document.createElement('div');
        box.id = ID;
        box.style.cssText = `
          position:fixed;top:16px;right:16px;z-index:2147483647;
          background:#fff;border:1px solid #c8d4e8;border-radius:10px;
          box-shadow:0 8px 24px rgba(0,0,0,.18);padding:14px 16px;
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
          font-size:14px;color:#222;min-width:280px;
        `;
        box.innerHTML = `
          <div style="font-weight:700;color:#15437e;margin-bottom:8px;
                      display:flex;justify-content:space-between;align-items:center">
            <span>WordReference Lookup</span>
            <span id="wr-pdf-close"
                  style="cursor:pointer;color:#888;font-size:18px;line-height:1">&times;</span>
          </div>
          <div style="font-size:12px;color:#666;margin-bottom:8px">
            Select text in the PDF, copy it (Ctrl+C), then paste here.
          </div>
          <form id="wr-pdf-form" style="display:flex;gap:6px">
            <input type="text" id="wr-pdf-input" placeholder="Type or paste a word…"
              style="flex:1;padding:7px 10px;border:1px solid #ccc;border-radius:6px;
                     font-size:14px;outline:none">
            <button type="submit"
              style="padding:7px 14px;background:#15437e;color:#fff;border:none;
                     border-radius:6px;font-size:14px;cursor:pointer">Look up</button>
          </form>
        `;
        document.body.appendChild(box);
        const input = box.querySelector('#wr-pdf-input');
        input.focus();
        // Try to auto-paste from clipboard
        navigator.clipboard.readText()
          .then(t => { const w = (t || '').trim(); if (w && w.length < 60) input.value = w; })
          .catch(() => { });
        box.querySelector('#wr-pdf-close').addEventListener('click', () => box.remove());
        document.addEventListener('keydown', function esc(e) {
          if (e.key === 'Escape') { box.remove(); document.removeEventListener('keydown', esc); }
        });
        box.querySelector('#wr-pdf-form').addEventListener('submit', (e) => {
          e.preventDefault();
          const term = input.value.trim();
          if (!term) return;
          const dir = resolveAutoDir(term);
          window.open(`${wrBase}/${dir}/${encodeURIComponent(term)}`, '_blank');
          box.remove();
        });
      },
      args: [WR_BASE]
    });
  } catch { /* truly inaccessible page */ }
});

// ── Page-level popup shortcut relay (Alt+<key>) ─────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'WR_OPEN_POPUP') return;
  const tabId = sender && sender.tab && sender.tab.id;
  if (!tabId) return;
  try {
    chrome.action.openPopup({ tabId });
  } catch {
    // Ignore failures (restricted pages or no user gesture)
  }
});

// ── Omnibox support (type "wr <word>" in the address bar) ────────────────────

chrome.omnibox.onInputEntered.addListener((text) => {
  const term = text.trim();
  if (!term) return;
  const dir = resolveAutoDir(term);
  chrome.tabs.update({ url: `${WR_BASE}/${dir}/${encodeURIComponent(term)}` });
});

// ── Shared helpers (duplicated here because service workers are isolated) ──────

let _bgLangPair = 'tr';
chrome.storage.sync.get({ langPair: 'tr' }, res => _bgLangPair = res.langPair);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.langPair) _bgLangPair = changes.langPair.newValue;
});

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

// Auto-detect language pair and direction from character set
function resolveAutoDir(str) {
  return detectTargetLanguageDir(str, _bgLangPair);
}
