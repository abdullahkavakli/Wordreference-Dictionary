/**
 * Unit tests for scripts/favorites.js — the canonical chrome.storage.local
 * favorites API exposed as WRFavorites.
 *
 * Strategy: load the production source verbatim into a Node vm sandbox with
 * `chrome` mocked. Without a `window`, the file runs as it does in the
 * background service worker (the only storage owner); with one, it runs as
 * a page/content-script copy that forwards calls to the worker. The same
 * code that ships in the extension is what the tests exercise.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FAVORITES_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'favorites.js'),
  'utf8'
);

function makeChromeMock() {
  const store = { _data: {} };
  return {
    runtime: { lastError: null },
    storage: {
      local: {
        get(query, cb) {
          let result;
          if (typeof query === 'string') {
            result = { [query]: store._data[query] };
          } else if (query && typeof query === 'object') {
            result = {};
            for (const [key, dflt] of Object.entries(query)) {
              result[key] = key in store._data ? store._data[key] : dflt;
            }
          } else {
            result = { ...store._data };
          }
          queueMicrotask(() => cb(result));
        },
        set(items, cb) {
          Object.assign(store._data, items);
          if (cb) queueMicrotask(cb);
        },
        _data: store._data
      }
    }
  };
}

const SANDBOX_GLOBALS = {
  Promise,
  Set,
  Array,
  Object,
  Number,
  String,
  Date,
  Error,
  queueMicrotask,
  setTimeout
};

function loadFavorites(initialStore) {
  const chromeMock = makeChromeMock();
  if (initialStore !== undefined) {
    chromeMock.storage.local._data.favorites = initialStore;
  }
  const ctx = vm.createContext({ ...SANDBOX_GLOBALS, chrome: chromeMock });
  vm.runInContext(FAVORITES_SRC, ctx);
  return { api: ctx.WRFavorites, mock: chromeMock };
}

// A copy of favorites.js as a page or content script loads it: it has a
// `window`, and chrome.runtime.sendMessage reaches `worker` the way the
// 'wr-favorites' handler in background.js does.
function loadForwardingCopy(worker) {
  const runtime = {
    lastError: null,
    sendMessage(msg, cb) {
      worker[msg.op](...msg.args)
        .then(result => cb({ result }), err => cb({ error: err.message }));
    }
  };
  const ctx = vm.createContext({ ...SANDBOX_GLOBALS, window: {}, chrome: { runtime } });
  vm.runInContext(FAVORITES_SRC, ctx);
  return ctx.WRFavorites;
}

// ── makeFavoriteId ─────────────────────────────────────────────────────────

test('makeFavoriteId lowercases and joins dir + word', () => {
  const { api } = loadFavorites();
  assert.equal(api.makeFavoriteId('Hello', 'EnTr'), 'entr::hello');
  assert.equal(api.makeFavoriteId('  spaced  ', '  enFr  '), 'enfr::spaced');
});

test('makeFavoriteId tolerates missing input', () => {
  const { api } = loadFavorites();
  assert.equal(api.makeFavoriteId('', ''), '::');
  assert.equal(api.makeFavoriteId(undefined, null), '::');
});

// ── addFavorite ────────────────────────────────────────────────────────────

test('addFavorite stores a normalized item and returns added:true', async () => {
  const { api, mock } = loadFavorites();
  const result = await api.addFavorite({ word: 'Hello', dir: 'enfr' });

  assert.equal(result.added, true);
  assert.equal(result.item.word, 'Hello');
  assert.equal(result.item.id, 'enfr::hello');
  assert.equal(typeof result.item.createdAt, 'number');

  const stored = mock.storage.local._data.favorites;
  assert.equal(stored.items.length, 1);
  assert.equal(stored.items[0].id, 'enfr::hello');
  assert.equal(stored.schemaVersion, 1);
});

test('addFavorite refuses items missing word or dir', async () => {
  const { api } = loadFavorites();
  await assert.rejects(api.addFavorite({}), /Invalid favorite data/);
  await assert.rejects(api.addFavorite({ word: 'foo' }), /Invalid favorite data/);
  await assert.rejects(api.addFavorite({ dir: 'enfr' }), /Invalid favorite data/);
  await assert.rejects(api.addFavorite(null), /Invalid favorite data/);
});

test('addFavorite returns added:false on duplicate (case-insensitive)', async () => {
  const { api } = loadFavorites();
  await api.addFavorite({ word: 'Hello', dir: 'enfr' });
  const dup = await api.addFavorite({ word: 'HELLO', dir: 'EnFr' });
  assert.equal(dup.added, false);
  assert.equal(dup.item.word, 'Hello'); // original casing preserved
});

test('addFavorite folds explanation/definition/meaning/gloss aliases', async () => {
  const { api } = loadFavorites();
  const a = await api.addFavorite({ word: 'a', dir: 'enfr', definition: 'def-A' });
  const b = await api.addFavorite({ word: 'b', dir: 'enfr', meaning: 'mean-B' });
  const c = await api.addFavorite({ word: 'c', dir: 'enfr', gloss: 'gloss-C' });
  const d = await api.addFavorite({ word: 'd', dir: 'enfr', explanation: 'exp-D' });
  assert.equal(a.item.explanation, 'def-A');
  assert.equal(b.item.explanation, 'mean-B');
  assert.equal(c.item.explanation, 'gloss-C');
  assert.equal(d.item.explanation, 'exp-D');
});

// ── removeFavorite ─────────────────────────────────────────────────────────

test('removeFavorite returns true and deletes the item', async () => {
  const { api, mock } = loadFavorites();
  await api.addFavorite({ word: 'one', dir: 'enfr' });
  await api.addFavorite({ word: 'two', dir: 'enfr' });

  const removed = await api.removeFavorite('enfr::one');
  assert.equal(removed, true);

  const remaining = mock.storage.local._data.favorites.items.map(i => i.id);
  assert.deepEqual(remaining, ['enfr::two']);
});

test('removeFavorite returns false when id is unknown', async () => {
  const { api } = loadFavorites();
  await api.addFavorite({ word: 'one', dir: 'enfr' });
  const removed = await api.removeFavorite('enfr::ghost');
  assert.equal(removed, false);
});

// ── clearFavorites ─────────────────────────────────────────────────────────

test('clearFavorites empties the list and returns true', async () => {
  const { api, mock } = loadFavorites();
  await api.addFavorite({ word: 'a', dir: 'enfr' });
  await api.addFavorite({ word: 'b', dir: 'enfr' });

  const cleared = await api.clearFavorites();
  assert.equal(cleared, true);
  assert.equal(mock.storage.local._data.favorites.items.length, 0);
});

test('clearFavorites returns false when already empty', async () => {
  const { api } = loadFavorites();
  const cleared = await api.clearFavorites();
  assert.equal(cleared, false);
});

// ── listFavorites / isFavorite / isFavoriteId ──────────────────────────────

test('listFavorites returns items sorted by createdAt desc', async () => {
  const { api } = loadFavorites();
  await api.addFavorite({ word: 'oldest', dir: 'enfr', createdAt: 100 });
  await api.addFavorite({ word: 'newest', dir: 'enfr', createdAt: 300 });
  await api.addFavorite({ word: 'middle', dir: 'enfr', createdAt: 200 });

  const list = await api.listFavorites();
  assert.deepEqual(list.map(i => i.word), ['newest', 'middle', 'oldest']);
});

test('isFavorite and isFavoriteId report presence', async () => {
  const { api } = loadFavorites();
  await api.addFavorite({ word: 'Hello', dir: 'enfr' });
  assert.equal(await api.isFavorite('hello', 'enfr'), true);
  assert.equal(await api.isFavorite('HELLO', 'EnFr'), true);
  assert.equal(await api.isFavorite('absent', 'enfr'), false);
  assert.equal(await api.isFavoriteId('enfr::hello'), true);
  assert.equal(await api.isFavoriteId('enfr::absent'), false);
});

// ── normalizeStore migrations ──────────────────────────────────────────────

test('readStore migrates a bare array (legacy schema) to the v1 envelope', async () => {
  const legacy = [
    { word: 'legacy', dir: 'enfr', createdAt: 1 }
  ];
  const { api, mock } = loadFavorites(legacy);
  const list = await api.listFavorites();
  assert.equal(list.length, 1);
  assert.equal(list[0].word, 'legacy');

  // Migration writes the canonical envelope back.
  const stored = mock.storage.local._data.favorites;
  assert.equal(stored.schemaVersion, 1);
  assert.ok(Array.isArray(stored.items));
});

test('readStore drops invalid items and dedupes by id during normalization', async () => {
  const corrupt = {
    schemaVersion: 1,
    items: [
      { word: 'good', dir: 'enfr', createdAt: 200 },
      { word: 'good', dir: 'EnFr', createdAt: 100 }, // duplicate id
      { word: '', dir: 'enfr' },                      // invalid (no word)
      null,                                           // invalid
      { word: 'also-good', dir: 'enfr', createdAt: 50 }
    ]
  };
  const { api } = loadFavorites(corrupt);
  const list = await api.listFavorites();
  assert.deepEqual(list.map(i => i.word), ['good', 'also-good']);
});

// ── MAX_FAVORITES cap ──────────────────────────────────────────────────────

test('addFavorite respects MAX_FAVORITES (5000) and trims oldest', async () => {
  const { api } = loadFavorites();
  // Pre-seed near the cap to keep the test fast.
  const seed = {
    schemaVersion: 1,
    items: Array.from({ length: 4999 }, (_, i) => ({
      word: `w${i}`,
      dir: 'enfr',
      createdAt: i + 1
    }))
  };
  const { api: api2, mock } = loadFavorites(seed);

  // 5000th add — should still fit.
  await api2.addFavorite({ word: 'fill', dir: 'enfr', createdAt: 999999 });
  assert.equal(mock.storage.local._data.favorites.items.length, 5000);

  // 5001st add — should evict the oldest.
  await api2.addFavorite({ word: 'overflow', dir: 'enfr', createdAt: 1000000 });
  const items = mock.storage.local._data.favorites.items;
  assert.equal(items.length, 5000);
  assert.equal(items[0].word, 'overflow');
  // Lowest createdAt should have been evicted.
  assert.ok(items.every(i => i.createdAt > 1));
});

// ── Serialization queue (regression for commit 71b35ef) ────────────────────

test('concurrent addFavorite calls do not lose data', async () => {
  const { api, mock } = loadFavorites();

  // Fire 50 concurrent adds; if writes weren't serialized, last-write-wins
  // would drop most of them.
  const adds = Array.from({ length: 50 }, (_, i) =>
    api.addFavorite({ word: `w${i}`, dir: 'enfr', createdAt: i + 1 })
  );
  await Promise.all(adds);

  assert.equal(mock.storage.local._data.favorites.items.length, 50);
});

test('concurrent removeFavorite + addFavorite stay consistent', async () => {
  const { api, mock } = loadFavorites();
  await api.addFavorite({ word: 'keep', dir: 'enfr', createdAt: 1 });
  await api.addFavorite({ word: 'drop', dir: 'enfr', createdAt: 2 });

  await Promise.all([
    api.removeFavorite('enfr::drop'),
    api.addFavorite({ word: 'late', dir: 'enfr', createdAt: 3 })
  ]);

  const ids = mock.storage.local._data.favorites.items.map(i => i.id).sort();
  assert.deepEqual(ids, ['enfr::keep', 'enfr::late']);
});

// ── Page/content-script copies forward to the service worker ───────────────

test('a page copy forwards calls to the service worker', async () => {
  const { api: worker, mock } = loadFavorites();
  const page = loadForwardingCopy(worker);

  const result = await page.addFavorite({ word: 'Hello', dir: 'enfr' });
  assert.equal(result.added, true);
  assert.equal(await page.isFavoriteId('enfr::hello'), true);
  assert.equal(await page.removeFavorite('enfr::missing'), false);
  assert.equal(mock.storage.local._data.favorites.items.length, 1);
  // Pure helper: computed locally, no message needed.
  assert.equal(page.makeFavoriteId('Hi', 'EnFr'), 'enfr::hi');
});

test('a page copy rejects with the service worker\'s error', async () => {
  const { api: worker } = loadFavorites();
  const page = loadForwardingCopy(worker);
  await assert.rejects(page.addFavorite({}), /Invalid favorite data/);
});

test('a page copy rejects when the service worker is unreachable', async () => {
  const runtime = {
    lastError: null,
    sendMessage(_msg, cb) {
      runtime.lastError = { message: 'Could not establish connection.' };
      cb(undefined);
      runtime.lastError = null;
    }
  };
  const ctx = vm.createContext({ ...SANDBOX_GLOBALS, window: {}, chrome: { runtime } });
  vm.runInContext(FAVORITES_SRC, ctx);
  await assert.rejects(ctx.WRFavorites.listFavorites(), /Could not establish connection/);
});

test('overlapping changes from several pages are not lost', async () => {
  // Regression: the popup, options page and each tab used to write storage
  // independently, so overlapping writes could drop each other's changes.
  const { api: worker, mock } = loadFavorites();
  const tab = loadForwardingCopy(worker);
  const popup = loadForwardingCopy(worker);
  const options = loadForwardingCopy(worker);
  await worker.addFavorite({ word: 'old', dir: 'enfr', createdAt: 1 });

  await Promise.all([
    ...Array.from({ length: 25 }, (_, i) =>
      tab.addFavorite({ word: `t${i}`, dir: 'enfr', createdAt: i + 2 })),
    ...Array.from({ length: 25 }, (_, i) =>
      popup.addFavorite({ word: `p${i}`, dir: 'enfr', createdAt: i + 100 })),
    options.removeFavorite('enfr::old')
  ]);

  const ids = mock.storage.local._data.favorites.items.map(i => i.id);
  assert.equal(ids.length, 50);
  assert.ok(!ids.includes('enfr::old'));
});
