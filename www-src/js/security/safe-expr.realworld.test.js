/**
 * Real-world SafeExpr coverage test.
 *
 * Purpose — close the gap between the 75 hand-written unit tests
 * and actual production usage. The stage-7 CSP change
 * (commit 41a664e) drops `'unsafe-eval'` and routes every
 * Angular-shim `_evalExpr` call through `window.SafeExpr.evaluate`.
 * Before shipping that to a real device, this test mass-validates
 * the SafeExpr parser against every `ng-*` attribute value found
 * in the emulator + symbol HTML templates.
 *
 * What it does:
 *   1. Walks `www-src/emulator/` and `www-src/symbols/` recursively
 *      for `*.html` files (plus the stand-alone entry HTMLs).
 *   2. Extracts every `ng-*="..."` attribute value.
 *   3. Normalizes `ng-repeat="item in items track by ..."` the same
 *      way `emu-shims._compileElement` does — emits just the
 *      collection identifier part, because that's what reaches
 *      `_evalExpr` at runtime.
 *   4. Feeds each distinct expression through `_parseForTest`
 *      (a test-only oracle in safe-expr.js that returns the AST or
 *      null on parse failure).
 *   5. Asserts that every expression parses. Any failure fails the
 *      test with the offending expression + file path, so the fix
 *      is to either extend the parser or quote-fix the template.
 *
 * Running locally:
 *   npm run test -- www-src/js/security/safe-expr.realworld.test.js
 */

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { _parseForTest, evaluate } from './safe-expr.js';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ──────────────────────────────────────────────────────────────────────────
// Filesystem walk (sync, fast — HTML tree is tiny)
// ──────────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
// Relative path from this test file (www-src/js/security/) to www-src/
const WWW_SRC = join(__dirname, '..', '..');

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && p.endsWith('.html')) out.push(p);
  }
  return out;
}

const htmlFiles = [
  ...walk(join(WWW_SRC, 'emulator'), []),
  ...walk(join(WWW_SRC, 'symbols'), []),
];

// ──────────────────────────────────────────────────────────────────────────
// Expression extraction
// ──────────────────────────────────────────────────────────────────────────

/**
 * The Angular directives that take an expression as their attribute
 * value. We only audit these (ng-click etc. are deliberately out of
 * scope for the _evalExpr path — the shim handles them differently).
 */
const EXPR_ATTRS = [
  'ng-if',
  'ng-show',
  'ng-hide',
  'ng-bind',
  'ng-bind-html',
  'ng-class',
  'ng-style',
  'ng-src',
  'ng-href',
  'ng-checked',
  'ng-disabled',
  'ng-model',
  'ng-repeat',
];

// Match any of the above directives followed by ="..." or '...'
// Double/single quotes are handled separately because HTML allows both.
const DIRECTIVES_RE = new RegExp(
  '(' + EXPR_ATTRS.join('|') + ')\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')',
  'g'
);

/**
 * Normalize an ng-repeat expression to what `_evalExpr` actually
 * receives at runtime. emu-shims.js parses
 *   "item in items track by expr"
 * itself and calls `_evalExpr(collectionExpr, scope)` with just the
 * trimmed collection expression. This function mirrors that so the
 * audit reflects real runtime behavior.
 *
 * @param {string} raw
 * @returns {string | null}
 */
function normalizeRepeat(raw) {
  // Match "item in items (track by expr)?"
  const m = raw.match(/^\s*[\w$]+\s+in\s+(.+?)(?:\s+track\s+by\s+.*)?\s*$/);
  if (!m) return null;
  return m[1].trim();
}

/** @type {Map<string, { directive: string, file: string }[]>} */
const expressionIndex = new Map();

