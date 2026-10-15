/**
 * Headed browser checks: the in-page bubble on real Wikipedia articles
 * (English and Turkish). Uses live WordReference and Wikipedia.
 *
 * Words inside links are skipped on purpose: Chrome doesn't deliver a
 * double-click when Alt+clicking a link, so Alt + double-click can't open
 * the bubble there (Alt+Q still works).
 *
 *   npm run test:e2e
 */

'use strict';

const { launch, createRunner, TIMEOUT: T } = require('./helpers');

const LANG_LABELS = ['ingilizce', 'türkçe', 'english', 'turkish'];
const ARTICLE_TEXT = '#mw-content-text .mw-parser-output p:not(.mw-empty-elt)';

// Scroll the first plain-text (non-link) whole-word match in the article into view; return its centre.
async function locateWord(page, word) {
  const box = await page.evaluate(w => {
    const root = document.querySelector('#mw-content-text .mw-parser-output');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const re = new RegExp(`(^|[^\\p{L}])(${w})(?=[^\\p{L}]|$)`, 'iu');
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.parentElement.closest('p') || n.parentElement.closest('a, sup')) continue;
      const m = re.exec(n.data);
      if (!m) continue;
      const start = m.index + m[1].length;
      const range = document.createRange();
      range.setStart(n, start);
      range.setEnd(n, start + m[2].length);
      n.parentElement.scrollIntoView({ block: 'center' });
      const r = range.getBoundingClientRect();
      if (r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  }, word);
  if (!box) throw new Error(`"${word}" not found in article text`);
  return box;
}

async function bubbleFor(page, word, how) {
  await page.keyboard.press('Escape');
  const { x, y } = await locateWord(page, word);
  if (how === 'alt-dblclick') {
    await page.keyboard.down('Alt');
    await page.mouse.dblclick(x, y);
    await page.keyboard.up('Alt');
  } else {
    await page.mouse.dblclick(x, y); // plain double-click only selects
    await page.keyboard.press('Alt+q');
  }
  const popup = '#wr-selection-popup';
  await page.waitForSelector(`${popup} .wr-row, ${popup} .wr-def-row, ${popup} .wr-err`, { timeout: T });
  const rows = await page.locator(`${popup} .wr-from`).allInnerTexts();
  const err = await page.locator(`${popup} .wr-err`).count() ? await page.locator(`${popup} .wr-err`).innerText() : '';
  return {
    rows: rows.map(r => r.trim().replace(/\s+/g, ' ')),
    defs: await page.locator(`${popup} .wr-def-row`).count(),
    err
  };
}

async function openArticle(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(ARTICLE_TEXT);
  await page.waitForTimeout(800); // content script runs at document_end
  return page;
}

(async () => {
  const { context, sw, out, shot, storedIds } = await launch('wikipedia');
  const { step, expect, finish } = createRunner();
  const setLang = lang => sw.evaluate(l => chrome.storage.sync.set({ langPair: l }), lang);

  const problems = [];
  context.on('page', p => p.on('console', m => {
    if (m.type() === 'error' && /WRParser|WRFavorites|wr-favorites|wr-fetch/.test(m.text())) problems.push(m.text());
  }));

  const en = await openArticle(context, 'https://en.wikipedia.org/wiki/Book');

  await step('en.wikipedia: Alt + double-click "paper" shows Turkish translations', async () => {
    const r = await bubbleFor(en, 'paper', 'alt-dblclick');
    expect(r.rows.length > 0, `no rows (${r.err})`);
    expect(!LANG_LABELS.some(l => r.rows[0].toLowerCase().startsWith(l)), `first row is a language label: ${r.rows[0]}`);
    await shot(en, 'wiki-1-en-paper');
    return `${r.rows.length} rows, first "${r.rows[0]}"`;
  });

  await step('en.wikipedia: ☆ in the bubble saves the word', async () => {
    await en.click('#wr-selection-popup .wr-fav-btn');
    await en.waitForFunction(() => document.querySelector('#wr-selection-popup .wr-fav-status')?.textContent === 'Saved', null, { timeout: T });
    expect((await storedIds()).includes('entr::paper'), `stored: ${await storedIds()}`);
  });

  await step('en.wikipedia: select "library" + Alt+Q opens the bubble', async () => {
    const r = await bubbleFor(en, 'library', 'alt-q');
    expect(r.rows.length > 0, `no rows (${r.err})`);
  });

  await step('en.wikipedia: English mode shows definitions', async () => {
    await setLang('en');
    await en.waitForTimeout(500); // content.js picks the change up via storage.onChanged
    const r = await bubbleFor(en, 'printing', 'alt-dblclick');
    await setLang('tr');
    expect(r.defs > 0, `no definitions (${r.err})`);
    await shot(en, 'wiki-2-en-definitions');
    return `${r.defs} definitions`;
  });

  const tr = await openArticle(context, 'https://tr.wikipedia.org/wiki/Kitap');

  await step('tr.wikipedia: Alt + double-click a Turkish word, no language-name row', async () => {
    const r = await bubbleFor(tr, 'kitap', 'alt-dblclick');
    expect(r.rows.length > 0, `no rows (${r.err})`);
    expect(!r.rows.some(row => LANG_LABELS.includes(row.toLowerCase())), `language label among rows: ${r.rows}`);
    await shot(tr, 'wiki-3-tr-kitap');
    return r.rows.slice(0, 3).join(' | ');
  });

  await step('no extension errors in the console', async () => {
    expect(problems.length === 0, problems.join(' | '));
  });

  const code = finish(out);
  await context.close();
  process.exit(code);
})().catch(e => { console.error(e); process.exit(2); });
