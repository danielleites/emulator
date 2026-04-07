/**
 * PIVISION Mobile — Theme switcher
 * Stage 4 of the modernization plan.
 *
 * Manages the `data-theme` attribute on <html> and persists the
 * user's choice to localStorage. The actual color values live in
 * css/tokens.css; this module just flips an attribute.
 *
 * Themes:
 *   - 'dark'  : force dark
 *   - 'light' : force light
 *   - 'auto'  : honor `prefers-color-scheme` (default)
 *
 * The module is safe to import multiple times — it guards against
 * double-initialization.
 *
 * Usage:
 *   import { initTheme, setTheme, getTheme, onThemeChange } from './ux/theme.js';
 *   initTheme();              // call once at boot, very early
 *   setTheme('light');        // user clicked the toggle
 *   getTheme();               // → 'dark' | 'light' | 'auto'
 *   onThemeChange((t) => {}); // subscribe to changes
 *
 * Or via the global:
 *   window.PIVisionTheme.setTheme('light');
 */

const STORAGE_KEY = 'pivision.theme';
const VALID = new Set(['dark', 'light', 'auto']);
const DEFAULT_THEME = 'dark';

let _initialized = false;
let _current = DEFAULT_THEME;
const _listeners = new Set();

/**
 * Read the persisted theme from localStorage. Falls back to the
 * default on any error (private mode, quota exceeded, etc.).
 *
 * @returns {'dark' | 'light' | 'auto'}
 */
function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && VALID.has(v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

/**
 * Persist the chosen theme. Silent on failure.
 * @param {string} theme
 */
function writeStored(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

/** Apply the theme attribute to <html>. */
function apply(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Initialize the theme system. Call this once at boot, before
 * any UI is painted, to avoid a flash of wrong theme.
 *
 * Idempotent — calling twice is a no-op.
 */
export function initTheme() {
  if (_initialized) return;
  _initialized = true;
  _current = readStored();
  apply(_current);

  // When the OS theme changes and we're in 'auto' mode, re-notify
  // listeners (the CSS already cascades automatically).
  if (typeof window !== 'undefined' && window.matchMedia) {
    try {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => {
        if (_current === 'auto') {
          for (const fn of _listeners) {
            try {
              fn(_current);
            } catch {
              /* ignore */
            }
          }
        }
      };
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onChange);
      } else if (typeof mql.addListener === 'function') {
        // Safari < 14
        mql.addListener(onChange);
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Set the active theme. Persists, applies, notifies subscribers.
 *
 * @param {'dark' | 'light' | 'auto'} theme
 */
export function setTheme(theme) {
  if (!VALID.has(theme)) {
    // eslint-disable-next-line no-console
    console.warn('[theme] invalid theme:', theme);
    return;
  }
  _current = theme;
  writeStored(theme);
  apply(theme);
  for (const fn of _listeners) {
    try {
      fn(theme);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Get the currently active theme name (the user's preference, not
 * the resolved scheme — use `getResolvedTheme()` for that).
 */
export function getTheme() {
  return _current;
}

/**
 * Get the actually-applied scheme. For 'dark'/'light' returns that;
 * for 'auto' returns whatever the OS reports.
 *
 * @returns {'dark' | 'light'}
 */
export function getResolvedTheme() {
  if (_current === 'dark' || _current === 'light') return _current;
  if (typeof window !== 'undefined' && window.matchMedia) {
    try {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
      /* ignore */
    }
  }
  return DEFAULT_THEME;
}

/**
 * Cycle through themes (dark → light → auto → dark). Useful for
 * a single-button toggle.
 */
export function cycleTheme() {
  const next = _current === 'dark' ? 'light' : _current === 'light' ? 'auto' : 'dark';
  setTheme(next);
  return next;
}

/**
 * Subscribe to theme changes. Returns an unsubscribe function.
 *
 * @param {(theme: string) => void} fn
 * @returns {() => void}
 */
export function onThemeChange(fn) {
  if (typeof fn !== 'function') return () => {};
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** Reset state — for tests. */
export function _reset() {
  _initialized = false;
  _current = DEFAULT_THEME;
  _listeners.clear();
}

// ──────────────────────────────────────────────────────────────────────────
// Global exposure for legacy non-module scripts
// ──────────────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.PIVisionTheme = Object.freeze({
    initTheme,
    setTheme,
    getTheme,
    getResolvedTheme,
    cycleTheme,
    onThemeChange,
  });
}
