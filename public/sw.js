// Service Worker for Ahl Elsan3a PWA
const CACHE_NAME = 'ahl-elsan3a-pwa-v2';
const PRECACHE_ASSETS = [
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache asset fetch failure:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests and http/https schemes
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // NEVER intercept any JavaScript, TypeScript, module scripts, chunks, Vite dev endpoints, or APIs
  if (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.mjs') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.tsx') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.map') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/__') ||
    url.pathname.includes('virtual:') ||
    url.pathname.startsWith('/_server') ||
    url.pathname.startsWith('/_ssr') ||
    url.pathname.startsWith('/_chunks') ||
    url.pathname.startsWith('/_libs') ||
    url.pathname.startsWith('/node_modules') ||
    url.pathname.startsWith('/api') ||
    url.searchParams.has('v') ||
    url.searchParams.has('t') ||
    url.hostname.includes('supabase.co') ||
    event.request.destination === 'script' ||
    event.request.destination === 'worker' ||
    event.request.destination === 'style'
  ) {
    return;
  }

  // Only handle static precached assets (icons, manifest, favicon)
  if (PRECACHE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
  }
});

