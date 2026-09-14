// Backup = one JSON file with every store, audio memos inlined as base64.
// Without sync, restoring replaces everything on this device. With sync on, it merges (newest edit wins).
import { db, STORES } from './db.js';
import { isoDate } from './util.js';
import { LOCAL_ONLY_META, resetSyncProgress } from './sync.js';

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url) {
  return (await fetch(url)).blob();
}

export async function exportBackup() {
  const data = { app: 'spotter', version: 1, exportedAt: new Date().toISOString(), stores: {} };
  for (const name of STORES) {
    const rows = await db.all(name);
    if (name === 'meta') {
      data.stores[name] = rows.filter(r => !LOCAL_ONLY_META.includes(r.id)); // never put sign-in tokens in a file
    } else if (name === 'memos') {
      data.stores[name] = await Promise.all(rows.map(async m => ({ ...m, audio: m.audio ? await blobToDataUrl(m.audio) : null })));
    } else {
      data.stores[name] = rows;
    }
  }
  const file = new File([JSON.stringify(data)], `spotter-backup-${isoDate()}.json`, { type: 'application/json' });

  // iPhone: the share sheet lets him "Save to Files", AirDrop it, or email it to himself.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Spotter backup' });
    } catch (err) {
      if (err.name === 'AbortError') return false;
      throw err;
    }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  await db.setMeta('lastBackup', new Date().toISOString());
  return true;
}

// With sync on, a restore becomes a merge: the next sync keeps whichever copy of each record is newest,
// so an old backup can't overwrite newer entries from the other device.
export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'spotter' || !data.stores) throw new Error("That file isn't a Spotter backup.");
  const keep = (await Promise.all(LOCAL_ONLY_META.map(key => db.get('meta', key)))).filter(Boolean); // stay signed in
  for (const name of STORES) {
    await db.clear(name);
    for (const row of data.stores[name] || []) {
      if (name === 'meta' && LOCAL_ONLY_META.includes(row.id)) continue;
      if (name === 'memos' && row.audio) row.audio = await dataUrlToBlob(row.audio);
      await db.put(name, row, { fromSync: true }); // keep each record's original edit time
    }
  }
  for (const row of keep) await db.put('meta', row, { fromSync: true });
  await resetSyncProgress();
  return data;
}
