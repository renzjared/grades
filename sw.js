const CACHE_NAME = 'student-dashboard-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/js/app.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/assignments.js',
  '/js/calendar.js',
  '/js/calculator.js',
  '/js/notes.js',
  '/js/sharing.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});