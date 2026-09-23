// Sync with Supabase so the phone and laptop share the same data.
//
// Local-first: the app always reads and writes IndexedDB, so it works with no signal. This loop
//   1. pushes the outbox (every local edit since the last upload) to the `records` table,
//   2. pulls every row changed on the server since the last pull, and applies it if it's newer.
// Newest edit wins, per record (see supabase/schema.sql). Voice memo audio goes to the `memos` storage bucket.
//
// It runs when the app opens, ~1.5s after any local edit, whenever the app comes back to the foreground or
// reconnects, and every POLL_MS while it's on screen.
//
// Talks to Supabase's REST endpoints directly with fetch, so there's no library to load (and nothing
// that breaks offline).
import { db, STORES, SYNCED_META } from './db.js';
import { seedDrills } from './seed.js';

// Public by design: security comes from row-level security in supabase/schema.sql, not from hiding these.
const SUPABASE_URL = 'https://bzrsalvbtbpyvdvsmckh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9HGk_3cjfuzIH-PjQwDz8g_cWMPvbzD';

// Where confirmation emails send people after confirming (always the live app, even when signing up locally).
const APP_URL = 'https://drewdavistraining-coach.github.io/spotter/';

const POLL_MS = 10000;
const REWIND_MS = 10000; // re-read a little before the last cursor; applying a row twice is harmless
const PAGE = 500;
const LOCAL_ONLY_META = ['auth', 'syncCursor', 'syncInitialized'];

const state = { status: 'off', email: null, lastSynced: null, pending: 0, error: null };

export function syncState() {
  return { ...state };
}

function setState(patch) {
  Object.assign(state, patch);
  window.dispatchEvent(new CustomEvent('spotter:sync-status', { detail: syncState() }));
}

// ---------------------------------------------------------------- auth

async function authPost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error_description || json.msg || json.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function saveSession(json) {
  const session = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
    user: { id: json.user.id, email: json.user.email },
  };
  await db.setMeta('auth', session);
  return session;
}

export async function signIn(email, password) {
  const session = await saveSession(await authPost('token?grant_type=password', { email, password }));
  setState({ email: session.user.email, error: null });
  syncNow();
}

// Returns true when the account still needs its email confirmed before signing in.
export async function signUp(email, password) {
  const json = await authPost(`signup?redirect_to=${encodeURIComponent(APP_URL)}`, { email, password });
  if (json.access_token) {
    await saveSession(json);
    setState({ email, error: null });
    syncNow();
    return false;
  }
  return true;
}

export async function resendConfirmation(email) {
  await authPost(`resend?redirect_to=${encodeURIComponent(APP_URL)}`, { type: 'signup', email });
}

