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

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.action.onClicked.addListener(async () => {
  // Open popup programmatically (default_popup is not set so onClicked fires)
  try {
    await chrome.action.setPopup({ popup: 'popup.html' });
    await chrome.action.openPopup();
    await chrome.action.setPopup({ popup: '' });
  } catch { /* popup may fail on restricted pages */ }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'wr-lookup' && info.selectionText) {
    const term = info.selectionText.trim();
    chrome.tabs.create({ url: `${WR_BASE}/en${_bgLangPair}/${encodeURIComponent(term)}` });
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
      chrome.tabs.create({ url: `${WR_BASE}/en${_bgLangPair}/${encodeURIComponent(term)}` });
      return;
    }
  } catch { /* truly inaccessible page */ }

  // 4) PDF / pages where selection is opaque: show a floating search box
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (wrBase, langPair) => {
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
          const dir = 'en' + langPair;
          window.open(`${wrBase}/${dir}/${encodeURIComponent(term)}`, '_blank');
          box.remove();
        });
      },
      args: [WR_BASE, _bgLangPair]
    });
  } catch { /* truly inaccessible page */ }
});

// ── Page-level popup shortcut relay (Alt+<key>) ─────────────────────────────

chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (!msg || msg.type !== 'WR_OPEN_POPUP') return;
  try {
    await chrome.action.setPopup({ popup: 'popup.html' });
    await chrome.action.openPopup();
    await chrome.action.setPopup({ popup: '' });
  } catch {
    // Ignore failures (restricted pages or no user gesture)
  }
});

// ── Omnibox support (type "wr <word>" in the address bar) ────────────────────

chrome.omnibox.onInputEntered.addListener((text) => {
  const term = text.trim();
  if (!term) return;
  chrome.tabs.update({ url: `${WR_BASE}/en${_bgLangPair}/${encodeURIComponent(term)}` });
});

// ── Language pair setting ──────────────────────────────────────────────────────

let _bgLangPair = 'tr';
chrome.storage.sync.get({ langPair: 'tr' }, res => _bgLangPair = res.langPair);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.langPair) _bgLangPair = changes.langPair.newValue;
});
