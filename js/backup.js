// Backup = one JSON file with every store, audio memos inlined as base64.
// Restoring replaces everything on this device. This is also how data moves phone <-> laptop.
import { db, STORES } from './db.js';
import { isoDate } from './util.js';

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
    if (name === 'memos') {
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

export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'spotter' || !data.stores) throw new Error("That file isn't a Spotter backup.");
  for (const name of STORES) {
    await db.clear(name);
    for (const row of data.stores[name] || []) {
      if (name === 'memos' && row.audio) row.audio = await dataUrlToBlob(row.audio);
      await db.put(name, row);
    }
  }
  return data;
}
