// Settings: his name for recaps, backups, and install help.
import { db, STORES } from '../db.js';
import { esc, $, daysAgo, toast } from '../util.js';
import { page } from '../ui.js';
import { exportBackup, importBackup } from '../backup.js';

export async function settingsView() {
  const [trainerName, recapClosing, lastBackup, clients, memos] = await Promise.all([
    db.getMeta('trainerName', ''), db.getMeta('recapClosing', 'Keep putting in the work - see you on the mats.'),
    db.getMeta('lastBackup'), db.all('clients'), db.all('memos'),
  ]);
  const persisted = await navigator.storage?.persisted?.();
  const estimate = await navigator.storage?.estimate?.();
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

  const view = page({
    title: 'Settings',
    body: `
      <section class="card stack">
        <h3>Recaps</h3>
        <label class="field"><span>Your name (email sign-off)</span><input data-meta="trainerName" value="${esc(trainerName)}" placeholder="Coach ___"></label>
        <label class="field"><span>Closing line</span><textarea data-meta="recapClosing" rows="2">${esc(recapClosing)}</textarea></label>
      </section>

      <section class="card stack">
        <h3>Backup</h3>
        <p class="small">Your data lives only on this device: ${clients.length} clients, ${memos.length} voice memos${estimate ? `, about ${(estimate.usage / 1048576).toFixed(1)} MB` : ''}.
          ${lastBackup ? `Last backup <b>${daysAgo(lastBackup.slice(0, 10))}</b>.` : '<b class="warn-text">Never backed up.</b>'}</p>
        <button class="btn primary block" data-export>💾 Back up now</button>
        <p class="muted small">${isIOS ? 'Choose “Save to Files” (iCloud Drive) or AirDrop it to your laptop.' : 'Saves a .json file to your downloads.'} Restore that file on another device to move everything over.</p>
        <label class="btn ghost block">📂 Restore from backup<input type="file" accept=".json,application/json" hidden data-import></label>
        <p class="muted small">Restoring replaces everything currently on this device.</p>
      </section>

      <section class="card stack">
        <h3>Install on iPhone</h3>
        ${standalone ? '<p class="small good">✓ Running as an installed app.</p>' : `
        <ol class="small">
          <li>Open this page in <b>Safari</b>.</li>
          <li>Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</li>
          <li>Open Spotter from the home screen icon from now on.</li>
        </ol>
        <p class="muted small">Installing matters: Safari can clear website data after a few weeks without visits, but home-screen apps keep theirs. The installed app has its own storage, separate from the Safari tab — so set it up there.</p>`}
        <p class="small">Storage protection: ${persisted ? '<span class="good">✓ on</span>' : '<button class="btn ghost small" data-persist>Request</button>'}</p>
      </section>

      <section class="card stack">
        <h3>Danger zone</h3>
        <button class="btn danger block" data-wipe>Erase all data on this device</button>
      </section>
      <p class="muted small center">Spotter v1 · data never leaves this device unless you back it up or send a recap</p>`,
  });

  view.addEventListener('change', async e => {
    const key = e.target.dataset.meta;
    if (!key) return;
    await db.setMeta(key, e.target.value.trim());
    toast('Saved');
  });

  $('[data-export]', view).addEventListener('click', async () => {
    try {
      if (await exportBackup()) { toast('Backup created'); settingsView(); }
    } catch (err) {
      toast(`Backup failed: ${err.message}`);
    }
  });

  $('[data-import]', view).addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Replace ALL data on this device with this backup?')) { e.target.value = ''; return; }
    try {
      const data = await importBackup(file);
      toast(`Restored backup from ${new Date(data.exportedAt).toLocaleDateString()}`);
      location.hash = '#/';
    } catch (err) {
      toast(err.message);
    }
  });

  $('[data-persist]', view)?.addEventListener('click', async () => {
    const ok = await navigator.storage.persist();
    toast(ok ? 'Storage protected' : 'Browser declined — installing to home screen helps');
    settingsView();
  });

  $('[data-wipe]', view).addEventListener('click', async () => {
    if (prompt('Type ERASE to delete every client, session, memo and plan on this device.') !== 'ERASE') return;
    for (const store of STORES) await db.clear(store);
    location.hash = '#/';
    location.reload();
  });
}
