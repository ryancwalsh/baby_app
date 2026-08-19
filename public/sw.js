/**
 * Minimal service worker, just enough to make the app installable.
 */
const CACHE = 'laydon-cache-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Network first, falling back to whatever was cached last.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error())),
    );
  }
});
