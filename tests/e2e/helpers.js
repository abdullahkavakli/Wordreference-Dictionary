/**
 * Shared setup for the headed browser checks in tests/e2e/.
 *
 * Each run loads the store payload (tracked files under the same
 * export-ignore rules as the store ZIP, including uncommitted edits) into a
 * fresh Chromium profile. Run headed: WordReference rejects headless Chrome
 * (HTTP 403), so lookups only work in a visible window.
 */

'use strict';

const { chromium } = require('playwright-core');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const TIMEOUT = 30000;

function buildPayload(dir) {
  // `git stash create` snapshots tracked edits without touching the tree;
  // it prints nothing when the tree is clean.
  const ref = execSync('git stash create', { cwd: ROOT }).toString().trim() || 'HEAD';
  execSync(`git archive ${ref} | tar -x -C "${dir}"`, { cwd: ROOT });
}

// allUrls: grant <all_urls> up front, as a user does when turning on the PDF
// viewer in settings (a test can't click Chrome's permission prompt).
async function launch(name, { allUrls = false } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `wrdict-e2e-${name}-`));
  const ext = path.join(work, 'extension');
  fs.mkdirSync(ext);
  buildPayload(ext);
  if (allUrls) {
    const file = path.join(ext, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.host_permissions.push('<all_urls>');
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  }

  const headless = process.env.HEADLESS === '1';
  if (headless) console.warn('HEADLESS=1: WordReference rejects headless Chrome, so lookups will fail.');

  const context = await chromium.launchPersistentContext(path.join(work, 'profile'), {
    executablePath: process.env.CHROME_PATH || undefined,
    headless,
    slowMo: headless ? 0 : 200,
    viewport: { width: 1200, height: 800 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: TIMEOUT });
  const storedIds = () => sw.evaluate(() => new Promise(resolve =>
    chrome.storage.local.get({ favorites: { items: [] } }, d => resolve(d.favorites.items.map(i => i.id)))));

  return {
    context,
    sw,
    base: `chrome-extension://${sw.url().split('/')[2]}`,
    ext,
    out: work,
    shot: (page, file) => page.screenshot({ path: path.join(work, `${file}.png`) }),
    storedIds
  };
}

function createRunner() {
  const results = [];

  async function step(name, fn) {
    try {
      const note = await fn();
      results.push(true);
      console.log(`PASS  ${name}${note ? `  (${note})` : ''}`);
    } catch (e) {
      results.push(false);
      console.log(`FAIL  ${name}  -> ${e.message.split('\n')[0]}`);
    }
  }

  function expect(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  // Prints the tally and returns the process exit code.
  function finish(out) {
    const failed = results.filter(ok => !ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed. Screenshots: ${out}`);
    return failed ? 1 : 0;
  }

  return { step, expect, finish };
}

module.exports = { launch, createRunner, TIMEOUT };
