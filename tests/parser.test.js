/**
 * Unit tests for the WR HTML parsers in scripts/content.js.
 *
 * The parsers (parseWR, parseEnDef, extractIPA) live inside content.js's
 * IIFE, so they can't be required directly. We extract their source by
 * regex and re-evaluate them in a clean scope with a jsdom Document. This
 * keeps content.js untouched and tests the production parser code verbatim.
 *
 * Fixtures are minimal handcrafted HTML mirroring the structure of real
 * WordReference responses (table#WRD with td.FrWrd/.ToWrd/.To2 cells for
 * bilingual lookups; div.entryRH ol > li with .rh_def/.rh_ex spans for
 * English monolingual definitions).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const CONTENT_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'content.js'),
  'utf8'
);

function extractFunction(name) {
  const headerRe = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = CONTENT_SRC.match(headerRe);
  if (!m) throw new Error(`Could not locate function ${name} in content.js`);
  let depth = 0;
  let started = false;
  for (let i = m.index; i < CONTENT_SRC.length; i++) {
    const ch = CONTENT_SRC[i];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) return CONTENT_SRC.substring(m.index, i + 1); }
  }
  throw new Error(`Unbalanced braces extracting ${name}`);
}

function loadParser(name) {
  const src = extractFunction(name);
  return new Function(`${src} return ${name};`)();
}

const parseWR = loadParser('parseWR');
const parseEnDef = loadParser('parseEnDef');
const extractIPA = (() => {
  // extractIPA depends on a closed-over `settings` variable; provide a stub
  // and recompile so the function reads the test-supplied dialect.
  const src = extractFunction('extractIPA');
  return (doc, dialect) => {
    const settings = { ipaDialect: dialect || 'us' };
    return new Function('settings', `${src} return extractIPA;`)(settings)(doc);
  };
})();

function html(body) {
  return new JSDOM(`<!doctype html><html><body>${body}</body></html>`).window.document;
}

// ── parseWR ────────────────────────────────────────────────────────────────

test('parseWR returns [] when no WRD table present', () => {
  const doc = html('<p>WordReference is being weird today.</p>');
  assert.deepEqual(parseWR(doc), []);
});

test('parseWR extracts a single bilingual entry with translations', () => {
  const doc = html(`
    <table id="WRD">
      <tbody>
        <tr>
          <td class="FrWrd"><strong>hello</strong> <em class="POS2">interj</em></td>
          <td class="To2">(greeting)</td>
          <td class="ToWrd">hola <em>interj</em></td>
        </tr>
        <tr>
          <td></td>
          <td></td>
          <td class="ToWrd">buenas <em>interj</em></td>
        </tr>
      </tbody>
    </table>
  `);

  const rows = parseWR(doc);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].from, 'hello');
  assert.equal(rows[0].fromPos, 'interj');
  assert.equal(rows[0].translations.length, 2);
  assert.equal(rows[0].translations[0].word, 'hola');
  assert.equal(rows[0].translations[0].pos, 'interj');
  assert.equal(rows[0].translations[0].gloss, 'greeting');
  assert.equal(rows[0].translations[1].word, 'buenas');
});

test('parseWR captures multiple from-entries on the same lookup', () => {
  const doc = html(`
    <table class="WRD">
      <tbody>
        <tr>
          <td class="FrWrd"><strong>start</strong> <em>n</em></td>
          <td class="To2">(beginning)</td>
          <td class="ToWrd">comienzo <em>nm</em></td>
        </tr>
        <tr>
          <td class="FrWrd"><strong>start</strong> <em>vi</em></td>
          <td class="To2">(begin)</td>
          <td class="ToWrd">empezar <em>vi</em></td>
        </tr>
      </tbody>
    </table>
  `);

  const rows = parseWR(doc);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].fromPos, 'n');
  assert.equal(rows[1].fromPos, 'vi');
  assert.equal(rows[0].translations[0].word, 'comienzo');
  assert.equal(rows[1].translations[0].word, 'empezar');
});

test('parseWR strips em/sup/.tooltip noise from cell text', () => {
  const doc = html(`
    <table id="WRD">
      <tbody>
        <tr>
          <td class="FrWrd">
            <strong>book<sup>1</sup></strong>
            <em class="POS2">n</em>
            <span class="tooltip">stuff</span>
          </td>
          <td class="ToWrd">livro <em>nm</em></td>
        </tr>
      </tbody>
    </table>
  `);

  const rows = parseWR(doc);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].from, 'book');
  assert.equal(rows[0].translations[0].word, 'livro');
});

test('parseWR ignores rows without a ToWrd cell', () => {
  const doc = html(`
    <table id="WRD">
      <tbody>
        <tr><td colspan="3">Section header — no translation</td></tr>
        <tr>
          <td class="FrWrd"><strong>real</strong> <em>adj</em></td>
          <td class="ToWrd">real <em>adj</em></td>
        </tr>
      </tbody>
    </table>
  `);

  const rows = parseWR(doc);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].from, 'real');
});

// ── parseEnDef ─────────────────────────────────────────────────────────────

test('parseEnDef returns [] when no entries are present', () => {
  const doc = html('<p>No definitions here.</p>');
  assert.deepEqual(parseEnDef(doc), []);
});

test('parseEnDef extracts Random House entries with examples and labels stripped', () => {
  const doc = html(`
    <div class="entryRH">
      <ol>
        <li>
          <span class="rh_def">
            <span class="rh_lab">archaic</span>
            <span class="rh_cat">verb</span>
            to greet politely.
            <span class="rh_ex">She started the meeting.</span>
          </span>
        </li>
        <li>
          <span class="rh_def">a beginning of an action.</span>
        </li>
      </ol>
    </div>
  `);

  const defs = parseEnDef(doc);
  assert.equal(defs.length, 2);
  assert.equal(defs[0].text, 'to greet politely.');
  assert.equal(defs[0].example, 'She started the meeting.');
  assert.equal(defs[1].text, 'a beginning of an action.');
  assert.equal(defs[1].example, '');
});

test('parseEnDef extracts Collins entries with multiple examples joined', () => {
  const doc = html(`
    <div class="superentry collinsen">
      <ul>
        <li class="sense">
          <span class="definition">to begin doing something</span>
          <span class="example">She started early.</span>
          <span class="example">They started to laugh.</span>
        </li>
      </ul>
    </div>
  `);

  const defs = parseEnDef(doc);
  assert.equal(defs.length, 1);
  assert.equal(defs[0].text, 'to begin doing something');
  assert.equal(defs[0].example, 'She started early.; They started to laugh.');
});

test('parseEnDef merges Random House and Collins entries together', () => {
  const doc = html(`
    <div class="entryRH">
      <ol><li><span class="rh_def">RH definition</span></li></ol>
    </div>
    <div class="superentry collinsen">
      <ul><li class="sense"><span class="definition">Collins definition</span></li></ul>
    </div>
  `);

  const defs = parseEnDef(doc);
  assert.equal(defs.length, 2);
  assert.equal(defs[0].text, 'RH definition');
  assert.equal(defs[1].text, 'Collins definition');
});

// ── extractIPA ─────────────────────────────────────────────────────────────

test('extractIPA returns the US IPA when dialect is us', () => {
  const doc = html(`
    <span class="pronWR">/həˈləʊ/</span>
    <span class="pronRH">/heˈloʊ/</span>
    <span class="pronRH">hə-LOH</span>
  `);
  assert.equal(extractIPA(doc, 'us'), '/heˈloʊ/');
});

test('extractIPA returns the UK IPA when dialect is uk', () => {
  const doc = html(`
    <span class="pronWR">/həˈləʊ/</span>
    <span class="pronRH">/heˈloʊ/</span>
  `);
  assert.equal(extractIPA(doc, 'uk'), '/həˈləʊ/');
});

test('extractIPA falls back to the available dialect when one is missing', () => {
  const ukOnly = html('<span class="pronWR">/wɜːd/</span>');
  assert.equal(extractIPA(ukOnly, 'us'), '/wɜːd/');

  const usOnly = html('<span class="pronRH">/wɝːd/</span>');
  assert.equal(extractIPA(usOnly, 'uk'), '/wɝːd/');
});

test('extractIPA returns null when no pronunciation spans exist', () => {
  const doc = html('<p>No phonetics available.</p>');
  assert.equal(extractIPA(doc, 'us'), null);
});

test('extractIPA skips US respelling spans (those without leading slash)', () => {
  const doc = html(`
    <span class="pronRH">huh-LOH</span>
    <span class="pronRH">/həˈloʊ/</span>
  `);
  assert.equal(extractIPA(doc, 'us'), '/həˈloʊ/');
});