for (const file of htmlFiles) {
  let src;
  try {
    src = readFileSync(file, 'utf-8');
  } catch {
    continue;
  }
  let m;
  DIRECTIVES_RE.lastIndex = 0;
  while ((m = DIRECTIVES_RE.exec(src)) !== null) {
    const directive = m[1];
    const value = m[2] !== undefined ? m[2] : m[3];
    if (!value || !value.trim()) continue;

    let expr = value.trim();
    if (directive === 'ng-repeat') {
      const norm = normalizeRepeat(expr);
      if (norm === null) continue; // malformed — legacy code ignores
      expr = norm;
    }

    if (!expressionIndex.has(expr)) expressionIndex.set(expr, []);
    expressionIndex
      .get(expr)
      // eslint-disable-next-line no-restricted-properties
      .push({ directive, file: file.slice(WWW_SRC.length + 1) });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────

describe('SafeExpr real-world coverage', () => {
  it('discovers expressions from at least 100 HTML files', () => {
    expect(htmlFiles.length).toBeGreaterThan(100);
  });

  it('extracts at least 1000 distinct expressions', () => {
    expect(expressionIndex.size).toBeGreaterThan(1000);
  });

  /**
   * Known-broken legacy expressions. Each entry is an expression
   * that the legacy `with()` evaluator ALSO couldn't handle (either
   * invalid JS syntax, or a framework feature that was never
   * supported by the emu-shims evaluator). Silent-failing these
   * matches the production behavior of every build since the
   * original Cordova APK — they are bugs in the templates, not in
   * SafeExpr.
   *
   * Adding a new entry requires a comment explaining WHY it's
   * acceptable to skip.
   */
  const KNOWN_LEGACY_UNPARSEABLE = new Set([
    // Angular filter-pipe syntax ("expr | filterName:arg"). The
    // legacy `with()` evaluator parses `|` as bitwise OR and `:`
    // as a label, which is a SyntaxError in expression context —
    // so the evaluator has always returned undefined here, and
    // the scatter20 ng-repeat has always rendered zero points.
    // Only one occurrence in the entire codebase:
    //   symbols/sym-scatter20-template.html:71
    //   <div ng-repeat="p in s.pts | limitTo:-50 track by $index">
    's.pts | limitTo:-50',
  ]);

  it('every extracted expression parses via SafeExpr (except known legacy quirks)', () => {
    /** @type {{ expr: string, file: string, directive: string }[]} */
    const failures = [];
    for (const [expr, sites] of expressionIndex) {
      if (KNOWN_LEGACY_UNPARSEABLE.has(expr)) continue;
      const ast = _parseForTest(expr);
      if (ast === null) {
        failures.push({ expr, file: sites[0].file, directive: sites[0].directive });
      }
    }
    if (failures.length > 0) {
      // Print the first 20 failures so a broken commit is actionable.
      const preview = failures
        .slice(0, 20)
        .map((f) => `  [${f.directive}] ${JSON.stringify(f.expr)}  (${f.file})`)
        .join('\n');
      throw new Error(
        `${failures.length} of ${expressionIndex.size} real-world expressions failed to parse:\n${preview}`
      );
    }
    expect(failures.length).toBe(0);
  });

  it('known-legacy unparseable entries are still unparseable (detect over-broad parser)', () => {
    // If any KNOWN_LEGACY_UNPARSEABLE entry starts parsing — either
    // because SafeExpr grew filter-pipe support or because someone
    // fixed the template — the entry should be removed from the
    // allowlist. This guards against the allowlist silently
    // stale-rotting.
    for (const expr of KNOWN_LEGACY_UNPARSEABLE) {
      const ast = _parseForTest(expr);
      expect(
        ast,
        `KNOWN_LEGACY_UNPARSEABLE entry ${JSON.stringify(expr)} now parses — remove it from the allowlist`
      ).toBeNull();
    }
  });

  it('evaluate() never throws for any real-world expression', () => {
    // Rich mock scope: every property access returns a callable
    // Proxy that also has properties, so method chains and member
    // lookups don't bottom out.
    const handler = {
      get(target, prop) {
        if (prop === Symbol.toPrimitive) return () => 0;
        if (prop === 'then') return undefined; // don't look like a thenable
        // Callable Proxy that's also an object of further proxies.
        // eslint-disable-next-line no-use-before-define
        return makeMockScope();
      },
      apply() {
        // eslint-disable-next-line no-use-before-define
        return makeMockScope();
      },
    };
    function makeMockScope() {
      return new Proxy(function mock() {}, handler);
    }
    const scope = makeMockScope();

    /** @type {{ expr: string, err: string }[]} */
    const throws = [];
    for (const [expr] of expressionIndex) {
      try {
        evaluate(expr, scope);
      } catch (err) {
        throws.push({ expr, err: String(err) });
      }
    }
    if (throws.length > 0) {
      const preview = throws
        .slice(0, 10)
        .map((f) => `  ${JSON.stringify(f.expr)} → ${f.err}`)
        .join('\n');
      throw new Error(
        `${throws.length} expressions threw during evaluate():\n${preview}`
      );
    }
    expect(throws.length).toBe(0);
  });
});
