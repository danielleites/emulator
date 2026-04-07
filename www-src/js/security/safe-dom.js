/**
 * PIVISION Mobile — Safe DOM helpers
 * Stage 1 of the security hardening plan.
 *
 * Provides a single sanctioned API for inserting HTML into the DOM. The
 * goal is to drain ~350 raw `el.innerHTML = ...` sites in the codebase by
 * routing them through `setSafeHTML()` (which sanitizes via DOMPurify when
 * available, or a strict allow-list fallback otherwise).
 *
 * Usage:
 *   import { setSafeHTML, safeFragment, escape } from './security/safe-dom.js';
 *   setSafeHTML(el, untrustedHtml);
 *
 * Or via the global (for legacy non-module scripts):
 *   window.SafeDOM.setSafeHTML(el, untrustedHtml);
 *
 * The fallback sanitizer is intentionally strict — it strips all event
 * handlers, all `javascript:` URLs, all `<script>`, `<iframe>`, `<object>`,
 * `<embed>`, `<link>`, `<meta>`, `<base>`, and any inline `style` that
 * contains `expression(` or `url(javascript:`.
 */

// ──────────────────────────────────────────────────────────────────────────
// 1. DOMPurify lazy resolver
// ──────────────────────────────────────────────────────────────────────────
let _purifier = null;
let _purifierResolved = false;

/**
 * Locate DOMPurify in the page. Tries (in order):
 *   1. ESM import (when bundled by Vite)
 *   2. Global `window.DOMPurify` (CDN/UMD)
 *   3. null → fallback sanitizer used
 */
async function resolvePurifier() {
  if (_purifierResolved) return _purifier;
  _purifierResolved = true;

  // Browser global (Cordova legacy / standalone APK)
  if (typeof window !== 'undefined' && window.DOMPurify) {
    _purifier = window.DOMPurify;
    return _purifier;
  }

  // Bundled ESM (Vite build) — dynamic import so APK build doesn't break
  try {
    const mod = await import(/* @vite-ignore */ 'dompurify');
    _purifier = mod.default || mod;
    if (typeof window !== 'undefined') window.DOMPurify = _purifier;
    return _purifier;
  } catch {
    // Module not present — fall back to built-in sanitizer
    _purifier = null;
    return null;
  }
}

// Eagerly kick off resolution (non-blocking)
if (typeof window !== 'undefined') {
  resolvePurifier().catch(() => {
    /* swallow — fallback path is sync */
  });
}

/**
 * Test-only escape hatch: force the fallback sanitizer (or any other
 * implementation) for the rest of the process. Used by safe-dom.test.js
 * to deterministically exercise the strict fallback path; production
 * code should never call this.
 *
 * @internal
 * @param {object | null} purifier
 */
export function _setPurifier(purifier) {
  _purifier = purifier;
  _purifierResolved = true;
}

// ──────────────────────────────────────────────────────────────────────────
// 2. Fallback sanitizer (used until DOMPurify resolves)
// ──────────────────────────────────────────────────────────────────────────

/** Tags that are always stripped (script-execution vectors). */
const FORBIDDEN_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'LINK',
  'META',
  'BASE',
  'FORM',
]);

/** Attribute prefixes that are always stripped. */
const FORBIDDEN_ATTR_PREFIXES = ['on']; // onclick, onerror, onload, ...

/** URL-bearing attributes that need protocol checks. */
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'srcset']);

/** Protocols that may appear before the path component. */
const SAFE_PROTOCOLS = /^(?:https?:|mailto:|tel:|data:image\/|blob:)/i;

function isSafeUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed === '') return true;
  // Reject control characters (smuggling vector for `javascript:`).
  if (/[\u0000-\u001f]/.test(trimmed)) return false;
  // A URL is path-relative when it has no protocol delimiter, or
  // when the first '/' precedes the first ':'. Path-relative URLs
  // are always safe; we never need to check a protocol allowlist.
  const colon = trimmed.indexOf(':');
  if (colon === -1) return true; // bare path / fragment / query
  const slash = trimmed.indexOf('/');
  if (slash !== -1 && slash < colon) return true; // path-relative
  // It's a protocol URL — must be in the allowlist.
  return SAFE_PROTOCOLS.test(trimmed);
}

function fallbackSanitize(html) {
  if (typeof html !== 'string') html = String(html ?? '');
  const tmpl = document.createElement('template');
  tmpl.innerHTML = html;

  const walker = document.createTreeWalker(tmpl.content, NodeFilter.SHOW_ELEMENT, null);
  const toRemove = [];

  let node = walker.nextNode();
  while (node) {
    if (FORBIDDEN_TAGS.has(node.tagName)) {
      toRemove.push(node);
      node = walker.nextNode();
      continue;
    }

    // Strip forbidden attributes
    const attrs = Array.from(node.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();

      // Event handlers
      if (FORBIDDEN_ATTR_PREFIXES.some((p) => name.startsWith(p))) {
        node.removeAttribute(attr.name);
        continue;
      }

      // URL attributes
      if (URL_ATTRS.has(name) && !isSafeUrl(attr.value)) {
        node.removeAttribute(attr.name);
        continue;
      }

      // Inline style with CSS expressions or javascript URLs
      if (name === 'style' && /expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i.test(attr.value)) {
        node.removeAttribute(attr.name);
        continue;
      }
    }

    node = walker.nextNode();
  }

  for (const el of toRemove) el.remove();
  return tmpl.innerHTML;
}

// ──────────────────────────────────────────────────────────────────────────
// 3. Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Sanitize an HTML string.
 * Synchronous: uses DOMPurify if already resolved, else the fallback.
 *
 * @param {string} html
 * @param {object} [opts] - DOMPurify options (passed through when available)
 * @returns {string}
 */
export function sanitize(html, opts) {
  if (_purifier && typeof _purifier.sanitize === 'function') {
    return _purifier.sanitize(html, opts);
  }
  return fallbackSanitize(html);
}

/**
 * Replace the children of `el` with sanitized HTML.
 * The single sanctioned replacement for `el.innerHTML = html`.
 *
 * @param {Element} el
 * @param {string} html
 * @param {object} [opts]
 */
export function setSafeHTML(el, html, opts) {
  if (!el || typeof el.innerHTML === 'undefined') return;
  // eslint-disable-next-line no-restricted-properties
  el.innerHTML = sanitize(html, opts);
}

/**
 * Append sanitized HTML to `el` (instead of replacing).
 *
 * @param {Element} el
 * @param {string} html
 * @param {object} [opts]
 */
export function appendSafeHTML(el, html, opts) {
  if (!el) return;
  const tmpl = document.createElement('template');
  // eslint-disable-next-line no-restricted-properties
  tmpl.innerHTML = sanitize(html, opts);
  el.appendChild(tmpl.content);
}

/**
 * Build a DocumentFragment from sanitized HTML.
 *
 * @param {string} html
 * @param {object} [opts]
 * @returns {DocumentFragment}
 */
export function safeFragment(html, opts) {
  const tmpl = document.createElement('template');
  // eslint-disable-next-line no-restricted-properties
  tmpl.innerHTML = sanitize(html, opts);
  return tmpl.content;
}

/**
 * HTML-escape a plain string (for use inside template literals when you
 * want to interpolate user data without sanitizing the whole template).
 *
 * @param {*} str
 * @returns {string}
 */
export function escape(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ──────────────────────────────────────────────────────────────────────────
// 4. Global exposure for legacy non-module scripts
// ──────────────────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.SafeDOM = Object.freeze({
    sanitize,
    setSafeHTML,
    appendSafeHTML,
    safeFragment,
    escape,
  });
}
