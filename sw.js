// Offline support: cache the app shell, serve it cache-first.
// Bump VERSION whenever you change any file so phones pick up the update.
const VERSION = 'spotter-v2';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png',
  'js/app.js', 'js/db.js', 'js/seed.js', 'js/util.js', 'js/ui.js', 'js/progress.js', 'js/planner.js', 'js/recap.js',
  'js/backup.js', 'js/recorder.js',
  'js/views/clients.js', 'js/views/session.js', 'js/views/plan.js', 'js/views/recap.js',
  'js/views/week.js', 'js/views/drills.js', 'js/views/settings.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(hit => hit || fetch(event.request)),
  );
});
