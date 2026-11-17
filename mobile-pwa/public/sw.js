const CACHE_NAME = 'antigravity-mobile-v1';
const ASSETS = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : { title: 'Antigravity Mobile', body: 'Activity update' };
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Antigravity Mobile', {
      body: payload.body,
      tag: payload.tag || 'agm-event',
      data: payload,
    })
  );
});
