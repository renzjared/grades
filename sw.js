const CACHE_NAME = 'tala-dashboard-v3';
const urlsToCache = [
  '/grades/',
  '/grades/index.html',
  '/grades/styles.css',
  '/grades/manifest.json',
  '/grades/js/app.js',
  '/grades/js/api.js',
  '/grades/js/auth.js',
  '/grades/js/assignments.js',
  '/grades/js/calendar.js',
  '/grades/js/calculator.js',
  '/grades/js/notes.js',
  '/grades/js/sharing.js',
  '/grades/js/classroom.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});