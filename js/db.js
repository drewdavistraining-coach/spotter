import { SESSION_TYPES } from './seed.js';

// Tiny IndexedDB wrapper. Everything Spotter knows lives in these stores on the device, so it works
// offline. Audio memos are stored as Blobs in "memos".
//
// Sync (js/sync.js): every local put/del stamps the record with `_modified` and adds an entry to the
// "outbox" store in the same transaction. The sync loop uploads the outbox and pulls other devices' changes,
// writing them back with { fromSync: true } so they aren't re-uploaded.
const DB_NAME = 'spotter';
const DB_VERSION = 2; // v2 added the outbox store
export const STORES = ['clients', 'sessions', 'memos', 'plans', 'recaps', 'drills', 'meta'];
const BY_CLIENT = ['sessions', 'memos', 'plans', 'recaps'];

// Meta rows that follow Drew across devices. Everything else in meta (sign-in, sync cursor, backup date,
// seeded flag) belongs to this device only.
export const SYNCED_META = ['sessionTypes', 'trainerName', 'recapClosing'];

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [...STORES, 'outbox']) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: 'id' });
        if (BY_CLIENT.includes(name)) store.createIndex('clientId', 'clientId');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // A newer version of Spotter opened in another tab needs to upgrade the database: step aside for it.
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    // An older copy of Spotter in another tab/window is holding the database open. The upgrade carries on
    // by itself as soon as that copy is closed.
    req.onblocked = () => {
      const view = document.getElementById('view');
      if (view) view.innerHTML = '<div class="empty"><div class="empty-icon">⏳</div><h3>Finishing an update</h3><p>Spotter is open in another tab or window. Close it and this page will carry on.</p></div>';
    };
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

const syncs = (name, id) => name !== 'meta' || SYNCED_META.includes(id);

// Lets the sync loop know there's something to upload.
function nudge() {
  window.dispatchEvent(new Event('spotter:local-change'));
}

export const db = {
  async all(name) { return wrap((await store(name)).getAll()); },
  async get(name, id) { return wrap((await store(name)).get(id)); },

  async put(name, value, { fromSync = false } = {}) {
    const track = !fromSync && syncs(name, value.id);
    if (track) value._modified = Date.now();
    const tx = (await open()).transaction(track ? [name, 'outbox'] : [name], 'readwrite');
    tx.objectStore(name).put(value);
    if (track) tx.objectStore('outbox').put({ id: `${name}:${value.id}`, store: name, recordId: value.id, deleted: false, modified: value._modified });
    await done(tx);
    if (track) nudge();
    return value;
  },

  async del(name, id, { fromSync = false } = {}) {
    const track = !fromSync && syncs(name, id);
    const tx = (await open()).transaction(track ? [name, 'outbox'] : [name], 'readwrite');
    tx.objectStore(name).delete(id);
    if (track) tx.objectStore('outbox').put({ id: `${name}:${id}`, store: name, recordId: id, deleted: true, modified: Date.now() });
    await done(tx);
    if (track) nudge();
  },

  // Local only: clearing a store is never synced as deletes (used by restore and "erase this device").
  async clear(name) { return wrap((await store(name, 'readwrite')).clear()); },

  async byClient(name, clientId) {
    return wrap((await store(name)).index('clientId').getAll(clientId));
  },
  async getMeta(key, fallback = null) {
    const row = await this.get('meta', key);
    return row ? row.value : fallback;
  },
  async setMeta(key, value) { return this.put('meta', { id: key, value }); },

  // Outbox access for js/sync.js.
  outbox: {
    async all() { return wrap((await store('outbox')).getAll()); },
    async add(entry) { return wrap((await store('outbox', 'readwrite')).put(entry)); },
    async remove(entry) {
      // Only remove if the record hasn't been edited again since this entry was read.
      const s = await store('outbox', 'readwrite');
      const current = await wrap(s.get(entry.id));
      if (current && current.modified === entry.modified) await wrap(s.delete(entry.id));
    },
    async clear() { return wrap((await store('outbox', 'readwrite')).clear()); },
  },
};

// Drew's session types (Log session dropdown), editable from the form and Settings.
export function sessionTypes() {
  return db.getMeta('sessionTypes', SESSION_TYPES);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
