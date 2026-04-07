/**
 * Smoke tests — verify each entry HTML loads, the security helpers
 * initialize, and the basic a11y plumbing is in place.
 *
 * Stage 5 of the modernization plan. These intentionally do not
 * assert anything about specific UI text, screenshots, or behaviors
 * of the legacy app — they're guard rails against regressions in
 * the scaffolding we added in stages 0–4.
 *
 * The webserver (see playwright.config.ts) serves the *raw*
 * `www-src/` directory, mirroring the standalone-APK runtime. Tests
 * therefore must not depend on Vite-bundled artifacts.
 *
 * Console-error noise from the legacy app is unavoidable here (the
 * legacy bundles call into PI Web API endpoints that aren't
 * reachable from the test harness). The smoke tests therefore *do
 * not* assert on the absence of all console errors. Instead, they
 * assert that no error from OUR security/UX scaffolding fires —
 * any message that mentions SafeDOM, SafeExpr, theme, a11y, or
 * pivision is treated as a regression.
 */

import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Patterns whose presence in a console error indicates that
 * something *we own* broke. Anything else is treated as legacy
 * noise and ignored.
 */
const SCAFFOLD_ERROR_PATTERNS = [
  /SafeDOM/,
  /SafeExpr/,
  /PIVisionTheme/,
  /PIVisionA11y/,
  /PIVisionTransitions/,
  /SymbolLoader/,
  /security\/safe-/,
  /ux\/(theme|a11y|transitions)/,
  /perf\/symbol-loader/,
];

function isScaffoldError(text: string): boolean {
  return SCAFFOLD_ERROR_PATTERNS.some((rx) => rx.test(text));
}

/** Capture only errors that look like they originate from our code. */
function collectScaffoldErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isScaffoldError(text)) errors.push(text);
  });
  page.on('pageerror', (err) => {
    if (isScaffoldError(err.message) || isScaffoldError(err.stack || '')) {
      errors.push(err.message);
    }
  });
  return errors;
}

/**
 * CSP violation collector. Installs a `securitypolicyviolation`
 * listener in the page via `addInitScript` so it runs before any
 * app code, and exposes the collected violations through a
 * window-global that the test reads after load.
 *
 * This is the stage-7 regression guard for the `'unsafe-eval'`
 * removal (commit 41a664e). Any future commit that sneaks
 * `new Function(...)`, an inline on* handler, a `data:` script
 * src, or a missing directive back into production will fire
 * a `securitypolicyviolation` event the moment the page loads,
 * and this collector will fail the test with the exact directive
 * and blocked URI.
 *
 * We treat this listener as an isolated oracle — it has no
 * allowlist. Any violation is a test failure.
 */
async function installCspViolationCollector(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Expose the collection through a window-global the test
    // reads via page.evaluate() after load.
    interface CspViolation {
      directive: string;
      blockedURI: string;
      sourceFile: string;
      lineNumber: number;
      sample: string;
    }
    (window as unknown as { __cspViolations: CspViolation[] }).__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e: SecurityPolicyViolationEvent) => {
      (window as unknown as { __cspViolations: CspViolation[] }).__cspViolations.push({
        directive: e.violatedDirective,
        blockedURI: e.blockedURI,
        sourceFile: e.sourceFile,
        lineNumber: e.lineNumber,
        sample: e.sample || '',
      });
    });
  });
}

/** Pull the collected violations out of the page. */
async function getCspViolations(
  page: Page
): Promise<Array<{ directive: string; blockedURI: string; sourceFile: string; sample: string }>> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __cspViolations: Array<{
            directive: string;
            blockedURI: string;
            sourceFile: string;
            sample: string;
          }>;
        }
      ).__cspViolations || []
  );
}

/** Format violations into a human-readable block for assertion failures. */
function formatCspViolations(
  violations: Array<{ directive: string; blockedURI: string; sourceFile: string; sample: string }>
): string {
  return violations
    .map(
      (v, i) =>
        `  ${i + 1}. ${v.directive} blocked "${v.blockedURI}"` +
        (v.sourceFile ? `\n     at ${v.sourceFile}` : '') +
        (v.sample ? `\n     sample: ${v.sample}` : '')
    )
    .join('\n');
}

// ──────────────────────────────────────────────────────────────────────────
// mobile entry (index.html)
// ──────────────────────────────────────────────────────────────────────────

