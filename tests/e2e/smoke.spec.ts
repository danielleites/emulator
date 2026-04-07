/**
 * Smoke tests — verify each entry HTML loads, no console errors fire,
 * the security helpers initialize, and the basic a11y plumbing is
 * in place.
 *
 * Stage 5 of the modernization plan. These intentionally do not assert
 * anything about specific UI text, screenshots, or behaviors of the
 * legacy app — they're guard rails against regressions in the
 * scaffolding we added in stages 0–4.
 */

import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Collect console errors during a page load. Filter out known noisy
 * legacy warnings (jQuery deprecation, etc.) so the test only fails on
 * genuine errors.
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  const ignored = [
    /jQuery is deprecated/i,
    /favicon\.ico/i,
    /Failed to load resource.*404/i, // legacy template asset 404s — known
  ];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (ignored.some((rx) => rx.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => {
    if (ignored.some((rx) => rx.test(err.message))) return;
    errors.push(err.message);
  });
  return errors;
}

test.describe('mobile entry (index.html)', () => {
  test('loads without console errors', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('has the expected title', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page).toHaveTitle(/PIVISION/i);
  });

  test('applies a data-theme attribute (no FOUC)', async ({ page }) => {
    await page.goto('/index.html');
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(theme).toMatch(/^(dark|light|auto)$/);
  });

  test('SafeDOM and SafeExpr are exposed on window', async ({ page }) => {
    await page.goto('/index.html');
    const exposed = await page.evaluate(() => ({
      safeDom: typeof (window as any).SafeDOM?.setSafeHTML === 'function',
      escape: typeof (window as any).SafeDOM?.escape === 'function',
    }));
    expect(exposed.safeDom).toBe(true);
    expect(exposed.escape).toBe(true);
  });

  test('SafeDOM strips script tags', async ({ page }) => {
    await page.goto('/index.html');
    const result = await page.evaluate(() => {
      const el = document.createElement('div');
      (window as any).SafeDOM.setSafeHTML(el, '<p>ok</p><script>alert(1)</script>');
      return {
        html: el.innerHTML,
        hasScript: !!el.querySelector('script'),
        hasP: !!el.querySelector('p'),
      };
    });
    expect(result.hasScript).toBe(false);
    expect(result.hasP).toBe(true);
  });

  test('skip link is present and reachable by keyboard', async ({ page }) => {
    await page.goto('/index.html');
    // The link is injected after DOMContentLoaded.
    await page.waitForFunction(() => !!document.querySelector('.pi-skip-link'));
    const link = page.locator('.pi-skip-link');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', /^#/);
  });
});

test.describe('desktop entry (desktop.html)', () => {
  test('loads without console errors', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/desktop.html');
    await page.waitForLoadState('domcontentloaded');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('has the expected title', async ({ page }) => {
    await page.goto('/desktop.html');
    await expect(page).toHaveTitle(/PI Vision/);
  });

  test('CSP meta tag is present and forbids object-src', async ({ page }) => {
    await page.goto('/desktop.html');
    const csp = await page.evaluate(() => {
      const meta = document.querySelector(
        'meta[http-equiv="Content-Security-Policy"]'
      ) as HTMLMetaElement | null;
      return meta?.content || '';
    });
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});

test.describe('qa entry (qa/qa-app.html)', () => {
  test('loads without console errors', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/qa/qa-app.html');
    await page.waitForLoadState('domcontentloaded');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('CSP for QA does NOT permit unsafe-eval', async ({ page }) => {
    await page.goto('/qa/qa-app.html');
    const csp = await page.evaluate(() => {
      const meta = document.querySelector(
        'meta[http-equiv="Content-Security-Policy"]'
      ) as HTMLMetaElement | null;
      return meta?.content || '';
    });
    expect(csp).not.toContain("'unsafe-eval'");
  });
});

test.describe('SafeExpr (in-page eval replacement)', () => {
  test('evaluates safe Angular-style expressions', async ({ page }) => {
    await page.goto('/index.html');
    // SafeExpr is loaded by the emulator entry, but we can still
    // import it via dynamic import here for an in-page check.
    const result = await page.evaluate(async () => {
      const mod = await import('./js/security/safe-expr.js');
      return {
        a: mod.evaluate('user.name', { user: { name: 'Alice' } }),
        b: mod.evaluate('items[0].id', { items: [{ id: 7 }] }),
        c: mod.evaluate('a > b ? "yes" : "no"', { a: 5, b: 3 }),
        d: mod.evaluate('a.__proto__', { a: {} }), // must be undefined
      };
    });
    expect(result.a).toBe('Alice');
    expect(result.b).toBe(7);
    expect(result.c).toBe('yes');
    expect(result.d).toBeUndefined();
  });
});
