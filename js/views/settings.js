// Settings: sync sign-in, his name for recaps, session types, backups, and install help.
import { db, STORES, sessionTypes } from '../db.js';
import { esc, $, $$, daysAgo, toast, isoDate } from '../util.js';
import { syncState, syncNow, signIn, signUp, signOut, resendConfirmation } from '../sync.js';
import { page, listEditor } from '../ui.js';
import { SESSION_TYPES } from '../seed.js';
import { exportBackup, importBackup } from '../backup.js';

export async function settingsView() {
  const [trainerName, recapClosing, lastBackup, clients, memos, types] = await Promise.all([
    db.getMeta('trainerName', ''), db.getMeta('recapClosing', 'Keep putting in the work - see you on the mats.'),
    db.getMeta('lastBackup'), db.all('clients'), db.all('memos'), sessionTypes(),
  ]);
  const weightUnit = await db.getMeta('weightUnit', 'lb');
  const signedIn = Boolean(await db.getMeta('auth'));
  const persisted = await navigator.storage?.persisted?.();
  const estimate = await navigator.storage?.estimate?.();
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

  const view = page({
    title: 'Settings',
    body: `
      <section class="card stack" data-sync></section>

      <section class="card stack">
        <h3>Recaps</h3>
        <label class="field"><span>Your name (email sign-off)</span><input data-meta="trainerName" value="${esc(trainerName)}" placeholder="Coach ___"></label>
        <label class="field"><span>Closing line</span><textarea data-meta="recapClosing" rows="2">${esc(recapClosing)}</textarea></label>
        <fieldset class="field"><span>Weight unit</span>
          <div class="chips">${['lb', 'kg'].map(u => `<button type="button" class="chip-btn ${u === weightUnit ? 'on' : ''}" data-unit="${u}">${u}</button>`).join('')}</div>
          <span class="muted small">Used when you log weights for a drill. Changing it doesn't convert numbers already logged.</span>
        </fieldset>
      </section>

      <section class="card stack">
        <h3>Session types</h3>
        <p class="muted small">The Type dropdown when you log a session. Removing one doesn't change sessions already logged.</p>
        <div class="list-editor" data-types></div>
      </section>

      <section class="card stack">
        <h3>Backup</h3>
        <p class="small">${signedIn ? 'On this device' : 'Your data lives only on this device'}: ${clients.length} clients, ${memos.length} voice memos${estimate ? `, about ${(estimate.usage / 1048576).toFixed(1)} MB` : ''}.
          ${lastBackup ? `Last backup <b>${daysAgo(isoDate(new Date(lastBackup)))}</b>.` : `<b class="${signedIn ? '' : 'warn-text'}">Never backed up.</b>`}</p>
        <button class="btn ${signedIn ? 'ghost' : 'primary'} block" data-export>💾 Back up now</button>
        <p class="muted small">${isIOS ? 'Choose “Save to Files” (iCloud Drive).' : 'Saves a .json file to your downloads.'} ${signedIn ? 'Sync keeps your devices matched; a backup file is an extra copy you control.' : 'Restore that file on another device to move everything over.'}</p>
        <label class="btn ghost block">📂 Restore from backup<input type="file" accept=".json,application/json" hidden data-import></label>
        <p class="muted small">${signedIn ? 'With sync on, restoring merges: for each record, the newest version wins.' : 'Restoring replaces everything currently on this device.'}</p>
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
        ${signedIn ? '<p class="muted small">Only erases this device and signs it out. Your synced data stays in the cloud and comes back when you sign in again.</p>' : ''}
      </section>
      <p class="muted small center">${signedIn ? 'Synced privately to your account.' : 'Data never leaves this device unless you back it up or send a recap.'}</p>`,
  });

  renderSyncCard($('[data-sync]', view));

  view.addEventListener('click', async e => {
    const btn = e.target.closest('[data-unit]');
    if (!btn) return;
    await db.setMeta('weightUnit', btn.dataset.unit);
    $$('[data-unit]', view).forEach(b => b.classList.toggle('on', b === btn));
    toast(`Weights in ${btn.dataset.unit}`);
  });

  listEditor($('[data-types]', view), {
    items: types,
    suggestions: SESSION_TYPES,
    placeholder: 'New type (e.g. Fight camp)',
    emptyText: 'No types — the dropdown will be empty.',
    onChange: list => db.setMeta('sessionTypes', list),
  });

  view.addEventListener('change', async e => {
    if (e.target.matches('[data-new]')) return;
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
    const question = signedIn
      ? 'Restore this backup? It merges with your synced data — for each record, the newest version wins.'
      : 'Replace ALL data on this device with this backup?';
    if (!confirm(question)) { e.target.value = ''; return; }
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
    await db.outbox.clear();
    location.hash = '#/';
    location.reload();
  });
}

