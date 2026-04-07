/**
 * PIVISION Mobile — Symbol loader / prefetcher
 * Stage 3 of the modernization plan.
 *
 * The legacy emulator (`emulator/js/app.js → _loadSymbol`) already
 * lazy-loads each symbol on demand by injecting `<script>` tags. That
 * works, but it has three problems:
 *
 *   1. Re-loading the same plugin multiple times. Two symbols in the
 *      same family (e.g. `mug*`) both call `_loadScript('mu20-core.js')`
 *      which results in duplicate `<script>` tags. The browser
 *      deduplicates the network fetch, but DOM noise is real.
 *
 *   2. No prefetch. The first time a user clicks a symbol, the round
 *      trip is full network → parse → execute. We can warm the cache
 *      during idle time using `<link rel="prefetch">`.
 *
 *   3. No race protection. Two concurrent calls to load the same
 *      symbol race; whichever script callback fires first wins, the
 *      other is wasted work.
 *
 * This module is additive. It does NOT replace `_loadSymbol`; it
 * augments it via a global `window.SymbolLoader` API that the legacy
 * code can opt into. When the emulator boots and finds
 * `window.SymbolLoader` defined, it can route through it for
 * deduplication and idle prefetch.
 *
 * No-op safe: if SymbolLoader is missing, the legacy path continues
 * unchanged.
 */

// ──────────────────────────────────────────────────────────────────────────
// Internal state
// ──────────────────────────────────────────────────────────────────────────

/** url → Promise (in-flight or resolved) */
const _scriptCache = new Map();

/** url → Promise (in-flight or resolved) */
const _cssCache = new Map();

/** Set of urls already requested via <link rel=prefetch> */
const _prefetched = new Set();

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Load a script tag, deduplicating concurrent and repeated calls.
 * Returns a Promise that resolves when the script has executed.
 *
 * @param {string} url
 * @returns {Promise<void>}
 */
export function loadScript(url) {
  if (_scriptCache.has(url)) return _scriptCache.get(url);

  // Detect a script tag that someone else added (legacy `_loadScript`).
  const existing = document.querySelector(`script[src="${url}"]`);
  if (existing) {
    // Assume it loaded successfully — the legacy injector resolves
    // its promise on `script.onload`, but if we're called after the
    // tag is already in the DOM the script has executed.
    const p = Promise.resolve();
    _scriptCache.set(url, p);
    return p;
  }

  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = false; // preserve execution order across loadScript calls
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load script: ' + url));
    document.head.appendChild(s);
  });

  _scriptCache.set(url, p);
  return p;
}

/**
 * Load a CSS file, deduplicating concurrent and repeated calls.
 *
 * @param {string} url
 * @returns {Promise<void>}
 */
export function loadCSS(url) {
  if (_cssCache.has(url)) return _cssCache.get(url);
  if (document.querySelector(`link[href="${url}"]`)) {
    const p = Promise.resolve();
    _cssCache.set(url, p);
    return p;
  }

  const p = new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.onload = () => resolve();
    link.onerror = () => resolve(); // missing CSS should not block symbol load
    document.head.appendChild(link);
  });

  _cssCache.set(url, p);
  return p;
}

/**
 * Hint the browser to prefetch a URL during idle time. Uses
 * `<link rel="prefetch">` which is non-blocking and best-effort.
 *
 * @param {string} url
 */
export function prefetch(url) {
  if (_prefetched.has(url)) return;
  _prefetched.add(url);

  // Skip if already loaded.
  if (_scriptCache.has(url) || _cssCache.has(url)) return;
  if (document.querySelector(`script[src="${url}"]`)) return;
  if (document.querySelector(`link[href="${url}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = url;
  // Hint the right destination so the browser can apply the right
  // priority and reuse the cached response when the actual <script>
  // tag fires.
  if (url.endsWith('.js')) link.as = 'script';
  else if (url.endsWith('.css')) link.as = 'style';
  document.head.appendChild(link);
}

/**
 * Prefetch a batch of URLs during the next idle window. Uses
 * `requestIdleCallback` when available, falls back to `setTimeout`.
 *
 * @param {string[]} urls
 */
export function prefetchIdle(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return;
  const ric = (typeof window !== 'undefined' && window.requestIdleCallback) || null;
  const run = () => urls.forEach(prefetch);
  if (ric) ric(run, { timeout: 2000 });
  else setTimeout(run, 500);
}

/**
 * Reset internal caches. Mainly for tests; production code should
 * never need this.
 */
export function _reset() {
  _scriptCache.clear();
  _cssCache.clear();
  _prefetched.clear();
}

// ──────────────────────────────────────────────────────────────────────────
// Global exposure for legacy non-module scripts
// ──────────────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.SymbolLoader = Object.freeze({
    loadScript,
    loadCSS,
    prefetch,
    prefetchIdle,
  });
}
