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
const shouldHandle = (request) => {
  const { pathname } = new URL(request.url);

  return request.method === 'GET' && !pathname.startsWith('/api/');
};

/**
 * Next names everything under `/_next/static/` after a hash of its contents, so
 * a given URL's bytes never change: edit the file and the URL changes with it.
 * That makes serving them from the cache safe by construction rather than by
 * guesswork, which is what lets the app open at once in a dark room instead of
 * waiting on the tunnel for chunks it already has.
 */
const isImmutable = (request) => {
  const { pathname } = new URL(request.url);

  return pathname.startsWith('/_next/static/');
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
 * Deliberately not awaited by its callers: a cache write is a nicety, and the
 * page should have its response without waiting on one. Failures are swallowed
 * for the same reason.
 */
const store = async (request, response) => {
  if (isStorable(response)) {
    const copy = response.clone();

    try {
      const cache = await caches.open(CACHE);

      await cache.put(request, copy);
    } catch {
      /**
       * Nothing here is worth failing a navigation over.
       */
    }
  }
};

/**
 * For assets whose URL already guarantees their contents.
 */
const respondCacheFirst = async (request) => {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  void store(request, response);

  return response;
};

/**
 * For everything else. This is a remote control for hardware, so a page that is
 * merely slow beats one that confidently shows a lamp in the state it was in an
 * hour ago — the cache is insurance against being offline, not a shortcut.
 */
const respondNetworkFirst = async (request) => {
  try {
    const response = await fetch(request);

    void store(request, response);

    return response;
  } catch {
    const cached = await caches.match(request);

    return cached || Response.error();
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (shouldHandle(request)) {
    if (isImmutable(request)) {
      event.respondWith(respondCacheFirst(request));
    } else {
      event.respondWith(respondNetworkFirst(request));
    }
  }
});
