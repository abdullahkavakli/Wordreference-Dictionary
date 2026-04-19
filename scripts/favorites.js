/**
 * WordReference Dictionary Extension
 * Favorites storage helpers (local only).
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'favorites';
  const SCHEMA_VERSION = 1;
  const MAX_FAVORITES = 5000;

  function normalizeWord(word) {
    return String(word || '').trim().toLowerCase();
  }

  function normalizeDir(dir) {
    return String(dir || '').trim().toLowerCase();
  }

  function makeFavoriteId(word, dir) {
    return `${normalizeDir(dir)}::${normalizeWord(word)}`;
  }

  function storageGet(query) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(query, result => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result || {});
      });
    });
  }

  function storageSet(values) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function normalizeItem(item) {
    if (!item || typeof item !== 'object') return null;

    const word = String(item.word || '').trim();
    const dir = String(item.dir || '').trim();
    if (!word || !dir) return null;

    const explanation = String(
      item.explanation ||
      item.definition ||
      item.meaning ||
      item.gloss ||
      ''
    ).trim();

    return {
      id: item.id || makeFavoriteId(word, dir),
      word,
      ipa: String(item.ipa || '').trim(),
      explanation,
      dir,
      langPair: String(item.langPair || '').trim(),
      source: String(item.source || '').trim(),
      url: String(item.url || '').trim(),
      createdAt: Number(item.createdAt) || Date.now()
    };
  }

  function normalizeStore(rawStore) {
    let needsWrite = false;
    let store = rawStore;

    if (Array.isArray(store)) {
      store = { schemaVersion: SCHEMA_VERSION, items: store };
      needsWrite = true;
    }

    if (!store || typeof store !== 'object') {
      store = { schemaVersion: SCHEMA_VERSION, items: [] };
      needsWrite = true;
    }

    if (!Array.isArray(store.items)) {
      store.items = [];
      needsWrite = true;
    }

    if (store.schemaVersion !== SCHEMA_VERSION) {
      store.schemaVersion = SCHEMA_VERSION;
      needsWrite = true;
    }

    const deduped = [];
    const seen = new Set();
    for (const rawItem of store.items) {
      const item = normalizeItem(rawItem);
      if (!item) {
        needsWrite = true;
        continue;
      }
      if (seen.has(item.id)) {
        needsWrite = true;
        continue;
      }
      seen.add(item.id);
      deduped.push(item);
    }

    deduped.sort((a, b) => b.createdAt - a.createdAt);

    if (deduped.length > MAX_FAVORITES) {
      deduped.length = MAX_FAVORITES;
      needsWrite = true;
    }

    if (deduped.length !== store.items.length) {
      needsWrite = true;
    }

    store.items = deduped;
    return { store, needsWrite };
  }

  async function writeStore(store) {
    await storageSet({ [STORAGE_KEY]: store });
  }

  async function readStore() {
    const defaults = { [STORAGE_KEY]: { schemaVersion: SCHEMA_VERSION, items: [] } };
    const result = await storageGet(defaults);
    const { store, needsWrite } = normalizeStore(result[STORAGE_KEY]);
    if (needsWrite) await writeStore(store);
    return store;
  }

  async function listFavorites() {
    const store = await readStore();
    return store.items.slice();
  }

  async function isFavorite(word, dir) {
    const id = makeFavoriteId(word, dir);
    const store = await readStore();
    return store.items.some(item => item.id === id);
  }

  async function isFavoriteId(id) {
    const store = await readStore();
    return store.items.some(item => item.id === id);
  }

  async function addFavorite(candidate) {
    const item = normalizeItem(candidate);
    if (!item) throw new Error('Invalid favorite data');

    const store = await readStore();
    const existing = store.items.find(entry => entry.id === item.id);
    if (existing) {
      return { added: false, item: existing };
    }

    store.items.unshift(item);
    if (store.items.length > MAX_FAVORITES) {
      store.items.length = MAX_FAVORITES;
    }
    await writeStore(store);
    return { added: true, item };
  }

  async function removeFavorite(id) {
    const store = await readStore();
    const nextItems = store.items.filter(item => item.id !== id);
    if (nextItems.length === store.items.length) return false;
    store.items = nextItems;
    await writeStore(store);
    return true;
  }

  async function clearFavorites() {
    const store = await readStore();
    if (store.items.length === 0) return false;
    store.items = [];
    await writeStore(store);
    return true;
  }

  window.WRFavorites = {
    STORAGE_KEY,
    SCHEMA_VERSION,
    MAX_FAVORITES,
    makeFavoriteId,
    listFavorites,
    isFavorite,
    isFavoriteId,
    addFavorite,
    removeFavorite,
    clearFavorites
  };
})();
