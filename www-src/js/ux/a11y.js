/**
 * PIVISION Mobile — Accessibility utilities
 * Stage 4 of the modernization plan.
 *
 * Small, dependency-free helpers that are easy to opt into:
 *
 *   - injectSkipLink()    — adds a "skip to main content" link as
 *                           the first focusable element on the page.
 *   - createFocusTrap(el) — locks Tab/Shift+Tab inside a container
 *                           (for modals); returns a release function.
 *   - announce(msg)       — speaks a message via an ARIA live region.
 *   - onArrowKeyNav(...)  — wires arrow keys onto a list/grid of items.
 *   - prefersReducedMotion() — true if the user has reduced motion on.
 */

// ──────────────────────────────────────────────────────────────────────────
// Skip link
// ──────────────────────────────────────────────────────────────────────────

/**
 * Inject a "skip to main content" link as the first child of <body>.
 * Idempotent — safe to call multiple times. Does nothing if there is
 * no element matching `targetSelector`.
 *
 * @param {object} [opts]
 * @param {string} [opts.targetSelector='#main, main, [role="main"]']
 * @param {string} [opts.label='דלג לתוכן הראשי']
 * @returns {HTMLAnchorElement | null}
 */
export function injectSkipLink(opts = {}) {
  if (typeof document === 'undefined') return null;
  if (document.querySelector('.pi-skip-link')) {
    return /** @type {HTMLAnchorElement} */ (document.querySelector('.pi-skip-link'));
  }

  const targetSelector = opts.targetSelector || '#main, main, [role="main"]';
  const label = opts.label || 'דלג לתוכן הראשי';
  const target = document.querySelector(targetSelector);
  if (!target) return null;

  // Ensure the target is focusable when reached.
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  if (!target.id) target.id = 'pi-main';

  const link = document.createElement('a');
  link.className = 'pi-skip-link';
  link.href = '#' + target.id;
  link.textContent = label;
  document.body.insertBefore(link, document.body.firstChild);
  return link;
}

// ──────────────────────────────────────────────────────────────────────────
// Focus trap (for modals)
// ──────────────────────────────────────────────────────────────────────────

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
  'iframe',
].join(',');

/**
 * Returns the visible focusable elements inside a container.
 * @param {HTMLElement} container
 * @returns {HTMLElement[]}
 */
function focusables(container) {
  /** @type {HTMLElement[]} */
  const nodes = Array.from(container.querySelectorAll(FOCUSABLE));
  return nodes.filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    // Skip elements with display:none or visibility:hidden
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  });
}

/**
 * Lock keyboard focus inside `container`. Tab cycles forward,
 * Shift+Tab cycles back, Escape calls `onEscape` (if provided).
 * Returns a `release()` function that removes the trap and restores
 * focus to the previously-focused element.
 *
 * @param {HTMLElement} container
 * @param {object} [opts]
 * @param {() => void} [opts.onEscape]
 * @returns {() => void}
 */
export function createFocusTrap(container, opts = {}) {
  if (!container) return () => {};
  const previouslyFocused = /** @type {HTMLElement | null} */ (document.activeElement);

  // Move focus into the container.
  const initial = focusables(container)[0] || container;
  if (initial && typeof initial.focus === 'function') {
    if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
    initial.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape' && typeof opts.onEscape === 'function') {
      e.stopPropagation();
      opts.onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables(container);
    if (list.length === 0) {
      e.preventDefault();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !container.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !container.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  document.addEventListener('keydown', onKey, true);

  return function release() {
    document.removeEventListener('keydown', onKey, true);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try {
        previouslyFocused.focus();
      } catch {
        /* ignore */
      }
    }
  };
}

// ──────────────────────────────────────────────────────────────────────────
// ARIA live region (announce)
// ──────────────────────────────────────────────────────────────────────────

let _liveRegion = null;
let _liveRegionAssertive = null;

function ensureLiveRegion(assertive) {
  if (typeof document === 'undefined') return null;
  const ref = assertive ? '_liveRegionAssertive' : '_liveRegion';
  let region = assertive ? _liveRegionAssertive : _liveRegion;
  if (region && region.isConnected) return region;
  region = document.createElement('div');
  region.className = 'pi-sr-only';
  region.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
  region.setAttribute('aria-atomic', 'true');
  region.setAttribute('role', 'status');
  document.body.appendChild(region);
  if (assertive) _liveRegionAssertive = region;
  else _liveRegion = region;
  // Avoid the unused-variable lint without changing behavior.
  void ref;
  return region;
}

/**
 * Announce a message to screen readers via an ARIA live region.
 * Use `assertive: true` for urgent alerts (errors, validation),
 * default polite for status updates.
 *
 * @param {string} message
 * @param {object} [opts]
 * @param {boolean} [opts.assertive=false]
 */
export function announce(message, opts = {}) {
  if (typeof message !== 'string' || message === '') return;
  const region = ensureLiveRegion(!!opts.assertive);
  if (!region) return;
  // Clear and re-set so the same message announces again.
  region.textContent = '';
  // requestAnimationFrame ensures the SR notices the change.
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Arrow-key navigation (for lists / grids / tabs)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Wire arrow-key navigation onto a container. Items are queried
 * fresh on each keystroke so dynamic lists work.
 *
 * @param {HTMLElement} container
 * @param {object} [opts]
 * @param {string} [opts.itemSelector='[role="option"], [role="tab"], [role="menuitem"], [data-arrow-nav-item]']
 * @param {'horizontal' | 'vertical' | 'both'} [opts.orientation='vertical']
 * @param {boolean} [opts.wrap=true]
 * @returns {() => void} release
 */
export function onArrowKeyNav(container, opts = {}) {
  if (!container) return () => {};
  const sel =
    opts.itemSelector ||
    '[role="option"], [role="tab"], [role="menuitem"], [data-arrow-nav-item]';
  const orientation = opts.orientation || 'vertical';
  const wrap = opts.wrap !== false;

  function items() {
    return /** @type {HTMLElement[]} */ (Array.from(container.querySelectorAll(sel)));
  }

  function onKey(e) {
    const list = items();
    if (list.length === 0) return;
    const idx = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    let next = idx;
    const isVert = orientation === 'vertical' || orientation === 'both';
    const isHoriz = orientation === 'horizontal' || orientation === 'both';

    if (isVert && e.key === 'ArrowDown') next = idx + 1;
    else if (isVert && e.key === 'ArrowUp') next = idx - 1;
    else if (isHoriz && e.key === 'ArrowRight') next = idx + 1;
    else if (isHoriz && e.key === 'ArrowLeft') next = idx - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else return;

    e.preventDefault();
    if (next < 0) next = wrap ? list.length - 1 : 0;
    if (next >= list.length) next = wrap ? 0 : list.length - 1;
    const target = list[next];
    if (target && typeof target.focus === 'function') target.focus();
  }

  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}

// ──────────────────────────────────────────────────────────────────────────
// Reduced motion
// ──────────────────────────────────────────────────────────────────────────

/**
 * @returns {boolean} true if the user has requested reduced motion.
 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Reset (for tests)
// ──────────────────────────────────────────────────────────────────────────

export function _reset() {
  _liveRegion = null;
  _liveRegionAssertive = null;
}

// ──────────────────────────────────────────────────────────────────────────
// Global exposure
// ──────────────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.PIVisionA11y = Object.freeze({
    injectSkipLink,
    createFocusTrap,
    announce,
    onArrowKeyNav,
    prefersReducedMotion,
  });
}
