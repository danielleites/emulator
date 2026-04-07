/**
 * PIVISION Mobile — Service Worker v4.2.0-R300
 * Provides offline caching for static assets.
 * Strategy: Cache-first for static, network-first for API calls.
 */

const CACHE_NAME = 'pivision-v4.2.0-R300';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/mobile-app.css',
  './js/mobile-app.js',
  './js/mobile-sync.js',
  './js/error-telemetry.js',
  './js/sanitizer.js',
  './js/symbol-sandbox.js',
  './fonts/heebo.css',
  './fonts/heebo-400.ttf',
  './fonts/heebo-500.ttf',
  './fonts/heebo-600.ttf',
  './fonts/heebo-700.ttf',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './manifest-mobile.json',
  // Emulator core — pre-cache for offline symbol viewing
  './emulator/index.html',
  './emulator/css/emulator.css',
  './emulator/css/emu-features.css',
  './emulator/css/emu-devtools.css',
  './emulator/css/emu-extras.css',
  './emulator/js/emu-shims.js',
  './emulator/js/app.js',
  './emulator/js/emu-devtools.js',
  './emulator/js/emu-af.js',
  './emulator/js/emu-extras.js',
  './emulator/js/emu-mobile.js',
  './emulator/js/emu-favorites.js',
  './emulator/js/emu-guardian.js',
];

// Install — cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first for static, network-first for API/dynamic
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin and non-GET requests
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // API calls — network first, no cache
  if (url.pathname.includes('/piwebapi') || url.pathname.includes('/api/')) {
    return; // Let them pass through to network
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Fallback for HTML navigation
      if (request.destination === 'document') {
        return caches.match('./index.html');
      }
    })
  );
});
