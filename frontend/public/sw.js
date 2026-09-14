// ponytail: app-shell only (no media/API caching — videos are local + large, upgrade to Workbox when offline playback is wanted).
const CACHE = 'nest-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/')) return; // ponytail: never cache API/media
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put('/index.html', c)); return r; }).catch(() => caches.match('/index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok && u.origin === location.origin) { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put(e.request, c)); } return r; }).catch(() => hit)));
});
