const CACHE = 'examzhub-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  const sameStatic = url.origin === location.origin && url.pathname.startsWith('/static/');
  const cdn = url.hostname === 'cdn.jsdelivr.net';
  if (request.mode === 'navigate' || sameStatic || cdn) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request.mode === 'navigate' ? '/' : request, copy));
        }
        return response;
      }).catch(() => caches.match(request.mode === 'navigate' ? '/' : request))
    );
  }
});