function syncStatusText(s) {
  if (s.status === 'syncing') return 'Syncing…';
  if (s.status === 'offline') return `<span class="warn-text">Offline</span> — ${s.pending ? `${s.pending} change${s.pending === 1 ? '' : 's'} will upload` : 'changes will upload'} when you reconnect.`;
  if (s.status === 'error') return `<span class="warn-text">Sync problem:</span> ${esc(s.error)}`;
  if (s.lastSynced) return `<span class="good">✓ Up to date</span> · synced ${new Date(s.lastSynced).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return 'Connecting…';
}

// The sync card re-renders itself as sync status changes, without redrawing the rest of Settings.
async function renderSyncCard(card) {
  const signedIn = Boolean(await db.getMeta('auth'));
  const s = syncState();

  if (!signedIn) {
    card.innerHTML = `
      <h3>Sync</h3>
      <p class="small">Sign in to keep your phone and laptop in sync. Everything you've entered on this device is kept and uploaded.</p>
      ${s.error ? `<p class="small warn-text">${esc(s.error)}</p>` : ''}
      <form class="stack" data-auth>
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
        <div class="row gap"><button class="btn primary grow" data-mode="in">Sign in</button><button class="btn ghost grow" data-mode="up">Create account</button></div>
      </form>`;
    const form = $('[data-auth]', card);
    let mode = 'in';
    form.addEventListener('click', e => { if (e.target.dataset.mode) mode = e.target.dataset.mode; });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = form.email.value.trim(), password = form.password.value;
      $$('button', form).forEach(b => { b.disabled = true; });
      try {
        if (mode === 'up') {
          const needsConfirm = await signUp(email, password);
          if (needsConfirm) {
            card.querySelector('p').innerHTML = `<b>Check ${esc(email)}</b> for a confirmation email and tap the link, then come back here and sign in.`;
            $$('button', form).forEach(b => { b.disabled = false; });
            return;
          }
        } else {
          await signIn(email, password);
        }
        toast('Signed in — syncing');
        settingsView();
      } catch (err) {
        $$('button', form).forEach(b => { b.disabled = false; });
        if (/not confirmed/i.test(err.message)) {
          card.querySelector('p').innerHTML = `<b>${esc(email)} hasn't been confirmed yet.</b> Tap the link in the confirmation email, then sign in again.
            <button type="button" class="btn ghost small" data-resend>Resend confirmation email</button>`;
          $('[data-resend]', card).addEventListener('click', async () => {
            try { await resendConfirmation(email); toast('Confirmation email sent'); } catch (e) { toast(e.message); }
          });
        } else {
          toast(/invalid login/i.test(err.message) ? 'Wrong email or password' : err.message);
        }
      }
    });
    return;
  }

  card.innerHTML = `
    <h3>Sync</h3>
    <p class="small">Signed in as <b>${esc(s.email || (await db.getMeta('auth')).user.email)}</b></p>
    <p class="small" data-status>${syncStatusText(s)}</p>
    <div class="row gap"><button class="btn ghost grow" data-sync-now>↻ Sync now</button><button class="btn ghost grow" data-sign-out>Sign out</button></div>`;
  $('[data-sync-now]', card).addEventListener('click', () => syncNow());
  $('[data-sign-out]', card).addEventListener('click', async () => {
    if (!confirm('Sign out of sync on this device? Your data stays on this device and in the cloud.')) return;
    await signOut();
    settingsView();
  });
  const onStatus = e => {
    if (!card.isConnected) return window.removeEventListener('spotter:sync-status', onStatus);
    const el = $('[data-status]', card);
    if (el) el.innerHTML = syncStatusText(e.detail);
  };
  window.addEventListener('spotter:sync-status', onStatus);
}
