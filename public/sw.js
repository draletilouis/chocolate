// Makes the app installable. Records are never cached: they must always come from the server, so a page
// opened without a connection shows a short offline page instead of old data.
const CACHE = 'equator-offline-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([OFFLINE, '/brand/equator-mark.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
  } else if (new URL(event.request.url).pathname === '/brand/equator-mark.png') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/brand/equator-mark.png')));
  }
});
