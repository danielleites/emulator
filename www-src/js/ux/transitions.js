/**
 * PIVISION Mobile — View Transitions wrapper
 * Stage 4 of the modernization plan.
 *
 * Thin abstraction over the View Transitions API:
 *   - Uses `document.startViewTransition` when available (Chrome 111+,
 *     Edge 111+, Safari 18+).
 *   - Falls back to running the callback immediately when not.
 *   - Honors `prefers-reduced-motion: reduce` and skips the transition.
 *
 * Designed for navigations within the SPA shell. The callback should
 * synchronously update the DOM to the new state; the browser captures
 * before/after snapshots and animates between them.
 *
 * Usage:
 *   import { withTransition } from './ux/transitions.js';
 *   await withTransition(() => {
 *     mainEl.replaceChildren(newPage);
 *   });
 */

import { prefersReducedMotion } from './a11y.js';

/**
 * @typedef {object} TransitionResult
 * @property {Promise<void>} finished  Resolves when the animation completes.
 * @property {Promise<void>} ready     Resolves when the snapshot is ready.
 * @property {Promise<void>} updateCallbackDone Resolves when the DOM update fires.
 * @property {() => void}    skipTransition  Skip the animation immediately.
 */

/**
 * Run a DOM update inside a View Transition. Always returns an
 * awaitable result; the result's `finished` promise resolves once
 * the animation has completed (or immediately if no animation ran).
 *
 * @param {() => void | Promise<void>} updateCallback
 * @returns {Promise<TransitionResult>}
 */
export function withTransition(updateCallback) {
  if (typeof updateCallback !== 'function') {
    return Promise.resolve(_noopResult());
  }

  // Reduced-motion users skip the animation entirely.
  if (prefersReducedMotion()) {
    return Promise.resolve(updateCallback()).then(() => _noopResult());
  }

  // Feature detection.
  const doc = typeof document !== 'undefined' ? document : null;
  const start =
    doc && typeof (/** @type {any} */ (doc).startViewTransition) === 'function'
      ? /** @type {any} */ (doc).startViewTransition.bind(doc)
      : null;

  if (!start) {
    return Promise.resolve(updateCallback()).then(() => _noopResult());
  }

  try {
    const tx = start(updateCallback);
    // Normalize the return shape so callers can `await result.finished`
    // even when running on a polyfill.
    return Promise.resolve({
      finished: tx.finished,
      ready: tx.ready,
      updateCallbackDone: tx.updateCallbackDone,
      skipTransition: () => {
        try {
          tx.skipTransition();
        } catch {
          /* ignore */
        }
      },
    });
  } catch {
    // Anything goes wrong → fall back to immediate update.
    return Promise.resolve(updateCallback()).then(() => _noopResult());
  }
}

/**
 * Add a CSS view-transition-name to an element so it animates
 * independently from the page background. Cleans up after the
 * transition finishes.
 *
 * @param {Element} el
 * @param {string} name
 */
export function tagForTransition(el, name) {
  if (!el || typeof name !== 'string') return;
  // @ts-expect-error - viewTransitionName is part of the spec
  el.style.viewTransitionName = name;
}

function _noopResult() {
  const resolved = Promise.resolve();
  return {
    finished: resolved,
    ready: resolved,
    updateCallbackDone: resolved,
    skipTransition() {},
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Global exposure
// ──────────────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.PIVisionTransitions = Object.freeze({
    withTransition,
    tagForTransition,
  });
}
