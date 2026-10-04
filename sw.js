/* FTracker service worker — offline-first shell, lazily cached media. */
const APP_VERSION = '1.8.78';
const SHELL_CACHE = `ftracker-shell-${APP_VERSION}`;
const MEDIA_CACHE = 'ftracker-media-v1'; // exercise animations (root-level *-N.webp) never change; survives app updates

const SHELL = [
  './index.html',
  './styles.css',
  './ui_refactor_1.8.78.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // 'reload' bypasses the HTTP cache so a new version is never half-stale.
    await cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith('ftracker-shell-') && k !== SHELL_CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function fromShell(event) {
  const { request } = event;
  const hit = await caches.match(request, { ignoreSearch: true, cacheName: SHELL_CACHE });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) event.waitUntil(caches.open(SHELL_CACHE).then(c => c.put(request, res.clone())));
  return res;
}

async function fromMedia(event) {
  const { request } = event;
  const cache = await caches.open(MEDIA_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.status === 200) event.waitUntil(cache.put(request, res.clone()));
  return res;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Launch: serve the cached shell instantly, never wait for the network.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { cacheName: SHELL_CACHE })
        .then(hit => hit || fetch(request))
        .catch(() => Response.error())
    );
    return;
  }

  if (/\/[\w-]+-\d+\.webp$/.test(url.pathname)) {
    event.respondWith(fromMedia(event).catch(() => Response.error()));
    return;
  }

  if (/\/(styles\.css|app\.js|manifest\.json|icon-(192|512)\.png|apple-touch-icon\.png)$/.test(url.pathname)) {
    event.respondWith(fromShell(event).catch(() => Response.error()));
  }
});
