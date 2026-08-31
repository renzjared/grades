const CACHE_NAME = 'student-dashboard-v2';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/app.js',
  './js/api.js',
  './js/auth.js',
  './js/assignments.js',
  './js/calendar.js',
  './js/calculator.js',
  './js/notes.js',
  './js/sharing.js'
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