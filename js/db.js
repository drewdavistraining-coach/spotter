import { SESSION_TYPES } from './seed.js';

// Tiny IndexedDB wrapper. Everything Spotter knows lives in these stores,
// on the device only. Audio memos are stored as Blobs in "memos".
const DB_NAME = 'spotter';
const DB_VERSION = 1;
export const STORES = ['clients', 'sessions', 'memos', 'plans', 'recaps', 'drills', 'meta'];
const BY_CLIENT = ['sessions', 'memos', 'plans', 'recaps'];

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: 'id' });
        if (BY_CLIENT.includes(name)) store.createIndex('clientId', 'clientId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export const db = {
  async all(name) { return wrap((await store(name)).getAll()); },
  async get(name, id) { return wrap((await store(name)).get(id)); },
  async put(name, value) { await wrap((await store(name, 'readwrite')).put(value)); return value; },
  async del(name, id) { return wrap((await store(name, 'readwrite')).delete(id)); },
  async clear(name) { return wrap((await store(name, 'readwrite')).clear()); },
  async byClient(name, clientId) {
    return wrap((await store(name)).index('clientId').getAll(clientId));
  },
  async getMeta(key, fallback = null) {
    const row = await this.get('meta', key);
    return row ? row.value : fallback;
  },
  async setMeta(key, value) { return this.put('meta', { id: key, value }); },
};

// Drew's session types (Log session dropdown), editable from the form and Settings.
export function sessionTypes() {
  return db.getMeta('sessionTypes', SESSION_TYPES);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