export async function signOut() {
  const session = await db.getMeta('auth');
  if (session) {
    fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` } }).catch(() => {});
  }
  for (const key of LOCAL_ONLY_META) await db.del('meta', key, { fromSync: true });
  await db.outbox.clear(); // signing in again re-uploads anything missing from the server
  setState({ status: 'off', email: null, lastSynced: null, pending: 0, error: null });
}

async function getSession() {
  const session = await db.getMeta('auth');
  if (!session) return null;
  if (session.expires_at - 60000 > Date.now()) return session;
  try {
    return await saveSession(await authPost('token?grant_type=refresh_token', { refresh_token: session.refresh_token }));
  } catch (err) {
    if (err.status >= 400 && err.status < 500) { // refresh token revoked or expired: must sign in again
      await signOut();
      setState({ error: 'Signed out — please sign in again.' });
      return null;
    }
    throw err; // offline: try again later
  }
}

async function api(path, { method = 'GET', headers = {}, body } = {}, session) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    body,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}`, ...headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path.split('?')[0]} failed (${res.status}) ${text.slice(0, 200)}`);
  }
  return res;
}

// ---------------------------------------------------------------- audio

const audioPath = (userId, memo) => `${userId}/${memo.id}.${(memo.mimeType || '').includes('webm') ? 'webm' : 'm4a'}`;

async function uploadAudio(session, memo) {
  const path = audioPath(session.user.id, memo);
  await api(`/storage/v1/object/memos/${path}`, {
    method: 'POST',
    headers: { 'x-upsert': 'true', 'Content-Type': memo.audio.type || 'audio/mp4' },
    body: memo.audio,
  }, session);
  return path;
}

async function downloadAudio(session, memoId) {
  const memo = await db.get('memos', memoId);
  if (!memo?.audioPath || memo.audio) return;
  const res = await api(`/storage/v1/object/authenticated/memos/${memo.audioPath}`, {}, session);
  const blob = await res.blob();
  const latest = await db.get('memos', memoId); // may have changed while downloading
  if (latest && !latest.audio) await db.put('memos', { ...latest, audio: blob }, { fromSync: true });
}

export async function deleteAudio(memo) {
  const session = await getSession().catch(() => null);
  if (!session || !memo.audioPath) return;
  api(`/storage/v1/object/memos/${memo.audioPath}`, { method: 'DELETE' }, session).catch(() => {});
}

// ---------------------------------------------------------------- push & pull

async function push(session) {
  const entries = await db.outbox.all();
  const rows = [];
  const sent = [];
  for (const entry of entries) {
    if (entry.deleted) {
      rows.push({ user_id: session.user.id, store: entry.store, id: entry.recordId, data: null, deleted: true, modified: entry.modified });
      sent.push(entry);
      continue;
    }
    const record = await db.get(entry.store, entry.recordId);
    if (!record) { await db.outbox.remove(entry); continue; }
    let data = record;
    if (entry.store === 'memos') {
      if (record.audio && !record.audioPath) {
        try {
          record.audioPath = await uploadAudio(session, record);
          await db.put('memos', record, { fromSync: true });
        } catch (err) {
          console.warn('Memo audio upload failed, will retry', err);
          continue; // keep it in the outbox
        }
      }
      const { audio, ...withoutAudio } = record;
      data = withoutAudio;
    }
    rows.push({ user_id: session.user.id, store: entry.store, id: entry.recordId, data, deleted: false, modified: record._modified || entry.modified });
    sent.push(entry);
  }

  for (let i = 0; i < rows.length; i += PAGE) {
    await api('/rest/v1/records?on_conflict=user_id,store,id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + PAGE)),
    }, session);
  }
  for (const entry of sent) await db.outbox.remove(entry);
}

// Applies server changes. Returns { changed, remote } where remote maps "store:id" -> modified for every row seen.
async function pull(session, { everything = false } = {}) {
  const cursor = everything ? null : await db.getMeta('syncCursor');
  const since = cursor ? new Date(new Date(cursor).getTime() - REWIND_MS).toISOString() : null;
  const pending = new Map((await db.outbox.all()).map(e => [e.id, e]));
  const remote = new Map();
  const needAudio = [];
  let changed = 0;
  let newest = cursor;
  let firstFailure = null; // a row we couldn't apply: stop the cursor here so it's retried

  for (let offset = 0; ; offset += PAGE) {
    const filter = since ? `&updated_at=gte.${encodeURIComponent(since)}` : '';
    const res = await api(`/rest/v1/records?select=store,id,data,deleted,modified,updated_at&order=updated_at.asc&limit=${PAGE}&offset=${offset}${filter}`, {}, session);
    const rows = await res.json();

    for (const row of rows) {
      if (!firstFailure) newest = row.updated_at;
      try {
        if (!STORES.includes(row.store) || (row.store === 'meta' && !SYNCED_META.includes(row.id))) continue;
        const key = `${row.store}:${row.id}`;
        remote.set(key, row.modified);
        const mine = pending.get(key);
        if (mine && mine.modified > row.modified) continue; // my newer edit is about to upload
        if (mine) await db.outbox.remove(mine); // theirs is newer: drop my stale edit

        const local = await db.get(row.store, row.id);
        if (row.deleted) {
          if (local) { await db.del(row.store, row.id, { fromSync: true }); changed++; }
          continue;
        }
        if (local && (local._modified || 0) >= row.modified) continue; // already have it (often my own upload)
        const record = { ...row.data, _modified: row.modified };
        if (row.store === 'memos') {
          record.audio = local?.audio || null;
          if (!record.audio && record.audioPath) needAudio.push(record.id);
        }
        await db.put(row.store, record, { fromSync: true });
        changed++;
      } catch (err) {
        // e.g. a record written by a newer version of Spotter than this device is running.
        // Leave the cursor here so it's tried again rather than skipped for good.
        console.warn('Could not apply a synced change; will retry', row.store, row.id, err);
        firstFailure = firstFailure || row.updated_at;
      }
    }
    if (rows.length < PAGE) break;
  }

  if (firstFailure || newest) await db.setMeta('syncCursor', firstFailure || newest);
  // Audio downloads don't block the sync; memos show their notes straight away.
  Promise.all(needAudio.map(id => downloadAudio(session, id).catch(err => console.warn('Audio download failed', err))))
    .then(() => needAudio.length && window.dispatchEvent(new Event('spotter:remote-change')));
  return { changed, remote };
}

const drillSignature = d => JSON.stringify([d.name, d.category, d.level, d.intensity, d.dose, [...(d.skills || [])].sort(), d.notes || '']);
const STARTER_SIGNATURES = new Set(seedDrills(() => '').map(drillSignature));
const isUntouchedStarter = d => !d._modified && STARTER_SIGNATURES.has(drillSignature(d));

// First sync on this device (or after a restore): merge instead of overwrite.
async function firstSync(session) {
  // Settings share one fixed id per account, so another device's copy would overwrite this one's.
  // Keep this device's: combine session-type lists; its own sign-off name and closing line win.
  const localSettings = (await Promise.all(SYNCED_META.map(key => db.get('meta', key)))).filter(Boolean);

  const { changed, remote } = await pull(session, { everything: true });

  for (const mine of localSettings) {
    const current = await db.get('meta', mine.id);
    let value = mine.value;
    if (mine.id === 'sessionTypes' && Array.isArray(current?.value)) {
      value = [...current.value, ...mine.value.filter(t => !current.value.some(c => c.toLowerCase() === String(t).toLowerCase()))];
    } else if (typeof value === 'string' && !value.trim()) {
      continue; // an empty local setting shouldn't blank out a real one
    }
    if (JSON.stringify(current?.value) !== JSON.stringify(value)) await db.setMeta(mine.id, value); // queued, and newest
  }

  // Every device seeded its own copy of the starter drills with different ids. Keep the server's copy and
  // point this device's plans and sessions at it.
  const drills = await db.all('drills');
  const serverByName = new Map(drills.filter(d => remote.has(`drills:${d.id}`)).map(d => [d.name.trim().toLowerCase(), d.id]));
  const remap = new Map();
  for (const d of drills) {
    if (remote.has(`drills:${d.id}`)) continue;
    const match = serverByName.get(d.name.trim().toLowerCase());
    if (match) remap.set(d.id, match);
  }
  if (remap.size) {
    for (const plan of await db.all('plans')) {
      if (!plan.days.flat().some(b => remap.has(b.drillId))) continue;
      plan.days.forEach(day => day.forEach(b => { if (remap.has(b.drillId)) b.drillId = remap.get(b.drillId); }));
      await db.put('plans', plan);
    }
    for (const s of await db.all('sessions')) {
      if (!(s.drills || []).some(d => remap.has(d.drillId))) continue;
      s.drills.forEach(d => { if (remap.has(d.drillId)) d.drillId = remap.get(d.drillId); });
      await db.put('sessions', s);
    }
    for (const [localId, serverId] of remap) {
      const mine = drills.find(d => d.id === localId);
      const theirs = drills.find(d => d.id === serverId);
      await db.del('drills', localId, { fromSync: true });
      // Drew customised this drill on this device (dose, level, cues…): keep his version under the shared id.
      if (!isUntouchedStarter(mine) && drillSignature(mine) !== drillSignature(theirs)) {
        await db.put('drills', { ...mine, id: serverId });
      }
    }
  }

  // If another device already built the library, this device's untouched starter drills that the server
  // doesn't have were deleted over there on purpose. Don't bring them back (unless something here uses them).
  if (drills.some(d => remote.has(`drills:${d.id}`))) {
    const used = new Set([
      ...(await db.all('plans')).flatMap(p => p.days.flat().map(b => b.drillId)),
      ...(await db.all('sessions')).flatMap(s => (s.drills || []).map(d => d.drillId)),
    ]);
    for (const d of await db.all('drills')) {
      if (remote.has(`drills:${d.id}`) || used.has(d.id) || !isUntouchedStarter(d)) continue;
      remap.set(d.id, null); // excluded from upload below
      await db.del('drills', d.id, { fromSync: true });
    }
  }

  // Queue everything this device has that the server doesn't (or has an older copy of).
  const outbox = new Map((await db.outbox.all()).map(e => [e.id, e]));
  for (const name of STORES) {
    for (const record of await db.all(name)) {
      if (name === 'meta' && !SYNCED_META.includes(record.id)) continue;
      if (name === 'drills' && remap.has(record.id)) continue;
      const key = `${name}:${record.id}`;
      const modified = record._modified || 1;
      if (outbox.has(key) || (remote.has(key) && remote.get(key) >= modified)) continue;
      await db.outbox.add({ id: key, store: name, recordId: record.id, deleted: false, modified });
    }
  }
  for (const id of remap.keys()) {
    const entry = outbox.get(`drills:${id}`);
    if (entry) await db.outbox.remove(entry);
  }

  await push(session);
  await db.setMeta('syncInitialized', session.user.id);
  return changed + remap.size;
}

// ---------------------------------------------------------------- loop

let running = false;
let queued = false;

export async function syncNow() {
  if (running) { queued = true; return; }
  running = true;
  try {
    const session = await getSession();
    if (!session) { setState({ status: 'off', email: null }); return; }
    setState({ status: 'syncing', email: session.user.email, error: null });

    let changed;
    if ((await db.getMeta('syncInitialized')) !== session.user.id) {
      changed = await firstSync(session);
    } else {
      await push(session);
      ({ changed } = await pull(session));
    }
    setState({ status: 'idle', lastSynced: Date.now(), pending: (await db.outbox.all()).length, error: null });
    if (changed) window.dispatchEvent(new Event('spotter:remote-change'));
  } catch (err) {
    const offline = !navigator.onLine || err instanceof TypeError; // fetch throws TypeError with no connection
    if (!offline) console.error(err);
    setState({ status: offline ? 'offline' : 'error', error: offline ? null : err.message, pending: (await db.outbox.all()).length });
  } finally {
    running = false;
    if (queued) { queued = false; syncNow(); }
  }
}

// Called by db.clear-based restores: the next sync merges from scratch.
export async function resetSyncProgress() {
  await db.del('meta', 'syncCursor', { fromSync: true });
  await db.del('meta', 'syncInitialized', { fromSync: true });
  await db.outbox.clear();
}

export { LOCAL_ONLY_META };

export function startSync() {
  let debounce;
  window.addEventListener('spotter:local-change', () => {
    clearTimeout(debounce);
    debounce = setTimeout(syncNow, 1500);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('online', syncNow);
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, POLL_MS);
  syncNow();
}
