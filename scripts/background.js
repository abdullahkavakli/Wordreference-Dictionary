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
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
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

function wrLookupUrl(term) {
  if (_bgLangPair === 'en') return `${WR_BASE}/definition/${encodeURIComponent(term)}`;
  return `${WR_BASE}/en${_bgLangPair}/${encodeURIComponent(term)}`;
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'wr-lookup' && info.selectionText) {
    const term = info.selectionText.trim();
    chrome.tabs.create({ url: wrLookupUrl(term) });
  }
});

// ── WordReference anti-bot cookie ───────────────────────────────────────────
// WR's nginx gate replies with HTTP 418 + an inline script that sets
// `nginx_wr_human=1` and reloads. fetch() never runs that script and the 418
// carries no Set-Cookie header, so our fetches are rejected forever. We set the
// cookie ourselves; SameSite=None+Secure lets it ride along on the extension's
// (cross-site) credentialed fetches.
async function ensureHumanCookie() {
  if (!chrome.cookies || !chrome.cookies.set) return;
  try {
    await chrome.cookies.set({
      url: WR_BASE + '/',
      name: 'nginx_wr_human',
      value: '1',
      domain: '.wordreference.com',
      path: '/',
      secure: true,
      sameSite: 'no_restriction',
      expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
    });
  } catch { /* a real WR visit may already hold the cookie */ }
}

chrome.runtime.onInstalled.addListener(() => { ensureHumanCookie(); });
chrome.runtime.onStartup.addListener(() => { ensureHumanCookie(); });

// ── WordReference page fetch (runs in the extension context) ─────────────────
// Page-context fetches (content script / popup) can't carry WR's cross-site
// anti-bot cookie, but the extension context can — so they delegate here.
// Stream and stop as soon as the WRD table closes: pages are 140–400 KB and the
// table now starts ~82–120 KB in, so the early exit still skips the tail.
// The cap is only a runaway guard, and must stay above a full page: a lookup
// with no results has no WRD table, so it streams to the end (~140 KB) — cap it
// below that and it aborts instead of rendering "no results".
const WR_FETCH_TIMEOUT_MS = 6000;

async function wrFetchOnce(url, isDefPage) {
  const CAP = 200000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WR_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { credentials: 'include', cache: 'no-store', signal: controller.signal });
    if (!resp.ok) {
      const httpError = new Error('HTTP ' + resp.status);
      httpError.status = resp.status;
      throw httpError;
    }
    if (!resp.body) return await resp.text();

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
        if (html.length > CAP) { capReached = true; break; }
      }
    } finally {
      reader.cancel().catch(() => { });
    }
    if (!isDefPage && capReached && !foundCompleteTable) throw new Error('Incomplete WordReference payload');
    return html;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWRPage(url) {
  const isDefPage = url.includes('/definition/');
  try {
    return await wrFetchOnce(url, isDefPage);
  } catch (err) {
    if (err && err.status === 418) {
      await ensureHumanCookie();              // gate rejected us → (re)seed and retry once
      return await wrFetchOnce(url, isDefPage);
    }
    throw err;
  }
}

// Single message listener: with multiple listeners (one of them async) Chrome
// closes the port before an async sendResponse fires, so all WR messaging — the
// page→background fetch and the Alt+<key> popup relay — is handled here.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'wr-fetch' && typeof msg.url === 'string') {
    fetchWRPage(msg.url)
      .then(html => sendResponse({ html }))
      .catch(err => sendResponse({ error: String((err && err.message) || err), status: err && err.status }));
    return true; // keep the channel open for the async response
  }

  if (msg.type === 'WR_OPEN_POPUP') {
    (async () => {
      try {
        await chrome.action.setPopup({ popup: 'popup.html' });
        await chrome.action.openPopup();
        await chrome.action.setPopup({ popup: '' });
      } catch { /* restricted page or no user gesture */ }
    })();
  }
});

// ── Keyboard shortcut → content-script popup ─────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'show-translation-popup' && command !== 'quick-lookup-selection') return;
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
      files: ['scripts/favorites.js', 'scripts/content.js']
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
      chrome.tabs.create({ url: wrLookupUrl(term) });
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
          const dir = langPair === 'en' ? 'definition' : ('en' + langPair);
          window.open(`${wrBase}/${dir}/${encodeURIComponent(term)}`, '_blank');
          box.remove();
        });
      },
      args: [WR_BASE, _bgLangPair]
    });
  } catch { /* truly inaccessible page */ }
});

// ── Language pair setting ──────────────────────────────────────────────────────

let _bgLangPair = 'tr';
chrome.storage.sync.get({ langPair: 'tr' }, res => _bgLangPair = res.langPair);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.langPair) _bgLangPair = changes.langPair.newValue;
  if (area === 'sync' && changes.pdfViewerEnabled) syncPdfViewerRule();
});

// ── Optional PDF viewer (declarativeNetRequest redirect) ─────────────────────

const PDF_RULE_ID = 1001;

async function hasPdfPermissions() {
  try {
    return await chrome.permissions.contains({ origins: ['<all_urls>'] });
  } catch { return false; }
}

async function syncPdfViewerRule() {
  const { pdfViewerEnabled } = await chrome.storage.sync.get({ pdfViewerEnabled: false });
  const granted = await hasPdfPermissions();
  const enable = !!pdfViewerEnabled && granted;

  if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateDynamicRules) return;

  if (enable) {
    const viewerUrl = chrome.runtime.getURL('pdf-viewer.html');
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [PDF_RULE_ID],
      addRules: [{
        id: PDF_RULE_ID,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: { regexSubstitution: `${viewerUrl}?file=\\0` }
        },
        condition: {
          regexFilter: '^https?://[^?#]*\\.pdf(\\?.*)?$',
          resourceTypes: ['main_frame']
        }
      }]
    });
  } else {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [PDF_RULE_ID] });
  }
}

if (chrome.permissions && chrome.permissions.onRemoved) {
  chrome.permissions.onRemoved.addListener(syncPdfViewerRule);
  chrome.permissions.onAdded.addListener(syncPdfViewerRule);
}

chrome.runtime.onStartup.addListener(syncPdfViewerRule);
chrome.runtime.onInstalled.addListener(syncPdfViewerRule);
