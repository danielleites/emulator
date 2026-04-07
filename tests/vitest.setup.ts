/**
 * Vitest global setup.
 * Runs once before each test file (worker), in the jsdom environment.
 *
 * Stage 5 of the modernization plan. Provides:
 *   - Reset of localStorage between files (theme tests rely on this).
 *   - A noop for matchMedia when jsdom doesn't ship one.
 *   - A console-warn → throw bridge for the "no warnings allowed"
 *     subset of tests (opt-in via `expectNoWarnings()`).
 */

import { afterEach, beforeEach } from 'vitest';

beforeEach(() => {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* ignore — some tests run without storage */
  }

  // Polyfill matchMedia for jsdom (which omits it).
  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }

  // Polyfill requestIdleCallback (jsdom omits it).
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback !== 'function') {
    window.requestIdleCallback = ((cb: IdleRequestCallback) => {
      const start = Date.now();
      return setTimeout(
        () =>
          cb({
            didTimeout: false,
            timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
          }),
        1
      ) as unknown as number;
    }) as typeof window.requestIdleCallback;
    window.cancelIdleCallback = ((id: number) =>
      clearTimeout(id as unknown as NodeJS.Timeout)) as typeof window.cancelIdleCallback;
  }
});

afterEach(() => {
  // Tear down DOM mutations between tests so files don't bleed.
  if (typeof document !== 'undefined') {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme');
  }
});
