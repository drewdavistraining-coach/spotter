// Offline support, network-first: when online, always load the latest files from the site
// (so a push reaches the phone on its next open); when offline or the network is slow, use the cached copy.
// Bump VERSION when you change files: that's what tells installed apps a new version exists.
const VERSION = 'spotter-v12';
const NETWORK_TIMEOUT_MS = 3000; // slow gym wifi falls back to the cache instead of hanging
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png',
  'js/app.js', 'js/db.js', 'js/seed.js', 'js/util.js', 'js/ui.js', 'js/progress.js', 'js/planner.js', 'js/recap.js',
  'js/backup.js', 'js/recorder.js', 'js/sync.js',
  'js/views/clients.js', 'js/views/session.js', 'js/views/plan.js', 'js/views/recap.js',
  'js/views/week.js', 'js/views/drills.js', 'js/views/settings.js',
];

self.addEventListener('install', event => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never gets stuck with stale files.
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  const fromNetwork = fetch(request, { cache: 'no-cache' }).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  try {
    const response = await Promise.race([fromNetwork, timeout]);
    if (response) return response;
  } catch { /* offline: fall through to the cache */ }
  const cached = await cache.match(request, { ignoreSearch: true });
  return cached || fromNetwork; // nothing cached yet: keep waiting on the network
}
