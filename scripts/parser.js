/**
 * WordReference Dictionary Extension
 * Copyright (c) 2026 Abdullah Kavakli. All rights reserved.
 * Proprietary License. Unauthorized redistribution prohibited.
 *
 * WR HTML parsers shared by the popup (popup.js) and the in-page bubble
 * (content.js). Pure functions of a parsed Document; no chrome.* access.
 */
(() => {
  'use strict';

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

  // Bilingual lookup → [{ title, entries: [{ fromWord, fromPos, translations: [{ word, pos, gloss }] }] }]
  function parseWR(doc) {
    const table = doc.querySelector('table#WRD, table.WRD');
    if (!table) return [];

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

  // English definitions → [{ title, defs: [{ text, example }] }]
  function parseEnDef(doc) {
    const sections = [];

    // ── Random House entries (div.entryRH) ──
    // Each entryRH is preceded by a <span class="small1"> with the dictionary source title.
    doc.querySelectorAll('div.entryRH').forEach(entry => {
      // Grab source title from preceding span.small1
      let title = '';
      let prev = entry.previousElementSibling;
      while (prev) {
        if (prev.classList.contains('small1')) { title = prev.textContent.trim(); break; }
        if (prev.classList.contains('entrySeparator')) break;
        prev = prev.previousElementSibling;
      }

      const defs = [];
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
      if (defs.length) sections.push({ title, defs });
    });

    // ── Collins entries (div.superentry.collinsen) ──
    doc.querySelectorAll('div.superentry.collinsen').forEach(entry => {
      let title = '';
      let prev = entry.previousElementSibling;
      while (prev) {
        if (prev.classList.contains('small1')) { title = prev.textContent.trim(); break; }
        if (prev.classList.contains('entrySeparator')) break;
        prev = prev.previousElementSibling;
      }

      const defs = [];
      entry.querySelectorAll('li.sense').forEach(li => {
        const defEl = li.querySelector('.definition');
        if (!defEl) return;
        const text = defEl.textContent.replace(/\s+/g, ' ').trim();
        const exEls = li.querySelectorAll('.example');
        const example = exEls.length ? [...exEls].map(e => e.textContent.trim()).join('; ') : '';
        if (text) defs.push({ text, example });
      });
      if (defs.length) sections.push({ title: title || 'Collins English Dictionary', defs });
    });

    return sections;
  }

  // dialect: 'us' (default) or 'uk'; falls back to the other when one is missing
  function extractIPA(doc, dialect) {
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

    if ((dialect || 'us') === 'us') return usIPA || ukIPA;
    return ukIPA || usIPA;
  }

  globalThis.WRParser = { parseWR, parseEnDef, extractIPA };
})();
