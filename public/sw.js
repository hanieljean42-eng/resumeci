const CACHE_SHELL = 'resumeci-shell-v50';
const CACHE_FICHES = 'resumeci-fiches-v3';

const SHELL_FILES = [
  '/',
  '/index.html',
  '/about.html',
  '/contact.html',
  '/faq.html',
  '/privacy.html',
  '/inscription.html',
  '/connexion.html',
  '/offline.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/data/structure.json',
  '/data/stats.json',
  '/data/search-index.json',
  '/main.css?v=3.3.1',
  '/enhancements.css?v=3.3.1',
  '/enhancements.js?v=3.3.1',
  '/firebase-config.js?v=3.3.1',
  '/content-protection.js?v=3.3.1',
  '/quiz.css?v=3.3.1',
  '/quiz.js?v=3.3.1',
  '/flashcards.js?v=3.3.1',
  '/app.js?v=3.3.1'
];

// Install: cache shell files and skip waiting immediately
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_SHELL)
      .then(c => c.addAll(SHELL_FILES))
  );
});

// Activate: purge all old caches and notify all clients immediately
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_SHELL && k !== CACHE_FICHES).map(k => {
        console.log('[SW] Purging old cache:', k);
        return caches.delete(k);
      }))
    ).then(() => self.clients.claim()).then(() => {
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'FORCE_UPDATE_RELOAD', version: '3.3.1' });
          client.postMessage({ type: 'SW_UPDATED', version: '3.3.1' });
        });
      });
    })
  );
});

// Fetch: bypass cache for sw.js and version.json, network-first for HTML pages
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // Never cache version.json and sw.js
  if (url.pathname.endsWith('version.json') || url.pathname.endsWith('sw.js')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }

  // Fiches: stale-while-revalidate (serve cached fast, but always update in background)
  if (url.pathname.startsWith('/fiches/')) {
    e.respondWith(
      caches.open(CACHE_FICHES).then(cache =>
        cache.match(e.request).then(cached => {
          const fetchPromise = fetch(e.request).then(resp => {
            if (resp && resp.status === 200) cache.put(e.request, resp.clone());
            return resp;
          }).catch(() => cached || caches.match('/offline.html'));
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Shell & data: network-first, fallback to cache, then offline.html for pages
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp && resp.status === 200) {
        const clone = resp.clone();
        caches.open(CACHE_SHELL).then(c => c.put(e.request, clone));
      }
      return resp;
    }).catch(async () => {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
        return caches.match('/offline.html');
      }
    })
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

  if (e.data && (e.data.type === 'CLEAR_CACHE' || e.data.type === 'PURGE_ALL_CACHE')) {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => {
      e.source && e.source.postMessage({ type: 'CACHE_CLEARED' });
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
