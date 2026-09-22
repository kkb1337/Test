const APP_VERSION = '1.8.37';
const CACHE_NAME = `ftracker-${APP_VERSION}-offline-shell`;
const OFFLINE_FALLBACK = './index.html';

// Keep the app shell small and deterministic. These are the files required
// to boot FTracker when there is no network connection.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './app.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // A failed install must not activate a partially cached application shell.
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith('ftracker-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

function isAppShellRequest(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin && (
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/app.js') ||
    url.pathname.endsWith('/styles.css') ||
    url.pathname.endsWith('/manifest.json') ||
    url.pathname.endsWith('/icon-192.png') ||
    url.pathname.endsWith('/icon-512.png')
  );
}

async function cacheResponse(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    await cacheResponse(request, response);
    return response;
  } catch (_) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw _;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A PWA launch is a navigation request. Always provide a real HTML shell
  // from the cache when the network is unavailable. This is the critical
  // offline path and does not depend on the launch URL/query string.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        await cacheResponse(OFFLINE_FALLBACK, response.clone());
        return response;
      } catch (_) {
        const cached = await caches.match(OFFLINE_FALLBACK, { ignoreSearch: true });
        return cached || Response.error();
      }
    })());
    return;
  }

  // App-shell resources use network-first so a new deployment becomes
  // available normally, while the installed PWA remains fully usable offline.
  if (isAppShellRequest(request)) {
    event.respondWith(networkFirst(request).catch(() => caches.match(request, { ignoreSearch: true })));
    return;
  }

  // Same-origin runtime resources are also retained for offline reuse.
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      await cacheResponse(request, response);
      return response;
    } catch (_) {
      return caches.match(request, { ignoreSearch: true }) || Response.error();
    }
  })());
});
