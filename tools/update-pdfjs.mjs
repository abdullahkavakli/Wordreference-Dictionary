/**
 * Replaces vendor/pdfjs/ with Mozilla's prebuilt PDF.js viewer (legacy build,
 * Chrome 125+) and wires the extension's scripts into its viewer.html.
 *
 *   node tools/update-pdfjs.mjs [version]     e.g. 6.4.299
 *
 * Needs curl and unzip (Linux, macOS or WSL). Review the diff afterwards and
 * run `npm run test:e2e`: the viewer.html patches below fail loudly if a new
 * PDF.js release changes the markup they look for.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = process.argv[2] || '6.4.299';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'vendor', 'pdfjs');

// Viewer languages kept: the extension's own _locales, mapped to PDF.js names.
// Anything else falls back to the viewer's built-in English.
const LOCALES = ['de', 'en-US', 'es-ES', 'fr', 'it', 'pt-BR', 'pt-PT', 'tr'];

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfjs-'));
const zip = path.join(work, 'dist.zip');
const url = `https://github.com/mozilla/pdf.js/releases/download/v${VERSION}/pdfjs-${VERSION}-legacy-dist.zip`;
execFileSync('curl', ['-fsSL', '-o', zip, url], { stdio: 'inherit' });
const sha256 = createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
const src = path.join(work, 'dist');
execFileSync('unzip', ['-q', zip, '-d', src]);

const copy = (from, to = from) => fs.cpSync(path.join(src, from), path.join(DEST, to), { recursive: true });

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(path.join(DEST, 'web', 'locale'), { recursive: true });
copy('LICENSE');
copy('build/pdf.mjs');
copy('build/pdf.worker.mjs');
for (const f of ['viewer.mjs', 'viewer.css', 'images', 'cmaps', 'standard_fonts', 'iccs']) copy(`web/${f}`);

// With useSystemFonts (the browser default) PDF.js only loads Symbol and
// ZapfDingbats from standard_fonts/, so the Liberation fonts (GPL-2.0 with a
// font exception) are never used; leave them out.
for (const f of fs.readdirSync(path.join(DEST, 'web', 'standard_fonts'))) {
  if (/liberation/i.test(f)) fs.rmSync(path.join(DEST, 'web', 'standard_fonts', f));
}

// The viewer runs with useWasm off (the extension's CSP blocks WebAssembly),
// so only the JavaScript decoders and the licenses are needed.
fs.mkdirSync(path.join(DEST, 'web', 'wasm'));
for (const f of fs.readdirSync(path.join(src, 'web', 'wasm'))) {
  if (/_nowasm_fallback\.js$|^LICENSE_(PDFJS_)?(JBIG2|OPENJPEG)$/.test(f)) copy(`web/wasm/${f}`);
}

const localeMap = JSON.parse(fs.readFileSync(path.join(src, 'web', 'locale', 'locale.json'), 'utf8'));
const keptLocales = Object.fromEntries(Object.entries(localeMap).filter(([, file]) => LOCALES.includes(file.split('/')[0])));
fs.writeFileSync(path.join(DEST, 'web', 'locale', 'locale.json'), JSON.stringify(keptLocales));
for (const l of LOCALES) copy(`web/locale/${l}`);

// viewer.html: allow the bubble's <style> element and reading local
// (file://) PDFs, and load the extension's scripts after the viewer markup.
let html = fs.readFileSync(path.join(src, 'web', 'viewer.html'), 'utf8');
function patch(find, replace) {
  if (html.split(find).length !== 2) throw new Error(`viewer.html: expected exactly one "${find}"`);
  html = html.replace(find, replace);
}
patch("style-src 'self';", "style-src 'self' 'unsafe-inline';");
patch('connect-src * blob: data:;', 'connect-src * blob: data: file:;');
patch('  </body>', [
  '    <!-- wrdict: added by tools/update-pdfjs.mjs -->',
  '    <script src="/scripts/pdf-bridge.js"></script>',
  '    <script src="/scripts/favorites.js"></script>',
  '    <script src="/scripts/parser.js"></script>',
  '    <script src="/scripts/content.js"></script>',
  '  </body>'
].join('\n'));
fs.writeFileSync(path.join(DEST, 'web', 'viewer.html'), html);

fs.rmSync(work, { recursive: true, force: true });
console.log(`PDF.js ${VERSION} (legacy) -> vendor/pdfjs\n${url}\nsha256 ${sha256}`);
