/**
 * PIVISION Mobile — Service Worker v4.2.0-R300+stage3
 *
 * Stage 3 of the modernization plan. Replaces the simple cache-first SW
 * with a strategy router that picks the right policy per asset class:
 *
 *   ┌────────────────────────┬──────────────────────────────┐
 *   │ Asset class            │ Strategy                     │
 *   ├────────────────────────┼──────────────────────────────┤
 *   │ HTML (navigation)      │ Network-first → cache fall   │
 *   │ /symbols/* (versioned) │ Cache-first (immutable)      │
 *   │ /fonts/*, /icons/*     │ Cache-first (immutable)      │
 *   │ CSS/JS (versioned)     │ Stale-while-revalidate       │
 *   │ /piwebapi/*, /api/*    │ Network-only (no cache)      │
 *   │ Cross-origin           │ Pass-through                 │
 *   └────────────────────────┴──────────────────────────────┘
 *
 * The legacy precache list is kept (so first install still works
 * offline) but it's now installed in parallel and failure on any single
 * file no longer aborts the whole install.
 *
 * Cache size is bounded: each runtime cache is trimmed to MAX_RUNTIME
 * entries on activate to prevent unbounded growth.
 */

const VERSION = 'v4.2.0-R300-stage3';
const PRECACHE = `pivision-precache-${VERSION}`;
const RUNTIME_HTML = `pivision-html-${VERSION}`;
const RUNTIME_ASSETS = `pivision-assets-${VERSION}`;
const RUNTIME_SYMBOLS = `pivision-symbols-${VERSION}`;

const MAX_RUNTIME = 200;

const PRECACHE_URLS = [
  './',
  './index.html',
  './css/mobile-app.css',
  './js/mobile-app.js',
  './js/mobile-sync.js',
  './js/error-telemetry.js',
  './js/sanitizer.js',
  './js/symbol-sandbox.js',
  // Stage 1/2 security helpers — must be precached so the first launch
  // does not fall back to the unsafe-eval path.
  './js/security/safe-dom.js',
  './js/security/safe-expr.js',
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

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/** Cache a request, then trim the cache to MAX_RUNTIME entries (LRU-ish). */
async function cachePut(cacheName, request, response) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  // Trim oldest entries when over budget.
  const keys = await cache.keys();
  if (keys.length > MAX_RUNTIME) {
    const drop = keys.length - MAX_RUNTIME;
    for (let i = 0; i < drop; i++) await cache.delete(keys[i]);
  }
}

/** Strategy: cache-first (used for immutable assets). */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cachePut(cacheName, request, response.clone());
    }
    return response;
  } catch (err) {
    // Last-resort: try to match in any cache (e.g. precache fallback)
    const fallback = await caches.match(request, { ignoreSearch: true });
    if (fallback) return fallback;
    throw err;
  }
}

/** Strategy: network-first (used for HTML / dynamic content). */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cachePut(cacheName, request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Final fallback for navigation requests.
    if (request.mode === 'navigate' || request.destination === 'document') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    throw new Error('Network and cache both failed');
  }
}

/** Strategy: stale-while-revalidate (used for versioned JS/CSS). */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cachePut(cacheName, request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || fetchPromise;
}

// ──────────────────────────────────────────────────────────────────────────
// Lifecycle
// ──────────────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then(async (cache) => {
        // Add files individually so a single 404 doesn't abort install.
        await Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch((err) => {
              // eslint-disable-next-line no-console
              console.warn('[sw] precache miss:', url, err);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const valid = new Set([PRECACHE, RUNTIME_HTML, RUNTIME_ASSETS, RUNTIME_SYMBOLS]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !valid.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Allow the page to ask the SW to immediately take control after an update.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Fetch routing
// ──────────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  const path = url.pathname;

  // API calls — never cached.
  if (path.includes('/piwebapi') || path.includes('/api/')) {
    return;
  }

  // HTML navigation — network-first (so users see fresh content).
  if (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    path.endsWith('.html')
  ) {
    event.respondWith(networkFirst(request, RUNTIME_HTML));
    return;
  }

  // Symbols are versioned via `?v=R300x` query strings → cache-first
  // is safe and fast.
  if (path.includes('/symbols/') || path.includes('/wow-plugins/')) {
    event.respondWith(cacheFirst(request, RUNTIME_SYMBOLS));
    return;
  }

  // Fonts and icons are immutable.
  if (path.includes('/fonts/') || path.includes('/icons/')) {
    event.respondWith(cacheFirst(request, RUNTIME_ASSETS));
    return;
  }

  // Everything else (CSS, JS, etc.) — stale-while-revalidate balances
  // freshness and offline-first.
  event.respondWith(staleWhileRevalidate(request, RUNTIME_ASSETS));
});
