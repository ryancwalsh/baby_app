/**
 * Minimal service worker, just enough to make the app installable.
 */
const CACHE = 'baby-app-cache-v1';

/**
 * A service worker is served verbatim from `public/`, so it cannot import
 * axios's `HttpStatusCode`. This is the one member of it that matters here.
 */
const HttpStatusCode = {
  PartialContent: 206,
};

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Anything under `/api/` is live device state or an endless stream, and neither
 * survives being stored. The night light's `EventSource` is the sharp case: it
 * stays open for the life of the page, so `cache.put` waits on a body that
 * never ends while the clone buffers every heartbeat. Its URL also carries the
 * login hash as a query parameter, and a cache key is the whole URL — caching
 * it would write that hash to disk.
 */
const isCacheable = (request) => {
  const { pathname } = new URL(request.url);

  return request.method === 'GET' && !pathname.startsWith('/api/');
};

/**
 * Only a complete, successful body is worth keeping. A 404 or a 500 stored here
 * would come back later as the offline fallback, and `cache.put` rejects
 * outright on the partial responses the lullaby audio provokes when it seeks.
 */
const isStorable = (response) => {
  return response.ok && response.status !== HttpStatusCode.PartialContent;
};

/**
 * Network first, falling back to whatever was cached last.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (isCacheable(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isStorable(response)) {
            const copy = response.clone();
            caches
              .open(CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});
          }

          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error())),
    );
  }
});
