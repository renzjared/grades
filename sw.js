const CACHE_NAME = 'tala-dashboard-v4'; // Bumped version to force cache update

// Use relative paths so it works at the root (local) or in a subdirectory (GitHub Pages)
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
  './js/sharing.js',
  './js/classroom.js'
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
  // Ignore API calls, Supabase traffic, Google traffic, and non-GET requests
  if (
      event.request.method !== 'GET' || 
      event.request.url.includes('supabase.co') || 
      event.request.url.includes('googleapis.com')
  ) {
      return; // Let the browser handle these normally without the Service Worker
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
          return cachedResponse;
      }
      // Return a proper 404 Response object instead of undefined to prevent crashes
      return new Response('Offline resource not found', { status: 404 });
    })
  );
});