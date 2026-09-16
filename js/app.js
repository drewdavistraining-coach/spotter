// Entry point: first-run seeding, hash router, bottom nav, service worker.
import { db, uid } from './db.js';
import { seedDrills } from './seed.js';
import { $$ } from './util.js';
import { clientsView, clientFormView, clientView } from './views/clients.js';
import { sessionFormView } from './views/session.js';
import { planView } from './views/plan.js';
import { recapView } from './views/recap.js';
import { weekView } from './views/week.js';
import { drillsView } from './views/drills.js';
import { settingsView } from './views/settings.js';
import { startSync } from './sync.js';

const ID = '([a-z0-9]+)';
const DATE = '(\\d{4}-\\d{2}-\\d{2})';

// [pattern, view, bottom-nav tab]
const routes = [
  [`/`, clientsView, 'clients'],
  [`/clients/new`, () => clientFormView(null), 'clients'],
  [`/clients/${ID}/edit`, clientFormView, 'clients'],
  [`/clients/${ID}/sessions/new`, id => sessionFormView(id, null), 'clients'],
  [`/clients/${ID}/sessions/${ID}`, sessionFormView, 'clients'],
  [`/clients/${ID}/plan(?:/${DATE})?`, planView, 'clients'],
  [`/clients/${ID}/recap`, recapView, 'clients'],
  [`/clients/${ID}`, clientView, 'clients'],
  [`/week(?:/${DATE})?`, weekView, 'week'],
  [`/drills`, drillsView, 'drills'],
  [`/settings`, settingsView, 'settings'],
].map(([pattern, view, tab]) => [new RegExp(`^${pattern}$`), view, tab]);

async function route() {
  const [path, qs = ''] = (location.hash.slice(1) || '/').split('?');
  const query = new URLSearchParams(qs);
  for (const [re, view, tab] of routes) {
    const match = path.match(re);
    if (!match) continue;
    $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    try {
      await view(...match.slice(1), query);
    } catch (err) {
      console.error(err);
      document.getElementById('view').innerHTML = `<div class="empty"><h3>Something went wrong</h3><p>${err.message}</p><a class="btn ghost" href="#/">Home</a></div>`;
    }
    return;
  }
  location.hash = '#/';
}

async function firstRun() {
  if (await db.getMeta('seeded')) return;
  for (const drill of seedDrills(uid)) await db.put('drills', drill);
  await db.setMeta('seeded', true);
}

// The opening animation plays once per launch, then gets out of the way. A tap skips it.
const splash = document.getElementById('splash');
if (splash) {
  const hideSplash = () => splash.classList.add('done');
  setTimeout(hideSplash, matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 2200);
  splash.addEventListener('pointerdown', hideSplash);
}

window.addEventListener('hashchange', route);
await firstRun();
route();
startSync();

// Another device's changes arrived. Refresh the screen, unless he's typing or in a form
// (those screens load fresh data next time they open anyway).
window.addEventListener('spotter:remote-change', async () => {
  const path = location.hash.slice(1).split('?')[0] || '/';
  const formScreen = /\/(new|edit|recap)$|\/sessions\/|^\/settings$/.test(path);
  const busy = document.querySelector('.sheet-backdrop') || document.activeElement?.matches('input, textarea, select');
  if (formScreen || busy) return;
  const y = window.scrollY;
  await route();
  window.scrollTo(0, y);
});

// Skipped on localhost so edits show up on refresh instead of being served from the offline cache.
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  const openedAt = Date.now();
  const hadController = Boolean(navigator.serviceWorker.controller);
  const registration = await navigator.serviceWorker.register('./sw.js');

  // iPhone apps resumed from the background don't re-check for updates on their own, so check every time
  // Spotter comes back to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration.update();
  });

  // A new version took over. Reload straight away if he's only just opened the app or it's in the background;
  // otherwise offer a tap-to-refresh so a half-typed session isn't lost.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install, nothing to refresh
    if (document.visibilityState === 'hidden' || Date.now() - openedAt < 10000) return location.reload();
    const bar = document.createElement('button');
    bar.className = 'update-bar';
    bar.textContent = 'Spotter was updated — tap to refresh';
    bar.addEventListener('click', () => location.reload());
    document.body.append(bar);
  });
}
