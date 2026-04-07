/**
 * PIVISION Mobile — main entry (mobile / index.html)
 *
 * Stage 2 ESM facade. This module is the *new* entry point for the
 * mobile shell. It is intentionally minimal: its job today is to
 *   1. Pull in the security helpers eagerly (SafeDOM + SafeExpr).
 *   2. Lazy-load the giant legacy bundles (mobile-sync, mobile-app)
 *      via dynamic `import()` so Vite can code-split them.
 *
 * Once the legacy `js/mobile-app.js` is broken into proper modules in
 * stage 3, the dynamic imports below will be replaced by static imports
 * of the split modules.
 *
 * The legacy `<script src="js/mobile-app.js">` tag in `index.html` is
 * being kept for the standalone-APK code path; when Vite builds, it is
 * tree-shaken because the entry HTML can be bundled to use only this
 * module.
 */

import './security/safe-dom.js';
import './security/safe-expr.js';

// Paths are stored in a `string[]` (rather than a literal-typed
// `as const` tuple) so TypeScript treats `import(p)` as `Promise<any>`
// and does not try to statically resolve the legacy IIFE bundles
// (which have no ES exports).
const MOBILE_BUNDLES: string[] = ['./mobile-sync.js', './mobile-app.js'];

async function bootMobile(): Promise<void> {
  // Lazy-load the heavy legacy bundles. These dynamic imports become
  // separate chunks in the Vite build.
  await Promise.all(MOBILE_BUNDLES.map((p) => import(/* @vite-ignore */ p)));

  // Notify any listeners that the shell is ready.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pivision:ready'));
  }
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void bootMobile();
    });
  } else {
    void bootMobile();
  }
}

export { bootMobile };
