/**
 * Unit tests for the WR HTML parsers in scripts/parser.js, shared by the
 * popup (popup.js) and the in-page bubble (content.js).
 *
 * parser.js is loaded verbatim into a Node vm sandbox and run against jsdom
 * Documents, so the tests exercise the code that ships.
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
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ctx = vm.createContext({ DOMParser: new JSDOM('').window.DOMParser });
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'scripts', 'parser.js'), 'utf8'),
  ctx
);
const { parseHTML, parseWR, parseEnDef, extractIPA } = ctx.WRParser;

// The bubble's flat view of the sectioned results (as content.js uses them).
const entriesOf = doc => parseWR(doc).flatMap(section => section.entries);
const defsOf = doc => parseEnDef(doc).flatMap(section => section.defs);

function html(body) {
  return new JSDOM(`<!doctype html><html><body>${body}</body></html>`).window.document;
}

// ── parseHTML ──────────────────────────────────────────────────────────────

test('parseHTML drops inline handlers but keeps the text and other attributes', () => {
  const doc = parseHTML(`<body onload="x()"><table id="WRD" class="WRD" onclick='y()'>
    <tr><td class="FrWrd" onmouseover=z()><strong>book</strong></td></tr></table>
    <p>read on=time, online</p></body>`);
  assert.strictEqual(doc.querySelectorAll('[onload],[onclick],[onmouseover]').length, 0);
  assert.strictEqual(doc.querySelector('#WRD.WRD .FrWrd strong').textContent, 'book');
  assert.ok(doc.body.textContent.includes('read on=time, online'));
});

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

  const rows = entriesOf(doc);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fromWord, 'hello');
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

  const rows = entriesOf(doc);
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

  const rows = entriesOf(doc);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fromWord, 'book');
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

  const rows = entriesOf(doc);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fromWord, 'real');
});

test('parseWR skips the language-label header row', () => {
  // Real WR markup: <tr class='langHeader'> holds FrWrd/ToWrd cells with the
  // language names, which must not show up as a translation.
  const doc = html(`
    <table id="WRD">
      <tbody>
        <tr class="wrtopsection"><td colspan="3" title="Principal Translations">Principal Translations</td></tr>
        <tr class="langHeader"><td class="FrWrd">İngilizce</td><td></td><td class="ToWrd">Türkçe</td></tr>
        <tr>
          <td class="FrWrd"><strong>book</strong> <em>n</em></td>
          <td class="ToWrd">kitap <em>i</em></td>
        </tr>
      </tbody>
    </table>
  `);

  const rows = entriesOf(doc);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fromWord, 'book');
  assert.equal(rows[0].translations[0].word, 'kitap');
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

  const defs = defsOf(doc);
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

  const defs = defsOf(doc);
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

  const defs = defsOf(doc);
  assert.equal(defs.length, 2);
  assert.equal(defs[0].text, 'RH definition');
  assert.equal(defs[1].text, 'Collins definition');
});

test('parseEnDef titles each section from the preceding span.small1', () => {
  const doc = html(`
    <span class="small1">WordReference Random House Learner's Dictionary</span>
    <div class="entryRH"><ol><li><span class="rh_def">RH definition</span></li></ol></div>
    <div class="entrySeparator"></div>
    <div class="superentry collinsen">
      <ul><li class="sense"><span class="definition">Collins definition</span></li></ul>
    </div>
  `);

  const sections = parseEnDef(doc);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].title, "WordReference Random House Learner's Dictionary");
  // The separator stops the search, so Collins falls back to its default title.
  assert.equal(sections[1].title, 'Collins English Dictionary');
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