test.describe('mobile entry (index.html)', () => {
  test('parses and reaches DOMContentLoaded', async ({ page }) => {
    const errors = collectScaffoldErrors(page);
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('CSP: no securitypolicyviolation events fire during load', async ({ page }) => {
    await installCspViolationCollector(page);
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    // Give late-arriving violations a beat to register
    await page.waitForTimeout(300);
    const violations = await getCspViolations(page);
    expect(violations, formatCspViolations(violations)).toEqual([]);
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

  test('SafeDOM is exposed on window with the documented API', async ({ page }) => {
    await page.goto('/index.html');
    const exposed = await page.evaluate(() => ({
      setSafeHTML: typeof (window as any).SafeDOM?.setSafeHTML === 'function',
      sanitize: typeof (window as any).SafeDOM?.sanitize === 'function',
      escape: typeof (window as any).SafeDOM?.escape === 'function',
    }));
    expect(exposed.setSafeHTML).toBe(true);
    expect(exposed.sanitize).toBe(true);
    expect(exposed.escape).toBe(true);
  });

  test('SafeDOM strips script tags', async ({ page }) => {
    await page.goto('/index.html');
    const result = await page.evaluate(() => {
      const el = document.createElement('div');
      (window as any).SafeDOM.setSafeHTML(el, '<p>ok</p><script>alert(1)</script>');
      return {
        hasScript: !!el.querySelector('script'),
        hasP: !!el.querySelector('p'),
      };
    });
    expect(result.hasScript).toBe(false);
    expect(result.hasP).toBe(true);
  });

  test('skip link is injected after DOMContentLoaded', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => !!document.querySelector('.pi-skip-link'));
    const link = page.locator('.pi-skip-link');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', /^#/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// desktop entry (desktop.html)
// ──────────────────────────────────────────────────────────────────────────

test.describe('desktop entry (desktop.html)', () => {
  test('parses and reaches DOMContentLoaded', async ({ page }) => {
    const errors = collectScaffoldErrors(page);
    await page.goto('/desktop.html');
    await page.waitForLoadState('domcontentloaded');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('CSP: no securitypolicyviolation events fire during load', async ({ page }) => {
    await installCspViolationCollector(page);
    await page.goto('/desktop.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);
    const violations = await getCspViolations(page);
    expect(violations, formatCspViolations(violations)).toEqual([]);
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

// ──────────────────────────────────────────────────────────────────────────
// qa entry (qa/qa-app.html)
// ──────────────────────────────────────────────────────────────────────────

test.describe('qa entry (qa/qa-app.html)', () => {
  test('parses and reaches DOMContentLoaded', async ({ page }) => {
    const errors = collectScaffoldErrors(page);
    await page.goto('/qa/qa-app.html');
    await page.waitForLoadState('domcontentloaded');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('CSP: no securitypolicyviolation events fire during load', async ({ page }) => {
    await installCspViolationCollector(page);
    await page.goto('/qa/qa-app.html');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);
    const violations = await getCspViolations(page);
    expect(violations, formatCspViolations(violations)).toEqual([]);
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

// ──────────────────────────────────────────────────────────────────────────
// emulator entry (emulator/index.html) — most important CSP check because
// this is where the Angular-shim `_evalExpr` runs at runtime. If
// `'unsafe-eval'` is missing *and* some expression escapes SafeExpr, the
// legacy `new Function` fallback will fire a CSP violation right here.
// ──────────────────────────────────────────────────────────────────────────

test.describe('emulator entry (emulator/index.html)', () => {
  test('CSP: no securitypolicyviolation events fire during load', async ({ page }) => {
    await installCspViolationCollector(page);
    await page.goto('/emulator/index.html');
    await page.waitForLoadState('domcontentloaded');
    // Emulator boots asynchronously — wait longer so shim
    // initialization + first $digest cycle have a chance to fire
    // any latent CSP violation.
    await page.waitForTimeout(1000);
    const violations = await getCspViolations(page);
    expect(violations, formatCspViolations(violations)).toEqual([]);
  });

  test('CSP meta tag no longer permits unsafe-eval', async ({ page }) => {
    await page.goto('/emulator/index.html');
    const csp = await page.evaluate(() => {
      const meta = document.querySelector(
        'meta[http-equiv="Content-Security-Policy"]'
      ) as HTMLMetaElement | null;
      return meta?.content || '';
    });
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test('PIVISION_ALLOW_UNSAFE_EVAL is explicitly set to false', async ({ page }) => {
    await page.goto('/emulator/index.html');
    const flag = await page.evaluate(
      () => (window as unknown as { PIVISION_ALLOW_UNSAFE_EVAL: unknown }).PIVISION_ALLOW_UNSAFE_EVAL
    );
    expect(flag).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// SafeExpr (loaded fresh via dynamic import — does not depend on the
// page having SafeExpr already wired in)
// ──────────────────────────────────────────────────────────────────────────

test.describe('SafeExpr (in-page eval replacement)', () => {
  test('evaluates safe Angular-style expressions', async ({ page }) => {
    await page.goto('/index.html');
    const result = await page.evaluate(async () => {
      // Resolve relative to the page URL — works against the raw
      // www-src tree the static webserver mounts.
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
