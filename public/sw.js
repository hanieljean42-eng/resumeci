const CACHE_NAME = 'fiches-bac-v9-faq';
const PRECACHE = [
  '/',
  '/index.html',
  '/quiz.html',
  '/flashcards.html',
  '/about.html',
  '/contact.html',
  '/faq.html',
  '/privacy.html',
  '/sitemap.html',
  '/manifest.json',
  '/robots.txt',
  '/sitemap.xml',
  '/icon.svg',
  '/og-image.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/data/structure.json',
  '/data/stats.json',
  '/data/search-index.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/download') || url.pathname.startsWith('/pdfs/')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(resp => {
        if (resp && resp.status === 200 && url.origin === location.origin) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
