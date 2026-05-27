const CACHE_SHELL = 'resumeci-shell-v26';
const CACHE_FICHES = 'resumeci-fiches-v2';

const SHELL_FILES = [
  '/',
  '/index.html',
  '/quiz.html',
  '/flashcards.html',
  '/about.html',
  '/contact.html',
  '/faq.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/data/structure.json',
  '/data/stats.json',
  '/data/search-index.json',
  '/enhancements.css',
  '/enhancements.js'
];

// Install: cache shell files
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_SHELL)
      .then(c => c.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_SHELL && k !== CACHE_FICHES).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for HTML pages, cache-first for fiches
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // Fiches: stale-while-revalidate (serve cached fast, but always update in background)
  if (url.pathname.startsWith('/fiches/')) {
    e.respondWith(
      caches.open(CACHE_FICHES).then(cache =>
        cache.match(e.request).then(cached => {
          const fetchPromise = fetch(e.request).then(resp => {
            if (resp && resp.status === 200) cache.put(e.request, resp.clone());
            return resp;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Shell & data: network-first, fallback to cache
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp && resp.status === 200) {
        const clone = resp.clone();
        caches.open(CACHE_SHELL).then(c => c.put(e.request, clone));
      }
      return resp;
    }).catch(() => caches.match(e.request))
  );
});

// Message handler: download fiches for offline
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CACHE_FICHES') {
    const urls = e.data.urls;
    caches.open(CACHE_FICHES).then(cache => {
      return Promise.all(
        urls.map(url =>
          cache.match(url).then(existing => {
            if (existing) return;
            return fetch(url).then(resp => {
              if (resp && resp.status === 200) return cache.put(url, resp);
            }).catch(() => {});
          })
        )
      );
    }).then(() => {
      e.source.postMessage({ type: 'CACHE_DONE', count: urls.length });
    });
  }

  if (e.data && e.data.type === 'GET_CACHED') {
    caches.open(CACHE_FICHES).then(cache => {
      return cache.keys();
    }).then(keys => {
      const urls = keys.map(k => new URL(k.url).pathname);
      e.source.postMessage({ type: 'CACHED_LIST', urls });
    });
  }

  if (e.data && e.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_FICHES).then(() => {
      e.source.postMessage({ type: 'CACHE_CLEARED' });
    });
  }
});

// Notification click: focus or open the app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
