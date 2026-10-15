/**
 * Headed browser checks: popup, in-page bubble, settings page, favorites
 * from several pages at once, English mode, and the Alt+X injection list.
 * Uses live WordReference; the bubble runs on a routed local https page.
 *
 *   npm run test:e2e
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { launch, createRunner, TIMEOUT: T } = require('./helpers');

const LANG_LABELS = ['ingilizce', 'türkçe', 'english', 'turkish', 'inglés', 'español'];

(async () => {
  const { context, sw, base, out, shot, storedIds } = await launch('extension');
  const { step, expect, finish } = createRunner();

  const problems = [];
  const watch = p => {
    p.on('pageerror', e => problems.push(`${p.url()}: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error') problems.push(`${p.url()}: ${m.text()}`); });
  };
  context.pages().forEach(watch);
  context.on('page', watch);

  await step('service worker starts and owns favorites storage', async () => {
    const t = await sw.evaluate(() => `${typeof WRFavorites}/${typeof window}`);
    expect(t === 'object/undefined', `WRFavorites/window in worker = ${t}`);
  });

  const popup = await context.newPage();
  async function popupSearch(word) {
    await popup.goto(`${base}/popup.html`);
    await popup.fill('#search-input', word);
    await popup.press('#search-input', 'Enter');
  }

  await step('popup: Turkish lookup for "book" shows translations', async () => {
    await popupSearch('book');
    await popup.waitForSelector('#favorite-btn:not([disabled])', { timeout: T });
    expect(/kitap/i.test(await popup.locator('#content').innerText()), 'no "kitap" in results');
    await shot(popup, '1-popup-results');
  });

  await step('popup: ☆ saves the word', async () => {
    await popup.click('#favorite-btn');
    await popup.waitForFunction(() => document.getElementById('favorite-status').textContent === 'Saved', null, { timeout: T });
    expect(await popup.textContent('#favorite-btn') === '★', 'button not filled');
    expect((await storedIds()).includes('entr::book'), 'not in storage');
  });

  await step('popup: reopened popup shows the word as saved', async () => {
    await popupSearch('book');
    await popup.waitForFunction(() => document.getElementById('favorite-btn').textContent === '★', null, { timeout: T });
  });

  // A local https page (routed, never hits the network) so the content script runs on it.
  await context.route('https://wrdict-e2e.test/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>wrdict e2e</title><body style="font:32px/1.6 sans-serif;padding:40px">'
      + '<h1 id="w1">apple</h1><p id="w2">garden</p></body>'
  }));
  const site = await context.newPage();
  await site.goto('https://wrdict-e2e.test/');
  await site.waitForTimeout(800); // content script runs at document_end

  await step('bubble: Alt + double-click shows translations, no language-name row', async () => {
    await site.locator('#w1').dblclick({ modifiers: ['Alt'], position: { x: 20, y: 20 } });
    await site.waitForSelector('#wr-selection-popup .wr-row, #wr-selection-popup .wr-err', { timeout: T });
    const rows = await site.locator('#wr-selection-popup .wr-from').allInnerTexts();
    expect(rows.length > 0, `no rows: ${await site.locator('#wr-selection-popup').innerText()}`);
    expect(!LANG_LABELS.some(l => rows[0].trim().toLowerCase().startsWith(l)), `first row is a language label: "${rows[0]}"`);
    await shot(site, '2-bubble');
    return `first row "${rows[0].trim().replace(/\s+/g, ' ')}"`;
  });

  await step('bubble: ☆ saves the word', async () => {
    await site.click('#wr-selection-popup .wr-fav-btn');
    await site.waitForFunction(() => document.querySelector('#wr-selection-popup .wr-fav-status')?.textContent === 'Saved', null, { timeout: T });
    expect((await storedIds()).includes('entr::apple'), 'not in storage');
  });

  await step('bubble: select a word + Alt+Q opens the bubble', async () => {
    await site.keyboard.press('Escape');
    await site.locator('#w2').dblclick({ position: { x: 20, y: 20 } }); // plain double-click only selects
    await site.keyboard.press('Alt+q');
    await site.waitForSelector('#wr-selection-popup .wr-row, #wr-selection-popup .wr-err', { timeout: T });
    expect(await site.locator('#wr-selection-popup .wr-row').count() > 0, 'no rows');
  });

  const settings = await context.newPage();
  await settings.goto(`${base}/info.html`);
  const listedIds = () => settings.locator('[data-favorite-delete]').evaluateAll(els => els.map(e => e.dataset.favoriteDelete));

  await step('settings: list shows both saved words', async () => {
    await settings.waitForSelector('[data-favorite-delete]', { timeout: T });
    const ids = await listedIds();
    expect(ids.includes('entr::book') && ids.includes('entr::apple'), `list = ${ids}`);
  });

  await step('settings: Delete removes one word', async () => {
    await settings.click('[data-favorite-delete="entr::book"]');
    await settings.waitForFunction(() => !document.querySelector('[data-favorite-delete="entr::book"]'), null, { timeout: T });
    expect(!(await storedIds()).includes('entr::book'), 'still in storage');
  });

  await step('settings: Export downloads an .xlsx file', async () => {
    const [dl] = await Promise.all([settings.waitForEvent('download', { timeout: T }), settings.click('#favorites-export-btn')]);
    const file = path.join(out, dl.suggestedFilename());
    await dl.saveAs(file);
    const size = fs.statSync(file).size;
    expect(file.endsWith('.xlsx') && size > 1000, `${dl.suggestedFilename()} ${size} bytes`);
    return `${size} bytes`;
  });

  await step('settings: Clear empties the list (after confirm)', async () => {
    settings.once('dialog', d => d.accept());
    await settings.click('#favorites-clear-btn');
    await settings.waitForFunction(() => !document.querySelector('[data-favorite-delete]'), null, { timeout: T });
    expect((await storedIds()).length === 0, 'storage not empty');
  });

  await step('50 saves from two pages + a delete from a third are all applied', async () => {
    const pageA = await context.newPage();
    await pageA.goto(`${base}/popup.html`);
    const pageB = await context.newPage();
    await pageB.goto(`${base}/info.html`);
    await pageA.evaluate(() => WRFavorites.addFavorite({ word: 'old', dir: 'enfr', createdAt: 1 }));
    const addMany = ({ prefix, offset }) => Promise.all(Array.from({ length: 25 }, (_, i) =>
      WRFavorites.addFavorite({ word: `${prefix}${i}`, dir: 'enfr', createdAt: offset + i })));
    await Promise.all([
      pageA.evaluate(addMany, { prefix: 'a', offset: 10 }),
      pageB.evaluate(addMany, { prefix: 'b', offset: 100 }),
      settings.evaluate(() => WRFavorites.removeFavorite('enfr::old'))
    ]);
    const ids = await storedIds();
    await pageA.close();
    await pageB.close();
    await settings.evaluate(() => WRFavorites.clearFavorites());
    expect(ids.length === 50 && !ids.includes('enfr::old'), `${ids.length} stored, old present: ${ids.includes('enfr::old')}`);
  });

  await step('English mode: definitions and pronunciation in the popup', async () => {
    await settings.reload();
    await settings.selectOption('#lang-pair-select', 'en');
    await popup.waitForTimeout(500);
    await popupSearch('book');
    await popup.waitForSelector('.wr-def-list li', { timeout: T });
    await popup.waitForFunction(() => document.getElementById('ipa-inline').textContent.trim() !== '', null, { timeout: T });
    await shot(popup, '3-popup-english');
    await settings.selectOption('#lang-pair-select', 'tr');
    return `${await popup.locator('.wr-def-list li').count()} definitions`;
  });

  await step('Alt+X fallback: injected favorites.js + parser.js + content.js load together', async () => {
    // Chrome's command shortcuts can't be pressed from a test; inject the
    // same file list as background.js on a page with host permission.
    const wr = await context.newPage();
    await wr.goto('https://www.wordreference.com/');
    const t = await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://www.wordreference.com/*' });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scripts/favorites.js', 'scripts/parser.js', 'scripts/content.js'] });
      const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => `${typeof WRFavorites}/${typeof WRParser}` });
      return r.result;
    });
    await wr.close();
    expect(t === 'object/object', t);
  });

  await step('PDF viewer page loads the shared scripts', async () => {
    const pdf = await context.newPage();
    await pdf.goto(`${base}/pdf-viewer.html`);
    const t = await pdf.evaluate(() => `${typeof WRFavorites}/${typeof WRParser}`);
    await pdf.close();
    expect(t === 'object/object', t);
  });

  await step('no script errors in extension pages', async () => {
    const own = problems.filter(p => p.startsWith('chrome-extension://') || /WRParser|WRFavorites|wr-favorites/.test(p));
    expect(own.length === 0, own.join(' | '));
  });

  const code = finish(out);
  await context.close();
  process.exit(code);
})().catch(e => { console.error(e); process.exit(2); });
