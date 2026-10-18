/**
 * Headed browser checks: PDFs. With the PDF viewer setting on, .pdf links
 * open in Mozilla's PDF.js viewer (vendor/pdfjs/web/viewer.html) with the
 * bubble wired in; with it off, Chrome's own viewer gets the bubble through
 * the right-click menu. PDFs are built with headless Chromium and served from
 * a local server. Uses live WordReference for the lookups.
 *
 * Chrome's shortcuts and right-click menu can't be pressed from a test, so
 * those steps call the background functions they run (lookupSelectionInTab,
 * lookupTermFromMenu).
 *
 *   npm run test:e2e
 */

'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const { launch, createRunner, TIMEOUT: T } = require('./helpers');

const EN = 'The library opened early on Monday, and the students carried their heavy books through the quiet garden toward the reading room near the old river bridge.';
const TR = 'Kütüphane pazartesi sabahı erkenden açıldı ve öğrenciler ağır kitaplarını sessiz bahçeden geçirerek eski köprünün yanındaki okuma salonuna taşıdılar.';
const MAX_DRIFT_PX = 3;
const LONG_PAGES = 40;

// page.pdf() only works headless, so the fixtures come from a separate browser.
async function makePdfs(dir) {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  const page = await browser.newPage();
  const render = async (file, sections) => {
    const html = sections.map((s, i) => `<section style="${i ? 'break-before:page' : ''}">${s}</section>`).join('');
    await page.setContent(`<!doctype html><body style="margin:0;font-family:serif">${html}</body>`);
    await page.pdf({ path: path.join(dir, file), format: 'A4', margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' } });
  };
  const body = `<p style="font-size:9pt">${EN} ${EN}</p>
    <p style="font-size:11pt">${EN} ${EN}</p>
    <p style="font-size:14pt">${EN}</p>
    <p style="font-size:11pt;font-family:sans-serif">${EN}</p>
    <p style="font-size:11pt">${TR} ${TR}</p>`;
  await render('sample.pdf', [body, body, body]);
  await render('long.pdf', Array.from({ length: LONG_PAGES }, (_, i) => `<h1>Page ${i + 1}</h1><p>${EN.repeat(8)}</p>`));
  await browser.close();
}

function serve(dir) {
  const pdf = name => fs.readFileSync(path.join(dir, name));
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const ok = buf => { res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(buf); };
    if (u.pathname === '/docs/sample.pdf' || u.pathname === '/c++.pdf' || u.pathname === '/50%25.pdf') return ok(pdf('sample.pdf'));
    if (u.pathname === '/docs/long.pdf') return ok(pdf('long.pdf'));
    if (u.pathname === '/get.pdf' && u.searchParams.get('id') === '7' && u.searchParams.get('token') === 'abc') return ok(pdf('sample.pdf'));
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

// For each line-sized text-layer span on page 1, compare its edges with where
// PDF.js says the text is drawn.
function measure(viewer) {
  return viewer.evaluate(async () => {
    const app = window.PDFViewerApplication;
    const pageView = app.pdfViewer.getPageView(0);
    const vp = pageView.viewport;
    const items = (await (await app.pdfDocument.getPage(1)).getTextContent()).items.filter(i => i.str !== '');
    const layer = pageView.div.querySelector('.textLayer');
    const box = layer.getBoundingClientRect();
    const spans = [...layer.querySelectorAll('span')].filter(s => !s.classList.contains('markedContent'));
    const rows = [];
    for (let k = 0, s = 0; k < items.length && s < spans.length; k++) {
      const it = items[k];
      const sp = spans[s];
      if (sp.textContent !== it.str) continue;
      s++;
      if (it.str.length < 20 || it.transform[1] !== 0 || it.transform[2] !== 0) continue;
      const [x0, y0] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      const [x1] = vp.convertToViewportPoint(it.transform[4] + it.width, it.transform[5]);
      const fh = Math.abs(it.transform[3]) * vp.scale;
      const r = sp.getBoundingClientRect();
      rows.push({
        str: it.str, x0, x1, y0, fh, top: box.top, left: box.left, fontFamily: getComputedStyle(sp).fontFamily,
        drift: Math.max(Math.abs(r.left - box.left - x0), Math.abs(r.right - box.left - x1))
      });
    }
    return { scale: app.pdfViewer.currentScale, rows };
  });
}

// Centre of a word as drawn: its share of the line's width, measured in the
// text layer's font, applied to the line's true extent.
function wordCentre(viewer, row, word, index) {
  return viewer.evaluate(({ row, word, index }) => {
    const c = document.createElement('canvas').getContext('2d');
    c.font = `100px ${row.fontFamily}`;
    const w = t => c.measureText(t).width;
    const share = (w(row.str.slice(0, index)) + w(word) / 2) / w(row.str);
    return { x: row.left + row.x0 + (row.x1 - row.x0) * share, y: row.top + row.y0 - row.fh * 0.3 };
  }, { row, word, index });
}

const lastWord = str => [...str.matchAll(/\p{L}{4,}/gu)].pop();
const worst = rows => rows.reduce((a, r) => (r.drift > a.drift ? r : a), { drift: 0, str: '' });
const bubbleTerm = page => page.evaluate(() => {
  const el = document.querySelector('#wr-selection-popup .wr-hd > span, #wr-selection-popup .wr-err strong');
  return el ? el.firstChild.textContent.trim() : null;
});

(async () => {
  const { context, sw, base, out, shot } = await launch('pdf', { allUrls: true });
  const { step, expect, finish } = createRunner();
  const viewerUrl = `${base}/vendor/pdfjs/web/viewer.html`;

  await makePdfs(out);
  const { server, origin } = await serve(out);

  // PDF.js keeps a reference to window.print; replace it first so printing
  // can be checked without Chrome's print dialog.
  await context.addInitScript(() => {
    if (location.protocol === 'chrome-extension:') window.print = () => { window.__wrPrinted = true; };
  });

  // missing.pdf is meant to fail, so its errors don't count.
  const problems = [];
  const counts = p => !p.url().includes('missing.pdf');
  context.on('page', p => {
    p.on('pageerror', e => { if (counts(p)) problems.push(`${p.url()}: ${e.message}`); });
    p.on('console', m => {
      if (m.type() === 'error' && p.url().startsWith(base) && counts(p)) problems.push(`${p.url()}: ${m.text()}`);
    });
  });

  const setViewer = async on => {
    await sw.evaluate(v => chrome.storage.sync.set({ pdfViewerEnabled: v }), on);
    await sw.evaluate(async v => {
      for (let i = 0; i < 50; i++) {
        if ((await chrome.declarativeNetRequest.getDynamicRules()).length === (v ? 1 : 0)) return;
        await new Promise(r => setTimeout(r, 100));
      }
    }, on);
  };
  const tabIdOf = page => page.evaluate(() => new Promise(r => chrome.tabs.getCurrent(t => r(t.id))));
  const openPdf = async url => {
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.PDFViewerApplication?.pdfDocument
      && document.querySelector('.page .textLayer span'), null, { timeout: T });
    return page;
  };

  await setViewer(true);
  let viewer = null;

  await step('a .pdf link opens in the PDF.js viewer', async () => {
    viewer = await openPdf(`${origin}/docs/sample.pdf`);
    const pages = await viewer.evaluate(() => PDFViewerApplication.pdfDocument.numPages);
    expect(viewer.url().startsWith(viewerUrl) && pages === 3, `${viewer.url()} / ${pages} pages`);
  });

  await step(`text layer sits on the drawn words (within ${MAX_DRIFT_PX}px)`, async () => {
    const { scale, rows } = await measure(viewer);
    const w = worst(rows);
    expect(rows.length > 5, `only ${rows.length} lines measured`);
    expect(w.drift <= MAX_DRIFT_PX, `off by ${w.drift.toFixed(0)}px on "${w.str.slice(0, 40)}…"`);
    return `${rows.length} lines at ${Math.round(scale * 100)}%, worst ${w.drift.toFixed(1)}px`;
  });

  let probe = null;
  await step('double-click selects the word under the mouse', async () => {
    const { rows } = await measure(viewer);
    const lines = rows.filter(r => r.top + r.y0 < 760).slice(0, 8);
    probe = lines[0] && { row: lines[0], m: lastWord(lines[0].str) };
    const misses = [];
    for (const row of lines) {
      const m = lastWord(row.str);
      const { x, y } = await wordCentre(viewer, row, m[0], m.index);
      await viewer.mouse.click(5, 400); // clears the selection (grey margin)
      await viewer.mouse.dblclick(x, y);
      const got = await viewer.evaluate(() => getSelection().toString().trim());
      if (got !== m[0]) misses.push(`${m[0]} -> ${got || '(nothing)'}`);
    }
    expect(lines.length > 5 && misses.length === 0, misses.join(', ') || `only ${lines.length} lines`);
    return `${lines.length}/${lines.length} exact`;
  });

  await step('Alt + double-click looks up the clicked word', async () => {
    const { x, y } = await wordCentre(viewer, probe.row, probe.m[0], probe.m.index);
    await viewer.mouse.click(5, 400);
    await viewer.keyboard.down('Alt');
    await viewer.mouse.dblclick(x, y);
    await viewer.keyboard.up('Alt');
    await viewer.waitForSelector('#wr-selection-popup .wr-hd, #wr-selection-popup .wr-err', { timeout: T });
    await shot(viewer, 'pdf-1-bubble');
    const term = await bubbleTerm(viewer);
    expect(term === probe.m[0], `clicked "${probe.m[0]}", looked up "${term}"`);
    return `"${term}"`;
  });

  await step('Alt+X / Alt+Q reach the viewer (selected word)', async () => {
    await viewer.keyboard.press('Escape');
    const { x, y } = await wordCentre(viewer, probe.row, probe.m[0], probe.m.index);
    await viewer.mouse.dblclick(x, y); // plain double-click only selects
    const tabId = await tabIdOf(viewer);
    await sw.evaluate(id => lookupSelectionInTab({ id }), tabId);
    await viewer.waitForSelector('#wr-selection-popup .wr-hd, #wr-selection-popup .wr-err', { timeout: T });
    expect(await bubbleTerm(viewer) === probe.m[0], `bubble shows "${await bubbleTerm(viewer)}"`);
  });

  await step('right-click lookup shows the bubble in the viewer', async () => {
    await viewer.keyboard.press('Escape');
    const tabId = await tabIdOf(viewer);
    await sw.evaluate(id => lookupTermFromMenu({ id }, 'garden'), tabId);
    await viewer.waitForSelector('#wr-selection-popup .wr-hd, #wr-selection-popup .wr-err', { timeout: T });
    expect(await bubbleTerm(viewer) === 'garden', `bubble shows "${await bubbleTerm(viewer)}"`);
  });

  await step('Print prepares the pages and opens printing', async () => {
    await viewer.keyboard.press('Escape');
    await viewer.click('#printButton');
    await viewer.waitForFunction(() => window.__wrPrinted === true, null, { timeout: T });
  });

  await step('Save downloads the PDF', async () => {
    const [dl] = await Promise.all([viewer.waitForEvent('download', { timeout: T }), viewer.click('#downloadButton')]);
    const file = path.join(out, `saved-${dl.suggestedFilename()}`);
    await dl.saveAs(file);
    const same = fs.readFileSync(file).equals(fs.readFileSync(path.join(out, 'sample.pdf')));
    expect(dl.suggestedFilename() === 'sample.pdf' && same, `${dl.suggestedFilename()}, same bytes: ${same}`);
  });

  await step('"Open in Chrome\'s PDF viewer" leaves the extension viewer', async () => {
    await viewer.click('#secondaryToolbarToggleButton');
    await Promise.all([viewer.waitForURL(`${origin}/docs/sample.pdf`, { timeout: T }), viewer.click('#wrdictOpenInChrome')]);
    expect(await viewer.evaluate(() => document.contentType) === 'application/pdf', 'not Chrome\'s viewer');
    await viewer.close();
  });

  const long = await openPdf(`${origin}/docs/long.pdf`);

  await step(`only pages near the view are drawn (${LONG_PAGES}-page PDF)`, async () => {
    await long.waitForTimeout(1500);
    const drawn = await long.locator('.page canvas').count();
    expect(drawn < 10, `${drawn} pages drawn`);
    return `${drawn} of ${LONG_PAGES} drawn`;
  });

  await step('zooming in keeps you on the same page', async () => {
    await long.evaluate(() => { PDFViewerApplication.page = 20; });
    await long.waitForTimeout(800);
    await long.click('#zoomInButton');
    await long.click('#zoomInButton');
    await long.waitForTimeout(1500);
    const page = await long.evaluate(() => PDFViewerApplication.page);
    expect(page === 20, `on page ${page}`);
  });

  await step('page buttons step one page at a time when zoomed in', async () => {
    const seen = [];
    for (let i = 0; i < 2; i++) {
      await long.click('#next');
      await long.waitForTimeout(800);
      seen.push(await long.evaluate(() => PDFViewerApplication.page));
    }
    expect(seen.join(',') === '21,22', `pages: ${seen}`);
    await long.close();
  });

  await step('#page=3 in the link opens page 3', async () => {
    const p = await openPdf(`${origin}/docs/sample.pdf#page=3`);
    await p.waitForTimeout(800);
    const page = await p.evaluate(() => PDFViewerApplication.page);
    await p.close();
    expect(page === 3, `on page ${page}`);
  });

  for (const [label, url] of [
    ['an address with two query parameters', `${origin}/get.pdf?id=7&token=abc`],
    ['a file name with "+"', `${origin}/c++.pdf`],
    ['a file name with "%"', `${origin}/50%25.pdf`]
  ]) {
    await step(`opens ${label}`, async () => {
      const p = await openPdf(url);
      const pages = await p.evaluate(() => PDFViewerApplication.pdfDocument.numPages);
      await p.close();
      expect(pages === 3, `${pages} pages`);
    });
  }

  // Unpacked test copies get "Allow access to file URLs" by default; store
  // installs need the user to turn it on (see the note in info.html).
  await step('a PDF on this computer (file://) opens in the viewer, and in Chrome\'s from there', async () => {
    fs.copyFileSync(path.join(out, 'sample.pdf'), path.join(out, 'local copy.pdf'));
    const fileUrl = pathToFileURL(path.join(out, 'local copy.pdf')).href;
    const p = await openPdf(fileUrl);
    const pages = await p.evaluate(() => PDFViewerApplication.pdfDocument.numPages);
    expect(p.url().startsWith(viewerUrl) && pages === 3, `${p.url()} / ${pages} pages`);
    await p.click('#secondaryToolbarToggleButton');
    await Promise.all([p.waitForURL(fileUrl, { timeout: T }), p.click('#wrdictOpenInChrome')]);
    await p.close();
  });

  await step('a PDF that fails to load offers Chrome\'s viewer', async () => {
    const p = await context.newPage();
    await p.goto(`${origin}/missing.pdf`);
    await p.waitForSelector('#wrdict-error button', { timeout: T });
    await shot(p, 'pdf-2-load-error');
    await Promise.all([p.waitForURL(`${origin}/missing.pdf`, { timeout: T }), p.click('#wrdict-error button')]);
    await p.close();
  });

  // Chrome's own viewer: content.js runs in the tab (https only) but can't
  // see inside the PDF.
  await setViewer(false);
  await context.route('https://wrdict-e2e.test/**', route => route.fulfill({
    contentType: 'application/pdf', body: fs.readFileSync(path.join(out, 'sample.pdf'))
  }));
  const chromeTab = await context.newPage();
  await chromeTab.goto('https://wrdict-e2e.test/paper.pdf');
  await chromeTab.waitForTimeout(2500);
  const chromeTabId = () => sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://wrdict-e2e.test/*' }))[0].id);

  await step('Chrome\'s viewer: right-click lookup shows the bubble over the PDF', async () => {
    expect(await chromeTab.evaluate(() => document.contentType) === 'application/pdf', 'not Chrome\'s viewer');
    const id = await chromeTabId();
    await sw.evaluate(tabId => lookupTermFromMenu({ id: tabId }, 'garden'), id);
    await chromeTab.waitForSelector('#wr-selection-popup .wr-hd, #wr-selection-popup .wr-err', { timeout: T });
    await shot(chromeTab, 'pdf-3-chrome-viewer-bubble');
    expect(await bubbleTerm(chromeTab) === 'garden', `bubble shows "${await bubbleTerm(chromeTab)}"`);
  });

  await step('Chrome\'s viewer: clicking back into the PDF closes the bubble', async () => {
    await chromeTab.mouse.click(600, 500);
    await chromeTab.waitForSelector('#wr-selection-popup', { state: 'detached', timeout: 5000 });
  });

  await step('Chrome\'s viewer: Alt+X opens the paste box', async () => {
    const id = await chromeTabId();
    await sw.evaluate(tabId => lookupSelectionInTab({ id: tabId }), id);
    await chromeTab.waitForSelector('#wr-pdf-search', { timeout: T });
  });

  await step('no script errors in the extension\'s pages', async () => {
    expect(problems.length === 0, problems.join(' | '));
  });

  const code = finish(out);
  server.close();
  await context.close();
  process.exit(code);
})().catch(e => { console.error(e); process.exit(2); });
