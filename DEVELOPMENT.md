# WordReference Dictionary — Developer Reference

The operational handbook ("I'm sitting at my keyboard right now and
want to change X").

## Contents

1. [Quick start](#quick-start)
2. [Where to edit X](#where-to-edit-x)
3. [Common tasks (recipes)](#common-tasks-recipes)
4. [Running and writing tests](#running-and-writing-tests)
5. [Debugging in Chrome](#debugging-in-chrome)
6. [Code conventions](#code-conventions)
7. [Release process](#release-process)
8. [Building the production ZIP](#building-the-production-zip)
9. [Useful chrome:// pages](#useful-chrome-pages)
10. [Common errors and fixes](#common-errors-and-fixes)
11. [Branching and commit style](#branching-and-commit-style)
12. [Dependencies and why each one is here](#dependencies-and-why-each-one-is-here)

---

## Quick start

```sh
git clone https://github.com/abdullahkavakli/Wordreference-Dictionary.git
cd Wordreference-Dictionary
npm install                # one-time, installs jsdom + playwright-core (dev only)
npm test                   # 38 tests, ~6s
npm run test:e2e           # headed browser checks, ~4 min (see below)
```

To load the unpacked extension in Chrome:

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked** → pick this project root.
4. Pin the toolbar icon for easy access during testing.

The extension reloads when you click the circular ↻ button on its
card in `chrome://extensions`. After manifest changes you **must**
reload (not just refresh the popup).

---

## Where to edit X

| Want to change… | File |
|---|---|
| Toolbar icon | `images/icon-{16,32,48,128}.png` (regen from `images/AppIcon.png` — see [recipe](#regenerate-the-icon-set)) |
| Popup search bar / result rendering | `popup.html` + `scripts/popup.js` |
| Settings / options page | `info.html` + `scripts/options.js` |
| First-install welcome screen | `welcome.html` (self-contained styles) |
| In-page translation bubble (Alt+X / Alt+Q / Alt+dblclick) | `scripts/content.js` |
| Right-click context menu / keyboard command handlers | `scripts/background.js` |
| Favorites storage API | `scripts/favorites.js` (runs in the background service worker; cover any change with a test in `tests/favorites.test.js`) |
| WR HTML parser (`parseWR`, `parseEnDef`, `extractIPA`) | `scripts/parser.js`, shared by the popup and the bubble — covered by `tests/parser.test.js` |
| PDF viewer (opt-in) | `pdf-viewer.html` + `scripts/pdf-viewer.js` forward `.pdf` links to Mozilla's viewer in `vendor/pdfjs/web/`; `scripts/pdf-bridge.js` sets it up and opens the file. Don't edit `vendor/pdfjs/` by hand: see [Updating PDF.js](#updating-pdfjs) |
| Right-click lookup in Chrome's own PDF viewer | `scripts/background.js` (`lookupTermFromMenu`) + `scripts/content.js` (`WR_LOOKUP_TERM`) |
| PDF viewer toggle behavior | `scripts/options.js` (UI) + `scripts/background.js` (`syncPdfViewerRule`) |
| Permissions, CSP, content-script matches, commands | `manifest.json` |
| Localized strings | `_locales/<lang>/messages.json` (en is master at 51 keys) |
| Color palette / popup styling | `styles/main.css` (CSS variables at the top); other copies listed under [CSS](#css) |
| Loading spinner | `styles/loading.css` |
| Third-party attribution | `THIRD_PARTY_NOTICES.md` |

---

## Common tasks (recipes)

### Add a new keyboard shortcut

1. Declare it in `manifest.json` under `commands`:
   ```json
   "your-command-name": {
     "suggested_key": { "default": "Alt+W" },
     "description": "__MSG_commandYourThingDescription__"
   }
   ```
2. Add `commandYourThingDescription` to `_locales/en/messages.json`
   and `_locales/tr/messages.json`.
3. Wire it in `scripts/background.js` `chrome.commands.onCommand`
   listener. If it should behave like Alt+X, add
   `&& command !== 'your-command-name'` to the early-return guard at
   the top of the listener. Don't use `||`: that makes the guard true
   for every command and breaks Alt+X/Alt+Q.
4. Alt+Z, Alt+X and Alt+Q are also handled in-page by the `keydown`
   listener in `scripts/content.js`, using the customizable
   `popupShortcutKey` / `shortcutKey` / `shortcutKey2` settings from
   the options page. A new command gets none of that unless you add
   it there (and a setting for it) too.
5. Reload the extension. Visit `chrome://extensions/shortcuts` to
   confirm Chrome accepted the suggested key (it may downgrade to
   "not set" if the chord conflicts with another extension). Chrome
   allows at most four suggested shortcuts per extension, and the
   manifest already declares three (including `_execute_action`).
6. Update the user-facing copy that mentions shortcuts:
   `welcome.html`, `info.html`, `popup.html` if applicable, plus the
   store description on the dashboard.
7. Update the test suite if the shortcut changes any flow logic.

### Add a new locale

1. `mkdir _locales/<code>` (use Chrome's locale codes: `es`, `fr`,
   `zh_CN`, `pt_BR`, etc.).
2. Copy `_locales/en/messages.json` to `_locales/<code>/messages.json`.
3. Translate each `"message"` value. Leave the `"description"` and
   `"placeholders"` fields alone — those are translator hints.
4. For partial coverage: keep only the keys you've translated and
   delete the rest. Chrome falls back to `en` for missing keys.
5. Reload the extension; switch Chrome's UI language at
   `chrome://settings/languages` and restart Chrome to test.
6. On the Web Store dashboard, **Translate-your-listing** tab —
   translate the title, summary, and full description for the same
   locale. The "Available in N languages" count on the listing comes
   from store-side translations, not from `_locales/`.

### Change a user-visible string

1. Find the existing key in `_locales/en/messages.json` (search for
   the English text — most strings have a key).
2. If it's a string with no key yet, add a new entry to all locale
   files (en, tr at minimum since those are 100%-coverage locales).
3. In the HTML, mark the element with a `data-i18n` attribute (or
   `data-i18n-placeholder`, `data-i18n-aria-label`,
   `data-i18n-title`, `data-i18n-value`, `data-i18n-alt` for the
   corresponding attributes). Leave the literal English text in place
   as a fallback.
4. Reload — `scripts/i18n.js` walks the DOM on `DOMContentLoaded`
   and substitutes the localized text.

### Regenerate the icon set

When you edit `images/AppIcon.png`:

```sh
python3 -c "
from PIL import Image
src = Image.open('images/AppIcon.png').convert('RGBA')
for s in (16, 32, 48, 128):
    src.resize((s, s), Image.LANCZOS).save(f'images/icon-{s}.png', 'PNG', optimize=True)
"
```

Hand-tune `images/icon-16.png` in an image editor afterwards —
Lanczos eats stroke detail at 16 px.

### Add a new option to the settings page

1. Define a default in `defaultSettings` at the top of
   `scripts/options.js`. Mirror it in `scripts/content.js`'s
   `defaultSettings` if the in-page bubble needs it, and in the inline
   defaults object passed to `chrome.storage.sync.get` at the top of
   `scripts/popup.js` if the popup needs it.
2. Add the form element in `info.html`. Use the existing styling —
   each setting sits in a `<div class="section-card">` with a
   `<label>` for the control and a `<span class="saved-status"
   data-i18n="optionsSaved">Saved.</span>` next to it.
3. Wire change-handler in `scripts/options.js` — pattern:
   `chrome.storage.sync.set({ key: value })` then briefly show the
   "Saved." status.
4. Read it where it's used. `popup.js` and `content.js` each have a
   `chrome.storage.onChanged` listener, but it only copies the keys it
   lists; add your key there if the change should apply live.

### Add a new test

```sh
# Tests live in tests/*.test.js and are picked up by the npm test glob.
touch tests/your-thing.test.js
```

Use Node's built-in `node:test` runner:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');

test('describes what should be true', () => {
  assert.equal(2 + 2, 4);
});
```

For tests that load production source code into a sandbox, copy the
`vm`/`chrome`/`window` mock setup from `tests/favorites.test.js`. For
DOM-driven tests, copy the vm + jsdom pattern from
`tests/parser.test.js`.

`assert.deepEqual` (non-strict) is preferred over `deepStrictEqual`
for arrays/objects coming out of a `vm` sandbox — strict comparison
fails on cross-realm prototypes even when contents match.

### Bump the extension version

Edit only the `manifest.json` `"version"` field. Chrome uses it, and the
`info.html` footer reads it at runtime (`chrome.runtime.getManifest()`
in `scripts/options.js`), so there is nothing to edit there.

Plus a git tag: `git tag -a vX.Y.Z -m "vX.Y.Z — what shipped"`.

`package.json` also has a `version` field but it's local-only; doesn't
matter to Chrome. Keep it in sync if you like neat manifests.

---

## Running and writing tests

### Run them

```sh
npm test
```

Output looks like:
```
1..38
# tests 38
# pass 38
# fail 0
# duration_ms 6142
```

### Run a single file

```sh
node --test tests/favorites.test.js
```

### Run a single test by name

```sh
node --test --test-name-pattern="addFavorite stores" tests/favorites.test.js
```

### What's covered

| Module | Test file | Tests | What's exercised |
|---|---|---|---|
| `scripts/favorites.js` | `tests/favorites.test.js` | 21 | makeFavoriteId normalization, add (success/dup/invalid/aliased fields), remove (hit/miss), clear, list (sort order), isFavorite[Id], legacy schema migration, dedup + invalid-item drop, 5000-cap eviction, serialization queue (50 concurrent + interleave), page copies forwarding to the service worker (results, errors, unreachable worker, overlapping writes from several pages) |
| `scripts/parser.js` | `tests/parser.test.js` | 17 | `parseHTML` (drops inline handlers), `parseWR` (empty, single, multi-entry, em/sup stripping, no-ToWrd skip, language-header skip), `parseEnDef` (RH + Collins entry shapes, multi-example join, section titles), `extractIPA` (us/uk dialect, fallback, null, respelling skip) |

### What's not covered (intentional)

- popup.js, options.js, content.js bubble rendering, the PDF viewer glue —
  too tangled with Chrome APIs and the DOM to unit-test. Covered by the
  browser tests below.
- background.js service worker — relies on Chrome's event lifecycle.
  Same.
- manifest, locales, CSP — Chrome validates these on load.

### Browser tests (headed)

```sh
npm run test:e2e   # ~4 min; opens Chromium windows (needs a desktop session)
```

`tests/e2e/` drives the real extension with Playwright: popup, in-page
bubble, settings page (delete/export/clear), favorites saved from
several pages at once, English mode, the Alt+X injection list, the
bubble on English and Turkish Wikipedia articles, and PDFs: the PDF.js
viewer (text lining up with the page, double-click, Alt + double-click,
Alt+X, right-click, print, save, zoom, page buttons, odd addresses,
`#page=`, a local `file://` PDF, a failed load) and the right-click
bubble and Alt+X box in Chrome's own viewer. Each run loads the
store payload (tracked files minus `export-ignore`, uncommitted edits
included; `git add` new files first) into a fresh profile and prints
where it saved screenshots.

- Run headed. WordReference answers headless Chrome with 403, so
  `HEADLESS=1` only exercises the steps that don't look anything up.
- Uses live WordReference and Wikipedia, so it needs network access and
  isn't part of `npm test` or CI.
- Needs Playwright's Chromium build. If it's missing, run
  `node node_modules/playwright-core/cli.js install chromium`.
  `CHROME_PATH` points the tests at another Chromium instead.
- Not covered: pressing Chrome's own command shortcuts and right-click
  menu (a test can't; the PDF checks call `lookupSelectionInTab` and
  `lookupTermFromMenu` in the service worker instead), and audio.
- The PDF checks give the test copy `<all_urls>` up front (what turning on
  the viewer in settings asks for), build their PDFs with headless
  Chromium, and serve them from a local server. Unpacked copies get
  "Allow access to file URLs" by default, which the `file://` check
  relies on; store installs need the user to turn it on.
- Alt + double-click on a word inside a link never reaches the page:
  Chrome doesn't deliver that double-click. The Wikipedia checks skip
  linked words; Alt+Q works on them.

---

## Debugging in Chrome

| What you want to inspect | How |
|---|---|
| Toolbar popup (`popup.html`) | Right-click the toolbar icon → **Inspect popup**. DevTools opens against the popup window. |
| Service worker (`scripts/background.js`) | `chrome://extensions` → find this extension's card → **Inspect views: service worker**. Note the worker goes inactive when idle; trigger an event it handles (Alt+X, a right-click lookup, or a search in the popup) to wake it before debugging. Just opening the popup doesn't: it opens natively via `default_popup`. |
| Options page (`info.html`) | Right-click the page → Inspect. Or open it via `chrome://extensions` → **Details** → **Extension options**. |
| Welcome page (`welcome.html`) | Open `chrome-extension://<extension-id>/welcome.html` in any tab → Inspect normally. The store build's ID is `iejcondpdpcmgfiejidjbhcgloepemmd`; an unpacked build gets its own ID, shown on its card in `chrome://extensions`. |
| In-page bubble (`scripts/content.js`) | Open DevTools on the host page (the website you're translating on). `content.js` runs in an isolated world but you can see its console output and inspect `#wr-selection-popup` in the host page DOM. |
| PDF viewer (`vendor/pdfjs/web/viewer.html`) | Right-click anywhere in the viewer → Inspect. It's a normal extension page, so you get full DevTools; `PDFViewerApplication` is the viewer's global. |
| Storage contents | Service worker DevTools → **Application** tab → **Storage → Extension Storage**. Both `sync` and `local` are inspectable and editable. |
| Permissions in effect | `chrome://extensions` → **Details** for this extension. Active and granted optional permissions are listed. |
| Keyboard shortcut conflicts | `chrome://extensions/shortcuts` — Chrome shows what's actually bound (suggested keys may be downgraded if conflicting). |
| Network requests | DevTools (popup or service worker) → **Network** tab. Filter for `wordreference.com`. |
| Errors that happened before you opened DevTools | Service worker DevTools console preserves logs across reloads as long as the worker stays alive. |

---

## Code conventions

These aren't enforced by a linter; they emerged from how the codebase
already looks. Match the existing style.

### General

- `'use strict'` at the top of every script.
- 2-space indent.
- Single quotes for strings.
- Arrow functions for callbacks; `function` declarations for top-level
  helpers (so they're hoisted and easy to grep for).
- Prefer `const`; use `let` only for variables that are reassigned.
- Both styles of `chrome.*` call exist: `background.js` mostly
  `await`s promises, while `popup.js`, `content.js` and `options.js`
  mostly pass callbacks. Prefer promises in new code, or the existing
  Promise helpers (`storageGet`/`storageSet` in `scripts/favorites.js`).

### File-level

- Wrap content scripts and option-page scripts in an IIFE
  `(() => { 'use strict'; ... })();` to keep the global scope clean.
  `scripts/background.js` doesn't use one. It's a classic (non-module)
  service worker, so its top-level declarations are worker globals, and
  `import` won't work unless the manifest adds `"type": "module"`. It
  loads `favorites.js` with `importScripts`.
- Comments use `// ── Section ────────────────` boxes to separate
  logical groups inside a file. Match the existing pattern.

### Errors

- Wrap any chrome API call that can fail on restricted pages
  (`chrome://`, `chrome-extension://`, PDF viewer) in `try/catch`
  with a `// expected on restricted pages` style comment. Don't
  surface the error to the user.
- Real errors (network failures, parse failures) get a brief user-
  facing message. The codebase doesn't log to the console anywhere.

### CSS

- Color palette lives in `:root` CSS variables at the top of
  `styles/main.css`, with separate `:root` copies in the `<style>`
  blocks of `info.html` and `welcome.html`. The
  in-page bubble CSS in `scripts/content.js` hard-codes the same hex
  values. A palette change has to touch all of them.
- Match the existing warm-parchment aesthetic — don't introduce
  bright primary colors.

### i18n

- Every new user-visible string gets a `_locales/en/messages.json`
  entry plus a `data-i18n*` attribute on the element (or a
  `chrome.i18n.getMessage('key')` call from JS).
- Add the same key to `_locales/tr/messages.json` (full-coverage
  locale) and the partial locales (`es`, `fr`, `de`, `it`, `pt`) if
  the string is among their 18 keys.

---

## Release process

This codebase ships in versioned releases roughly aligned with semver:

- **Patch** (2.3.0 → 2.3.1): bug fixes only, no new permissions or
  features.
- **Minor** (2.3.0 → 2.4.0): new features, no breaking permission
  changes.
- **Major** (2.x → 3.0.0): only if the manifest permissions change in
  a way that requires user re-acceptance, or if storage schema
  changes incompatibly.

Steps for any release:

1. Land all the work on `main`. Make sure `npm test` is green and
   `npm run test:e2e` passes.
2. Bump `manifest.json` `"version"`. The `info.html` footer reads from the
   manifest at runtime, so there is nothing to edit there.
3. Optional: bump `package.json` `"version"` to match.
4. Commit: `chore(release): bump version to X.Y.Z`.
5. Tag: `git tag -a vX.Y.Z -m "vX.Y.Z — short summary of what shipped"`.
6. Push: `git push origin main && git push origin vX.Y.Z`. CI fires.
7. Wait for CI to go green.
8. Build the production ZIP (next section).
9. Upload to Chrome Web Store dashboard. Update the listing's "What's
   new" field.
10. Submit for review (1–7 days).

---

## Building the production ZIP

Build from the release tag with `git archive`:

```sh
mkdir -p dist
git archive --format=zip -o dist/wrdict-chrome-store-vX.Y.Z.zip vX.Y.Z
```

- Only files committed at that tag go in. Untracked and gitignored
  files (`*.pem` keys, `.env`, agent folders, OS junk, old ZIPs) can't
  leak into the store package. Commit everything before tagging.
- `-o` writes a fresh archive, so files deleted since the last build
  don't linger.
- Committed dev-only files are marked `export-ignore` in
  `.gitattributes`: `*.md`, `tests/`, `.github/`, `package*.json`,
  `.gitignore`, `.gitattributes`, `.npmrc`. A new dev-only file needs a
  line there.
- Builds go to `dist/` (gitignored), never the repo root.

Verify before uploading:

```sh
unzip -Z1 dist/wrdict-chrome-store-vX.Y.Z.zip | grep -v '/$'  # full file list (53 files as of v2.5.1)
ls -lh dist/wrdict-chrome-store-vX.Y.Z.zip                     # ~1 MB

# confirm the payload is the build you think it is
unzip -p dist/wrdict-chrome-store-vX.Y.Z.zip manifest.json | grep '"version"'
```

The ZIP should NOT contain `.github/`, `tests/`, `package*.json`, or
any `.md` file (including this one, `README.md`, and
`THIRD_PARTY_NOTICES.md`). `LICENSE` is included. The Apache-2.0 text required by the vendored
SheetJS and PDF.js ships as `vendor/pdfjs/LICENSE`, and both bundles
keep their copyright headers. The PDF.js viewer's other parts keep their
license files next to them (`vendor/pdfjs/web/wasm/LICENSE_*`,
`web/cmaps/LICENSE`, `web/standard_fonts/LICENSE_FOXIT`,
`web/iccs/LICENSE`). Anything else is dead weight on user
download size.

---

## Useful chrome:// pages

| URL | What it does |
|---|---|
| `chrome://extensions` | Manage installed extensions; toggle Developer Mode; reload unpacked extension. |
| `chrome://extensions/shortcuts` | Customize each extension's keyboard shortcuts; see Chrome's actual binding (may differ from `suggested_key`). |
| `chrome://extensions/?id=<extension-id>` | Direct link to an extension's details page (store build: `iejcondpdpcmgfiejidjbhcgloepemmd`; an unpacked build has its own ID). The PDF support help text in `info.html` shows the store build's URL for the file-URL access toggle. |
| `chrome://settings/languages` | Change Chrome's UI language to test localized strings. Restart Chrome after changing. |
| `chrome://settings/onStartup` | Useful when testing the welcome page (set to "Open the New Tab page" so welcome.html opens cleanly on first install). |
| `chrome://policy` | Shows enterprise policies in effect. Useful when debugging "why isn't this extension installing" on managed Chrome. |
| `chrome://flags` | Toggle experimental features. Rarely needed for this extension. |
| `chrome://inspect/#service-workers` | List all service workers across all origins; alternative way to find this extension's background worker. |

---

## Common errors and fixes

### "Refused to execute inline script" (CSP)

Cause: A `<script>...code...</script>` block in an extension HTML
page. The MV3 default CSP forbids it.

Fix: Move the code to a separate `scripts/your-thing.js` and load it
with `<script src="scripts/your-thing.js">`. For ES modules, use
`<script type="module" src="...">`.

This bit us in `pdf-viewer.html` — fixed in commit `84a4f08`.

### "Permission denied" when calling chrome.permissions.request

Cause 1: The permission isn't declared in `optional_permissions` or
`optional_host_permissions` in the manifest.

Cause 2: The request was made outside a user gesture handler. Chrome
requires the request to come from a click/keyup/etc. handler.

Cause 3: Some permissions can't be requested as optional in Chrome
(`declarativeNetRequest` was rejecting silently before we switched to
`declarativeNetRequestWithHostAccess` in commit `b2d169d`).

Fix: Check the manifest, ensure the `change`/`click` handler isn't
async-detached from the user gesture, and pick the right permission
variant for runtime requests.

### Service worker stops responding mid-task

MV3 service workers are aggressively suspended after ~30s idle. If
you start a long fetch and then await something else, the worker may
suspend before the fetch resolves.

Fix: Use `chrome.alarms` for periodic work; don't rely on `setTimeout`.
For long-running operations, message back to a tab and let the tab
hold the work.

### "Cannot access 'chrome-extension://...' URL"

Cause: Trying to inject a content script or `executeScript` into
another extension's page (including Chrome's built-in PDF viewer,
chrome:// pages, and the New Tab page).

Fix: Don't. The `chrome.commands.onCommand` cascade in `scripts/background.js` is
designed around this — each step has a try/catch and the next falls
back. The PDF viewer feature replaces Chrome's viewer with Mozilla's
PDF.js viewer, inside the extension, exactly to sidestep this
restriction. Without it, `content.js` still runs in a PDF tab's top
document (https only), just not inside the PDF: the right-click menu
shows the bubble over the PDF, and Alt+X offers a box to paste a word
into.

### Storage write seems to disappear

Cause: Two writers to `chrome.storage.local.favorites` overlap and the
last write wins.

Favorites storage has a single owner: the background service worker.
It loads `scripts/favorites.js` with `importScripts`, and
`_serialized()` there queues every read and write, so changes apply one
at a time. The popup, options page, PDF viewer and content scripts load
their own copy of `favorites.js`, which forwards each call to the worker
as a `wr-favorites` message. Don't write `chrome.storage.local.favorites`
from anywhere else: a second writer brings the lost-write bug back (see
the "overlapping changes from several pages" test).

### `npm test` fails with `MODULE_NOT_FOUND` on `tests/`

Node 22+ rejects a bare directory argument to `--test`. The script
uses `tests/*.test.js` shell glob. Fixed in commit `848176e`.

Run tests on Linux, macOS or WSL, where npm runs scripts in `sh` and
the shell expands the glob. Native Windows npm uses `cmd.exe`, which
doesn't, so there `npm test` fails on Node 18/20 with "Could not find
'…/tests/*.test.js'".

### `npm install` fails with `EPERM ... symlink`

Some synced or network drives don't support symlinks, and npm links
package CLIs into `node_modules/.bin`. The repo's `.npmrc` sets `bin-links=false` to skip those links; no npm script needs
them. To run Playwright's CLI, call `node node_modules/playwright-core/cli.js`.

### "Cannot use require() of ES Module" when running tests

`jsdom@29+` pulls in ESM-only deps incompatible with Node 18. Pinned
to `jsdom@24` in `package.json` from when CI still ran Node 18 (CI now
runs Node 22 and 24). If you upgrade jsdom, run `npm test` on every
Node version CI uses.

### Toolbar icon looks blurry

Lanczos resampling loses fidelity at 16 px. Hand-tune
`images/icon-16.png` in an image editor (Photoshop / GIMP / Pixelmator)
after regenerating from the master.

---

## Branching and commit style

This repo uses a single `main` branch. Don't create long-lived feature
branches; commit small, focused work directly to main.

Commits follow **Conventional Commits**:

| Prefix | Meaning | Example |
|---|---|---|
| `feat(scope):` | new user-visible feature | `feat(commands): add Alt+Q quick-lookup` |
| `fix(scope):` | bug fix | `fix(favorites): bubble removes favorited words` |
| `perf(scope):` | performance improvement | `perf(popup): defer non-critical init` |
| `refactor(scope):` | restructure without behavior change | `refactor(popup): drop fontawesome and bootstrap` |
| `docs(scope):` | documentation only | `docs(readme): add tests CI status badge` |
| `test:` | tests only (no scope needed) | `test: add favorites and parser unit tests` |
| `ci:` | CI/workflow changes | `ci: run npm test on push and PR` |
| `chore(scope):` | maintenance, no production code change | `chore(release): bump version to 2.5.1` |
| `chore(deps):` | dependency changes | `chore(deps): remove dead jquery, tether, bootstrap-js` |
| `chore(gitignore):` | gitignore updates | `chore(gitignore): broaden agent-metadata ignores` |

Commit message body: explain *why* the change was made, not what — the
diff already shows what. If the change is non-obvious, note the
reasoning. If it fixes a bug, describe the symptom and the root cause.

---

## Dependencies and why each one is here

The shipped extension has **zero npm runtime dependencies**. Everything
is vendored or hand-written.

### Vendored (ships in the extension)

| Where | What | Why |
|---|---|---|
| `scripts/xlsx.full.min.js` | SheetJS Community Edition (0.20.3, from cdn.sheetjs.com — npm stops at 0.18.5) | Excel `.xlsx` export of favorites. Lazy-loaded only when the user clicks Export. Could swap to `xlsx.mini.min.js` to save ~600 KB. |
| `vendor/pdfjs/` | Mozilla PDF.js viewer (6.4.299, legacy build) | The opt-in PDF viewer: Mozilla's own viewer (`web/viewer.html`) with the extension's scripts added. Built by `tools/update-pdfjs.mjs`. Apache-2.0; attribution in `THIRD_PARTY_NOTICES.md` and `vendor/pdfjs/LICENSE`. |

### Updating PDF.js

```sh
npm run update-pdfjs -- 6.4.299   # a version from github.com/mozilla/pdf.js/releases
npm run test:e2e
```

`tools/update-pdfjs.mjs` downloads the release's legacy build
(`pdfjs-<version>-legacy-dist.zip`) and rebuilds `vendor/pdfjs/` from it:

- Keeps only the viewer languages the extension ships; others fall back
  to the viewer's built-in English.
- Leaves out the WebAssembly files. The extension's CSP blocks
  WebAssembly, so `pdf-bridge.js` turns `useWasm` off and PDF.js uses its
  JavaScript image decoders.
- Leaves out the Liberation fonts (GPL-2.0 with a font exception). With
  system fonts on, the browser default, PDF.js never loads them.
- Patches `web/viewer.html` three times: `style-src` gains
  `'unsafe-inline'` for the bubble's `<style>` element, `connect-src`
  gains `file:` so local PDFs can be read, and the extension's scripts
  load before `</body>`. The script stops if a patch no longer matches.

The legacy build supports Chrome 125+ (PDF.js FAQ), which is
`minimum_chrome_version` in `manifest.json`. Check the FAQ again when
updating.

### Dev-only (not in the shipped ZIP)

| Package | Version | Used by | Why |
|---|---|---|---|
| `jsdom` | `^24.1.3` | `tests/parser.test.js` | Provides a `Document` for testing the WR HTML parsers. Pinned to v24 because v29+ pulls ESM-only deps that don't work on Node 18. |
| `playwright-core` | `1.63.0` | `tests/e2e/` | Drives Chromium for the browser tests. Pinned exactly: each version expects its own Chromium build. Needs Node 20+. |

Unit tests use Node's built-in `node:test`, `node:assert`, `node:vm`,
and `node:fs` — no additional runner needed.

---

## Last-resort references

When this doc doesn't have the answer:

- **Chrome Extension docs**: <https://developer.chrome.com/docs/extensions/>
  (especially the [MV3 reference](https://developer.chrome.com/docs/extensions/reference/api))
- **Chrome Web Store policies**: <https://developer.chrome.com/docs/webstore/program-policies/>
- **PDF.js examples**: <https://mozilla.github.io/pdf.js/examples/>
- **node:test docs**: <https://nodejs.org/api/test.html>
- **WordReference URL structure**: pages are `https://www.wordreference.com/<dir>/<word>` where `<dir>` is `enXX` for English-to-X (e.g. `entr` for Turkish) or `definition` for English monolingual.
