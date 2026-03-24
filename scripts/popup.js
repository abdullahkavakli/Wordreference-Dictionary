/**
 * WordReference Dictionary Extension
 * Copyright (c) 2026 Abdullah Kavakli. All rights reserved.
 * Proprietary License. Unauthorized redistribution prohibited.
 */
'use strict';

const WR_BASE = 'https://www.wordreference.com';
// ─── Settings ────────────────────────────────────────────────────────────────────────────
let popupSettings = { ipaDialect: 'us', langPair: 'tr', spanishDialect: 'es-ES', portugueseDialect: 'pt-PT' };
chrome.storage.sync.get({ ipaDialect: 'us', langPair: 'tr', spanishDialect: 'es-ES', portugueseDialect: 'pt-PT' }, stored => {
  if (stored) popupSettings = { ...popupSettings, ...stored };
  activeLang = popupSettings.langPair || 'tr';
  applyLangFlagVisibility();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.ipaDialect) {
    popupSettings.ipaDialect = changes.ipaDialect.newValue;
  }
  if (area === 'sync' && changes.spanishDialect) {
    popupSettings.spanishDialect = changes.spanishDialect.newValue;
  }
  if (area === 'sync' && changes.portugueseDialect) {
    popupSettings.portugueseDialect = changes.portugueseDialect.newValue;
  }
  if (area === 'sync' && changes.langPair) {
    popupSettings.langPair = changes.langPair.newValue;
    activeLang = changes.langPair.newValue;
    applyLangFlagVisibility();
  }
});

function applyLangFlagVisibility() {
  const flags = ['tr', 'es', 'it', 'pt', 'fr', 'de', 'nl', 'sv', 'ar', 'zh', 'ru', 'gr', 'pl', 'ro', 'cz', 'ja', 'ko', 'is'];
  flags.forEach(lang => {
    const btn = document.getElementById(`flag-${lang}-btn`);
    if (btn) btn.style.display = activeLang === lang ? '' : 'none';
  });
}
// ─── Language helpers ────────────────────────────────────────────────────────

// Active language pair
let activeLang = 'tr';

function getSelectedDirMode() {
  if (document.getElementById('dir-fwd').classList.contains('active')) return 'fwd';
  if (document.getElementById('dir-rev').classList.contains('active')) return 'rev';
  return 'auto';
}

function resolveDir(str) {
  const mode = getSelectedDirMode();
  if (mode === 'rev') return activeLang + 'en';
  return 'en' + activeLang;
}

