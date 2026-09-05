/* ResumeCI Service Worker */
const VERSION = 'rci-sw-v1.0.1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/quiz.html',
  '/flashcards.html',
  '/search.html',
  '/offline.html',
  '/manifest.json',
  '/enhancements.js',
  '/enhancements.css',
  '/content-protection.js',
  '/data/structure.json',
  '/data/search-index.json',
  '/icon-192.png',
  '/og-image.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHtmlRequest(request) {
  const url = new URL(request.url);
  return request.headers.get('accept')?.includes('text/html') || url.pathname.endsWith('.html') || url.pathname === '/';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network falling back to cache for HTML (to refresh content), with offline fallback
  if (isHtmlRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          return resp;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          // Return offline page
          return caches.match('/offline.html');
        })
    );
    return;
  }

  // Cache-first for fiches and static assets
  if (url.pathname.startsWith('/fiches/') || url.pathname.startsWith('/data/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((resp) => {
            const copy = resp.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
            return resp;
          })
          .catch(() => caches.match('/offline.html'));
      })
    );
    return;
  }

  // Stale-while-revalidate for other assets (images/css/js)
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          return resp;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
