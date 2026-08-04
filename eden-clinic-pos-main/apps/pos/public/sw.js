/* global self, caches, Response, Request, fetch */
const CACHE_NAME = 'eden-shell-__EDEN_CACHE_VERSION__';
const PRECACHE_URLS = __EDEN_PRECACHE_URLS__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(
    PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })),
  )));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('eden-shell-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    // Do not claim existing pages: first install and another tab's update stay quiet.
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Do not use ignoreSearch: query-bearing future routes must never receive
    // a different route shell merely because its path happens to match.
    const cached = await cache.match(request);
    if (cached !== undefined) return cached;
    if (request.mode === 'navigate') {
      try {
        return await fetch(request);
      } catch {
        return (await cache.match('/login')) ?? Response.error();
      }
    }
    return fetch(request);
  })());
});
