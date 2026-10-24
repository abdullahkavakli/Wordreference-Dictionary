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
  const isMonolingual = activeLang === 'en';
  flags.forEach(lang => {
    const btn = document.getElementById(`flag-${lang}-btn`);
    if (btn) btn.style.display = (!isMonolingual && activeLang === lang) ? '' : 'none';
  });
}
// ─── Language helpers ────────────────────────────────────────────────────────

// Active language pair
let activeLang = 'tr';

function resolveDir(str) {
  if (activeLang === 'en') return 'definition';
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
LANG_LABELS['definition'] = ['English', 'Definition'];

// WR language codes → BCP 47, for lang="" on translations (font choice, e.g.
// Japanese vs Chinese glyph shapes). Codes not listed are already valid.
const LANG_TAGS = { gr: 'el', cz: 'cs' };

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

const favoriteBtnEl = document.getElementById('favorite-btn');
const favoriteStatusEl = document.getElementById('favorite-status');

let _lastFavoriteCandidate = null;

function getFirstBilingualExplanation(sections) {
  const LANGUAGE_LABELS = new Set([
    'english', 'ingilizce',
    'turkish', 'turkce', 'türkçe',
    'spanish', 'español', 'espanol',
    'italian', 'italiano',
    'portuguese', 'portugues', 'português',
    'french', 'francais', 'français',
    'german', 'deutsch'
  ]);

  if (!sections) return '';
  for (const section of sections) {
    if (!section || !Array.isArray(section.entries)) continue;
    for (const entry of section.entries) {
      if (!entry || !Array.isArray(entry.translations)) continue;
      for (const translation of entry.translations) {
        if (!translation) continue;
        const gloss = String(translation.gloss || '').trim();
        if (gloss) return gloss;
        const word = String(translation.word || '').trim();
        if (!word) continue;
        const normalized = word
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        if (LANGUAGE_LABELS.has(normalized)) continue;
        if (word) return word;
      }
    }
  }
  return '';
}

function getFirstDefinitionExplanation(defSections) {
  if (!defSections) return '';
  for (const section of defSections) {
    if (!section || !Array.isArray(section.defs)) continue;
    for (const def of section.defs) {
      const text = String((def && def.text) || '').trim();
      if (text) return text;
    }
  }
  return '';
}

function showFavoriteStatus(text, isError = false) {
  if (!favoriteStatusEl) return;
  favoriteStatusEl.style.color = isError ? '#b00020' : '#2e7d32';
  favoriteStatusEl.textContent = text || '';
}

function setFavoriteButtonState(enabled, isSaved) {
  if (!favoriteBtnEl) return;
  if (!enabled) {
    favoriteBtnEl.disabled = true;
    favoriteBtnEl.textContent = '☆';
    favoriteBtnEl.title = 'Search for a word first';
    favoriteBtnEl.setAttribute('aria-label', 'Add to favorites');
    favoriteBtnEl.classList.remove('is-saved');
    return;
  }

  favoriteBtnEl.disabled = false;
  favoriteBtnEl.textContent = isSaved ? '★' : '☆';
  favoriteBtnEl.title = isSaved ? 'Remove from favorites' : 'Add to favorites';
  favoriteBtnEl.setAttribute('aria-label', isSaved ? 'Remove from favorites' : 'Add to favorites');
  favoriteBtnEl.classList.toggle('is-saved', !!isSaved);
}

function buildPopupFavoriteCandidate(word, dir, isMonolingual, sections, defSections, ipa) {
  const cleanWord = String(word || '').trim();
  if (!cleanWord || !dir) return null;

  const explanation = isMonolingual
    ? getFirstDefinitionExplanation(defSections)
    : getFirstBilingualExplanation(sections);

  const id = window.WRFavorites
    ? window.WRFavorites.makeFavoriteId(cleanWord, dir)
    : `${String(dir).toLowerCase()}::${cleanWord.toLowerCase()}`;

  return {
    id,
    word: cleanWord,
    ipa: String(ipa || ''),
    explanation,
    dir,
    langPair: activeLang,
    source: 'popup',
    url: `${WR_BASE}/${dir}/${encodeURIComponent(cleanWord)}`
  };
}

async function refreshPopupFavoriteButton(searchToken) {
  if (!favoriteBtnEl) return;
  if (!_lastFavoriteCandidate || !window.WRFavorites) {
    setFavoriteButtonState(false, false);
    return;
  }

  try {
    const saved = await window.WRFavorites.isFavoriteId(_lastFavoriteCandidate.id);
    if (typeof searchToken === 'number' && searchToken !== _searchToken) return;
    setFavoriteButtonState(true, saved);
  } catch (_) {
    setFavoriteButtonState(true, false);
  }
}


function renderDefinitions(sections, str) {
  const content = document.getElementById('content');
  content.innerHTML = '';

  if (!sections || sections.length === 0) {
    notFound(str);
    return;
  }

  sections.forEach(sec => {
    if (!sec.defs.length) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'wr-def-section';

    if (sec.title) {
      const hdr = document.createElement('div');
      hdr.className = 'wr-def-source';
      hdr.textContent = sec.title;
      wrapper.appendChild(hdr);
    }

    const ol = document.createElement('ol');
    ol.className = 'wr-def-list';

    sec.defs.forEach(d => {
      if (d.pos && !d.text) {
        // POS label row
        const posLi = document.createElement('li');
        posLi.className = 'wr-def-pos-header';
        posLi.style.listStyle = 'none';
        posLi.innerHTML = `<strong>${escapeHtml(d.pos)}</strong>`;
        ol.appendChild(posLi);
        return;
      }
      const li = document.createElement('li');
      li.innerHTML = escapeHtml(d.text)
        + (d.example ? ` <em class="text-info">${escapeHtml(d.example)}</em>` : '');
      ol.appendChild(li);
    });

    wrapper.appendChild(ol);
    content.appendChild(wrapper);
  });

  // Clicking section headers collapses/expands the list
  content.querySelectorAll('.wr-def-source').forEach(hdr => {
    hdr.style.cursor = 'pointer';
    hdr.addEventListener('click', () => {
      const list = hdr.nextElementSibling;
      if (list) list.style.display = list.style.display === 'none' ? '' : 'none';
    });
  });
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
    const doc = WRParser.parseHTML(html);
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
  showFavoriteStatus('');
  _lastFavoriteCandidate = null;
  setFavoriteButtonState(false, false);
  document.getElementsByClassName('inner-shadow')[0].style.backgroundColor = '#15437e';
  const loadingColor = '#' + ((1 << 24) * Math.random() | 0).toString(16).padStart(6, '0');
  document.querySelectorAll('.pie, .dot span').forEach(el => { el.style.backgroundColor = loadingColor; });
  return str.trim();
}

function notFound(str) {
  document.getElementById('content').innerHTML = `
    <div class="alert alert-warning" role="alert">
      <strong>No results found.</strong> Try a different spelling or
      <a href="https://www.google.com/search?q=${encodeURIComponent(str)}" target="_blank" rel="noopener noreferrer">Google it</a>.
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
  const toCode = dir.slice(2);
  const toTag = LANG_TAGS[toCode] || toCode;

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
               <button type="button" class="wr-word-link" data-word="${escapeAttr(e.fromWord)}">${escapeHtml(e.fromWord)}</button>
               ${e.fromPos ? `<small class="text-muted"> (${escapeHtml(e.fromPos)})</small>` : ''}
             </td>`
          : `<td></td>`;

        tr.innerHTML = `
          ${fromTd}
          <td lang="${escapeAttr(toTag)}">
            <button type="button" class="wr-word-link" dir="auto" data-word="${escapeAttr(t.word)}">${escapeHtml(t.word)}</button>
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
      const tbody = thead.closest('table').querySelector('tbody');
      if (tbody) tbody.hidden = !tbody.hidden;
    });
  });
}

// ─── Main search ─────────────────────────────────────────────────────────────

// The actual network fetch runs in the background service worker (see
// background.js): the popup's page context can't reliably carry WR's cross-site
// anti-bot cookie, but the extension/background context can.
function fetchWRPage(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'wr-fetch', url }, res => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!res) {
        reject(new Error('No response from background'));
      } else if (res.error) {
        const e = new Error(res.error);
        if (typeof res.status === 'number') e.status = res.status;
        reject(e);
      } else {
        resolve(res.html);
      }
    });
  });
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
  const isMonolingual = (activeLang === 'en');

  try {
    const html = await fetchWRPage(`${WR_BASE}/${dir}/${encodeURIComponent(str)}`);
    if (token !== _searchToken) return;
    document.getElementById('loading').style.display = 'none';
    const doc = WRParser.parseHTML(html);

    let sections = null;
    let defSections = null;

    if (isMonolingual) {
      defSections = WRParser.parseEnDef(doc);
      renderDefinitions(defSections, str);
    } else {
      sections = WRParser.parseWR(doc);
      renderResults(sections, str, dir);
    }

    const hasResults = isMonolingual
      ? !!(defSections && defSections.length)
      : !!(sections && sections.length);

    if (!hasResults) {
      _wrAudioFiles = [];
      _lastFavoriteCandidate = null;
      document.getElementById('voice-tts').style.display = 'none';
      showFavoriteStatus('');
      setFavoriteButtonState(false, false);
      return;
    }

    const ipa = WRParser.extractIPA(doc, popupSettings.ipaDialect);
    _lastFavoriteCandidate = buildPopupFavoriteCandidate(str, dir, isMonolingual, sections, defSections, ipa);
    _wrAudioFiles = extractWRAudioFiles(doc);
    document.getElementById('voice-tts').style.display = 'flex';
    document.getElementById('ipa-inline').textContent = ipa || '';
    refreshPopupFavoriteButton(token);
  } catch (_) {
    if (token !== _searchToken) return;
    notFound(str);
    showFavoriteStatus('');
  }
}

// ─── Search button & Enter key ───────────────────────────────────────────────

document.getElementById('wr-btn').addEventListener('click', () => {
  searchWR(document.getElementById('search-input').value);
});

document.getElementById('search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchWR(document.getElementById('search-input').value);
});

// ─── WR logo → open in browser ───────────────────────────────────────────────

document.getElementById('wr-logo-btn').addEventListener('click', () => {
  const word = document.getElementById('search-input').value.trim();
  if (!word) return;
  const dir = _lastDir || resolveDir(word);
  chrome.tabs.create({ url: `${WR_BASE}/${dir}/${encodeURIComponent(word)}` });
});

// ─── IPA → full text on hover when it's cut off ──────────────────────────────

const ipaInlineEl = document.getElementById('ipa-inline');
ipaInlineEl.addEventListener('mouseenter', () => {
  ipaInlineEl.title = ipaInlineEl.scrollWidth > ipaInlineEl.clientWidth ? ipaInlineEl.textContent : '';
});

// ─── Non-critical init — deferred to keep first paint fast ───────────────────

const allFlags = ['tr', 'es', 'it', 'pt', 'fr', 'de', 'nl', 'sv', 'ar', 'zh', 'ru', 'gr', 'pl', 'ro', 'cz', 'ja', 'ko', 'is', 'us', 'uk'];

function _wrDeferredInit() {
  allFlags.forEach(lang => {
    const btn = document.getElementById(`flag-${lang}-btn`);
    if (btn) btn.addEventListener('click', () => playWRAudio(lang));
  });

  if (favoriteBtnEl) {
    favoriteBtnEl.addEventListener('click', async event => {
      if (!event.isTrusted) return;
      if (!_lastFavoriteCandidate || !window.WRFavorites) return;

      const wasSaved = favoriteBtnEl.classList.contains('is-saved');
      favoriteBtnEl.disabled = true;

      if (wasSaved) {
        showFavoriteStatus('Removing...');
        try {
          await window.WRFavorites.removeFavorite(_lastFavoriteCandidate.id);
          setFavoriteButtonState(true, false);
          showFavoriteStatus('Removed');
        } catch (_) {
          setFavoriteButtonState(true, true);
          showFavoriteStatus('Remove failed', true);
        }
      } else {
        showFavoriteStatus('Saving...');
        try {
          const result = await window.WRFavorites.addFavorite(_lastFavoriteCandidate);
          setFavoriteButtonState(true, true);
          showFavoriteStatus(result && result.added ? 'Saved' : '');
        } catch (_) {
          setFavoriteButtonState(true, false);
          showFavoriteStatus('Save failed', true);
        }
      }
    });
  }

  setFavoriteButtonState(false, false);
}

if ('requestIdleCallback' in window) {
  requestIdleCallback(_wrDeferredInit, { timeout: 300 });
} else {
  setTimeout(_wrDeferredInit, 0);
}

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
