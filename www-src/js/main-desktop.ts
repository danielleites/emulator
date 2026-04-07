/**
 * PIVISION Desktop — main entry (desktop.html)
 *
 * Stage 2 ESM facade. Mirrors `main-mobile.ts` but for the desktop
 * shell, which loads many more legacy modules. The order below
 * matches the original `<script>` order in `desktop.html` so that
 * runtime-time globals are populated in the same sequence.
 */

import './security/safe-dom.js';
import './security/safe-expr.js';

const DESKTOP_BUNDLES = [
  './pi-connector.js',
  './visual-builder.js',
  './af-data-layer.js',
  './af-data-layer-extensions.js',
  './af-browser-ui.js',
  './pi-webapi-mock.js',
  './pi-simulation-mode.js',
  './pi-simulation-validator.js',
  './pi-simulation-enhancements.js',
  './pi-adapter.js',
  './pi-live-readiness.js',
  './collab-ui.js',
  './ux-advanced.js',
  './i18n.js',
  './accessibility.js',
  './ai-agent-panel.js',
  './ai-chat.js',
] as const;

async function bootDesktop(): Promise<void> {
  // Sequential to preserve legacy global-init order.
  for (const path of DESKTOP_BUNDLES) {
    try {
      await import(/* @vite-ignore */ path);
    } catch (err) {
      // Non-fatal — log and continue so a single broken module
      // doesn't take down the whole shell.
      // eslint-disable-next-line no-console
      console.warn('[pivision] failed to load', path, err);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pivision:ready'));
  }
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void bootDesktop();
    });
  } else {
    void bootDesktop();
  }
}

export { bootDesktop };