// Human-readable language labels for result table headers
const LANG_MAP = {
  tr: 'Turkish', es: 'Spanish', it: 'Italian', pt: 'Portuguese',
  fr: 'French', de: 'German', nl: 'Dutch', sv: 'Swedish',
  ar: 'Arabic', zh: 'Chinese', ru: 'Russian', gr: 'Greek',
  pl: 'Polish', ro: 'Romanian', cz: 'Czech', ja: 'Japanese',
  ko: 'Korean', is: 'Icelandic'
};
const LANG_LABELS = {};
for (const [code, name] of Object.entries(LANG_MAP)) {
  LANG_LABELS[`en${code}`] = ['English', name];
  LANG_LABELS[`${code}en`] = [name, 'English'];
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── WordReference HTML parser ───────────────────────────────────────────────
//
// WR results page structure (entr / tren):
//   <table class="WRD" id="WRD">
//     <tr class="wrtopsection"><td colspan="3">…category…</td></tr>
//     <tr class="even|odd">
//       <td class="FrWrd"><strong>word</strong> <em class="POS2">pos</em></td>
//       <td class="To2"><span class="ph">(sense gloss)</span></td>
//       <td class="ToWrd"><strong>translation</strong> <em class="POS2">pos</em></td>
//     </tr>
//     …continuation rows (no FrWrd, only ToWrd)…
//   </table>

function getCellWords(cell) {
  const clone = cell.cloneNode(true);
  // Remove part-of-speech elements to get clean word text
  clone.querySelectorAll('em, sup, .tooltip').forEach(el => el.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

function getCellPOS(cell) {
  const em = cell.querySelector('em.POS2, em.tooltip, em');
  return em ? em.textContent.trim() : '';
}

function parseWR(doc) {
  const table = doc.querySelector('table#WRD, table.WRD');
  if (!table) return null;

  const sections = [];
  let section = { title: '', entries: [] };
  let entry = null;

  for (const row of table.querySelectorAll('tr')) {
    // ── Skip language-label header row (İngilizce / Türkçe) ──
    if (row.classList.contains('langHeader')) continue;

    // ── Section header ──
    const secCell = row.querySelector('td.wrtopsection');
    if (secCell) {
      if (section.entries.length > 0 || section.title) sections.push(section);
      section = { title: secCell.textContent.replace(/\s+/g, ' ').trim(), entries: [] };
      entry = null;
      continue;
    }

    const frCell = row.querySelector('td.FrWrd');
    const toCell = row.querySelector('td.ToWrd');
    const glossCell = row.querySelector('td.To2');

    if (!toCell) continue;

    const toWord = getCellWords(toCell);
    const toPos = getCellPOS(toCell);
    const gloss = glossCell ? glossCell.textContent.replace(/[()]/g, '').trim() : '';
    const fromWord = frCell ? getCellWords(frCell) : '';

    if (frCell) {
      entry = {
        fromWord,
        fromPos: getCellPOS(frCell),
        translations: []
      };
      section.entries.push(entry);
    }

    if (entry && toWord) {
      entry.translations.push({ word: toWord, pos: toPos, gloss });
    }
  }

  if (section.entries.length > 0) sections.push(section);
  return sections;
}
// ─── IPA extraction ───────────────────────────────────────────────────────────────────────────

function extractIPA(doc) {
  const dialect = popupSettings.ipaDialect || 'us';

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

function extractWRAudioFiles(doc) {
  const files = [];

  for (const script of doc.querySelectorAll('script')) {
    const js = script.textContent || '';
    const m = js.match(/window\.audioFiles\s*=\s*\[([\s\S]*?)\]/);
    if (!m) continue;

    const list = m[1];
    const re = /['"]([^'"]+\.mp3)['"]/g;
    let hit;
    while ((hit = re.exec(list)) !== null) {
      const raw = hit[1].trim();
      if (!raw) continue;
      files.push(new URL(raw, WR_BASE).href);
    }
  }

  return [...new Set(files)];
}

function pickWRAudioFile(audioFiles, accent) {
  if (!audioFiles || audioFiles.length === 0) return null;

  const by = re => audioFiles.find(url => re.test(url));

  if (accent === 'tr') {
    return by(/\/audio\/tr\//i) || by(/\/turk/i) || null;
  }

  if (accent === 'us') {
    return by(/\/audio\/[^/]+\/us\//i) || by(/\/us\//i) || audioFiles[0];
  }

  if (accent === 'uk') {
    return by(/\/audio\/[^/]+\/uk\//i) || by(/\/uk\//i) || audioFiles[0];
  }

  if (accent === 'es-ES') return by(/\/audio\/es\//i) || by(/\/es\//i) || audioFiles[0];
  if (accent === 'es-MX') return by(/\/audio\/mx\//i) || by(/\/mx\//i) || by(/\/audio\/es\//i) || audioFiles[0];
  if (accent === 'es-AR') return by(/\/audio\/ar\//i) || by(/\/ar\//i) || by(/\/audio\/es\//i) || audioFiles[0];

  if (accent === 'pt-PT') return by(/\/audio\/pt\//i) || by(/\/pt\//i) || audioFiles[0];
  if (accent === 'pt-BR') return by(/\/audio\/br\//i) || by(/\/br\//i) || by(/\/audio\/pt\//i) || audioFiles[0];

  const baseLang = accent.split('-')[0];
  return by(new RegExp(`/audio/${baseLang}/`, 'i')) || by(new RegExp(`/${baseLang}/`, 'i')) || audioFiles[0];
}

let _wrAudioPlayer = null;
let _wrAudioFiles = [];
let _lastSearchWord = '';

async function tryFetchAudioForWord(word, accent) {
  if (!word) return null;
  const baseLang = accent.split('-')[0];
  const dictCode = baseLang + 'en'; // Target -> English URL
  try {
    const html = await fetchWRPage(`${WR_BASE}/${dictCode}/${encodeURIComponent(word)}`);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const files = extractWRAudioFiles(doc);
    return pickWRAudioFile(files, accent);
  } catch (_) {
    return null;
  }
}

async function playWRAudio(accent) {
  const resolvedAccent = (accent === 'es') ? (popupSettings.spanishDialect || 'es-ES')
    : (accent === 'pt') ? (popupSettings.portugueseDialect || 'pt-PT')
      : accent;

  let audioUrl = pickWRAudioFile(_wrAudioFiles, resolvedAccent);

  // If no audio was scraped immediately, fetch the Target -> English page to look for it
  if (!audioUrl && resolvedAccent !== 'us' && resolvedAccent !== 'uk') {
    audioUrl = await tryFetchAudioForWord(
      _lastSearchWord || document.getElementById('search-input').value.trim(),
      resolvedAccent
    );
  }

  if (!audioUrl) {
    const fallbackWord = (_lastSearchWord || document.getElementById('search-input').value || '').trim();
    const ttsMap = {
      fr: 'fr-FR', de: 'de-DE', it: 'it-IT', nl: 'nl-NL', sv: 'sv-SE',
      ar: 'ar-SA', zh: 'zh-CN', ru: 'ru-RU', gr: 'el-GR', pl: 'pl-PL',
      ro: 'ro-RO', cz: 'cs-CZ', ja: 'ja-JP', ko: 'ko-KR', is: 'is-IS',
      tr: 'tr-TR', es: resolvedAccent, pt: resolvedAccent
    };
    const base = resolvedAccent.split('-')[0];
    const ttsLang = ttsMap[base] || resolvedAccent;
    document.getElementById('ipa-inline').textContent = `No audio found; using Chrome TTS (${ttsLang}).`;
    if (fallbackWord) chrome.tts.speak(fallbackWord, { lang: ttsLang, rate: 0.8 });
    return;
  }

  if (_wrAudioPlayer) {
    _wrAudioPlayer.pause();
    _wrAudioPlayer.currentTime = 0;
  }

  _wrAudioPlayer = new Audio(audioUrl);
  _wrAudioPlayer.play().catch(() => { });
}
// ─── UI helpers ──────────────────────────────────────────────────────────────

function sanitize(str) {
  document.getElementById('content').innerHTML = '';
  document.getElementById('search-input').value = str;
  document.getElementById('loading').style.display = 'block';
  document.getElementById('voice-tts').style.display = 'none';
  document.getElementById('ipa-inline').textContent = '';
  document.getElementsByClassName('inner-shadow')[0].style.backgroundColor = '#15437e';
  $('.pie, .dot span').css('background-color', '#' + ((1 << 24) * Math.random() | 0).toString(16));
  return str.trim();
}

function notFound(str) {
  document.getElementById('content').innerHTML = `
    <div class="alert alert-warning" role="alert">
      <strong>No results found.</strong> Try a different spelling or
      <a href="https://www.google.com/search?q=${encodeURIComponent(str)}" target="_blank" rel="noopener noreferrer">
        <i class="fa fa-google" aria-hidden="true"></i>oogle it</a>.
    </div>`;
  document.getElementById('loading').style.display = 'none';
}

function renderResults(sections, str, dir) {
  const content = document.getElementById('content');
  content.innerHTML = '';

  if (!sections || sections.length === 0) {
    notFound(str);
    return;
  }

  const [fromLang, toLang] = (LANG_LABELS[dir] || ['', '']);

  sections.forEach(sec => {
    if (!sec.entries.length) return;

    const tableEl = document.createElement('table');
    tableEl.className = 'table table-striped table-hover';

    // Section title row inside thead
    const sectionRow = sec.title
      ? `<tr><th colspan="2" class="section-label">${escapeHtml(sec.title)}</th></tr>`
      : '';

    tableEl.innerHTML = `
      <thead class="thead-default">
        ${sectionRow}
        <tr>
          <th>${escapeHtml(fromLang)}</th>
          <th>${escapeHtml(toLang)}</th>
        </tr>
      </thead>
      <tbody></tbody>`;

    const tbody = tableEl.querySelector('tbody');

    sec.entries.forEach(e => {
      e.translations.forEach((t, i) => {
        const tr = document.createElement('tr');

        const fromTd = i === 0
          ? `<td>
               <a class="wr-word-link" data-word="${escapeAttr(e.fromWord)}">${escapeHtml(e.fromWord)}</a>
               ${e.fromPos ? `<small class="text-muted"> (${escapeHtml(e.fromPos)})</small>` : ''}
             </td>`
          : `<td></td>`;

        tr.innerHTML = `
          ${fromTd}
          <td>
            <a class="wr-word-link" data-word="${escapeAttr(t.word)}">${escapeHtml(t.word)}</a>
            ${t.pos ? `<small class="text-muted"> (${escapeHtml(t.pos)})</small>` : ''}
            ${t.gloss ? `<small class="text-info">  ${escapeHtml(t.gloss)}</small>` : ''}
          </td>`;

        tbody.appendChild(tr);
      });
    });

    content.appendChild(tableEl);
  });

  // Clicking a word re-searches it
  content.querySelectorAll('.wr-word-link').forEach(a => {
    a.addEventListener('click', () => searchWR(a.dataset.word));
  });

  // Clicking thead collapses/expands tbody
  content.querySelectorAll('table thead').forEach(thead => {
    thead.addEventListener('click', () => {
      $(thead).closest('table').find('tbody').fadeToggle('fast');
    });
  });
}

// ─── Main search ─────────────────────────────────────────────────────────────

// Stream the response and stop as soon as the WRD table is complete.
// WR pages are 200–400 KB but the IPA + translation table are in the first ~30 KB.
async function fetchWRPage(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  if (!resp.body) return await resp.text();
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

let _lastDir = null;
let _searchToken = 0;

async function searchWR(rawStr) {
  if (!rawStr || !rawStr.trim()) return;
  const token = ++_searchToken;
  const str = sanitize(rawStr.trim());
  const dir = resolveDir(str);
  _lastDir = dir;
  _lastSearchWord = str;
  _wrAudioFiles = [];

  try {
    const html = await fetchWRPage(`${WR_BASE}/${dir}/${encodeURIComponent(str)}`);
    if (token !== _searchToken) return;
    document.getElementById('loading').style.display = 'none';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const sections = parseWR(doc);
    _wrAudioFiles = extractWRAudioFiles(doc);
    // Render translations immediately
    renderResults(sections, str, dir);
    document.getElementById('voice-tts').style.display = 'block';
    // Extract IPA after browser has painted the results
    queueMicrotask(() => {
        const ipa = extractIPA(doc);
        document.getElementById('ipa-inline').textContent = ipa || '';
      });
  } catch (_) {
    if (token !== _searchToken) return;
    notFound(str);
  }
}

// ─── Direction buttons ───────────────────────────────────────────────────────

['dir-auto', 'dir-fwd', 'dir-rev'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    document.querySelectorAll('#dir-group .btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  });
});

// ─── Search button & Enter key ───────────────────────────────────────────────

document.getElementById('wr-btn').addEventListener('click', () => {
  searchWR(document.getElementById('search-input').value);
});

document.getElementById('search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchWR(document.getElementById('search-input').value);
});

// ─── Pronunciation audio (WordReference) ─────────────────────────────────────

const allFlags = ['tr', 'es', 'it', 'pt', 'fr', 'de', 'nl', 'sv', 'ar', 'zh', 'ru', 'gr', 'pl', 'ro', 'cz', 'ja', 'ko', 'is', 'us', 'uk'];
allFlags.forEach(lang => {
  const btn = document.getElementById(`flag-${lang}`);
  if (btn) {
    btn.addEventListener('click', () => playWRAudio(lang));
  }
});

// ─── WR logo → open in browser ───────────────────────────────────────────────

document.getElementById('wr-logo').addEventListener('click', () => {
  const word = document.getElementById('search-input').value.trim();
  if (!word) return;
  const dir = _lastDir || resolveDir(word);
  chrome.tabs.create({ url: `${WR_BASE}/${dir}/${encodeURIComponent(word)}` });
});

// ─── Auto-load selected text when popup opens ─────────────────────────────────

window.onload = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let result = '';
  try {
    [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => getSelection().toString()
    });
  } catch (_) {
    return; // unsupported page (e.g. chrome://extensions)
  }
  if (result && result.trim().length > 0) {
    document.getElementById('search-input').value = result.trim();
    document.getElementById('wr-btn').click();
  }
};
