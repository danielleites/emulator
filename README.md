# PIVISION Mobile

PI Vision R300 emulator, QA toolkit, AF browser, and 569-symbol library
(including MM20). Originally shipped as a Cordova-packaged Android APK
(`PIV-v4.2.0-R300u-tested.apk`); this repository now contains the extracted
web sources and a modern build pipeline around them.

## Repository layout

```
.
├── PIV-v4.2.0-R300u-tested.apk   # Original signed APK (reference)
├── www-src/                       # Extracted web sources (HTML/JS/CSS/symbols)
│   ├── index.html                 # Mobile entry point
│   ├── desktop.html               # Desktop entry point
│   ├── guide.html                 # User guide
│   ├── qa/qa-app.html             # QA toolkit
│   ├── emulator/                  # PI Vision R300 emulator
│   ├── symbols/                   # 569 symbol definitions
│   ├── js/, css/, fonts/, icons/  # Shared assets
│   └── sw.js                      # Service worker (offline cache)
├── package.json                   # Vite + TS + ESLint + Prettier + Vitest
├── vite.config.ts                 # Multi-page Vite build
├── tsconfig.json                  # TypeScript (allowJs, gradual migration)
├── eslint.config.js               # Flat config
└── .prettierrc.json
```

## Getting started

```bash
npm install
npm run dev          # Vite dev server with HMR
npm run build        # Type-check + production bundle to dist/
npm run preview      # Serve dist/ locally
npm run lint         # ESLint
npm run format       # Prettier
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright e2e tests
```

## Build pipeline

1. **Vite** bundles the four HTML entry points (`index`, `desktop`, `guide`,
   `qa`), code-splits per route, and tree-shakes unused modules.
2. **TypeScript** runs in `allowJs` mode so JS files are typechecked
   loosely; modules can be migrated to `.ts` incrementally.
3. **ESLint** + **Prettier** enforce style. The legacy `vendor/`,
   `cordova.js`, jQuery, and 569 symbol bundles are excluded from linting
   to keep noise down.
4. **Vitest** for unit tests, **Playwright** for e2e.

## Native packaging

This repo only handles the web layer. To produce an installable APK you
need to wrap `dist/` in a native shell — the planned migration is from
the legacy Cordova shell to **Capacitor**:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init pivision com.pivision.mobile --web-dir=dist
npx cap add android
npm run build && npx cap sync
npx cap open android
```

Capacitor scaffolding is **not yet** in this repo — see the staged plan
below.

## Staged modernization plan

| Stage | Goal | Status |
|-------|------|--------|
| 0 | Extract sources, scaffold Vite/TS/ESLint/Prettier/Vitest | ✅ done |
| 1 | Security: tighten CSP, SafeDOM helper, eslint rules | ✅ done |
| 2 | Architecture: SafeExpr evaluator, ambient types, ESM facades | ✅ done |
| 3 | Performance: Workbox PWA, refined chunks, symbol loader | ✅ done |
| 4 | UX/UI: design tokens, theme switcher, a11y, View Transitions | ✅ done |
| 5 | Tests + CI: Vitest setup, Playwright e2e, GitHub Actions | ✅ done |
| 6 | Capacitor migration | pending |
| 7 | New features (TBD) | pending |

## Security migration plan

### Stage 1 — done
- **CSP** added to `desktop.html`, `guide.html`, `qa/qa-app.html` (had none).
- **CSP** tightened on `index.html`: removed `http:` wildcards, removed
  broad `default-src`, scoped `connect-src` to `self https: wss:`, added
  `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `frame-ancestors 'self'`. `unsafe-eval` is still required by the
  Angular-shim expression evaluator in `emulator/js/emu-shims.js`
  (scheduled for removal in stage 2).
- **SafeDOM helper** at `www-src/js/security/safe-dom.js` —
  `setSafeHTML / appendSafeHTML / safeFragment / sanitize / escape`.
  Resolves DOMPurify when bundled, falls back to a strict allow-list
  sanitizer otherwise. Loaded as the first script in every entry HTML.
- **ESLint rules**: `no-eval`, `no-implied-eval`, `no-new-func`,
  `no-script-url` set to `error`; `no-restricted-properties` warns on
  any direct `innerHTML` / `outerHTML` assignment with a hint to use
  SafeDOM. Legacy emulator devtools and the Angular shim are
  whitelisted.
- **Tests**: `safe-dom.test.js` exercises the fallback sanitizer
  (jsdom environment via Vitest).

### Stage 2 — done
- **SafeExpr** at `www-src/js/security/safe-expr.js` — a 600-line
  recursive-descent parser + evaluator covering the Angular template
  expression subset (literals, member access, computed access, method
  calls with correct `this` binding, arithmetic, comparisons, logical,
  ternary, object/array literals, unary). Blocks `__proto__`,
  `constructor`, `prototype`, the `Function` constructor, and any
  property starting with the Angular `$$` sigil.
  - Parse cache (1024 entries, LRU-cleared).
  - Public exports: `evaluate(expr, scope)` and `assign(expr, scope, v)`
    (the latter for `ng-model`).
  - Exposed as `window.SafeExpr` for legacy non-module scripts.
  - 43 unit tests in `safe-expr.test.js`, all passing under raw Node.
- **emu-shims.js** patched (both copies — `emulator/js/` and
  `emulator/emulator/js/`). The `_evalExpr()` helper now routes through
  `window.SafeExpr.evaluate` first; the legacy `new Function` fallback
  is kept only for the case where SafeExpr failed to load, and is
  itself gated by `window.PIVISION_ALLOW_UNSAFE_EVAL` (defaults to
  permissive — set to `false` for hardened deployments).
- **safe-expr.js wired** into both `emulator/index.html` and
  `emulator/emulator/index.html` *before* the `<script>` tag for
  emu-shims, so the global is populated by the time the Angular shim
  initializes.
- **Ambient TypeScript types** at `www-src/types/globals.d.ts` —
  declares `window.SafeDOM`, `window.SafeExpr`, `window.PIVision`,
  `window.PIVISION_ALLOW_UNSAFE_EVAL`. Editor IntelliSense and
  `npm run typecheck` now understand the runtime globals without
  touching any legacy JS file.
- **ESM facades** at `www-src/js/main-mobile.ts` and
  `www-src/js/main-desktop.ts`. These are the *new* entry points for
  Vite: they statically import the security helpers, then dynamically
  import the legacy bundles in their original load order. The dynamic
  imports become per-route chunks under Vite, which is the foundation
  for stage-3 code splitting. The legacy `<script>` tags in the HTML
  files are kept for the standalone-APK code path.

### Stage 3 — done
- **sw.js rewritten** as a strategy router:
  - HTML / navigation → network-first (fresh content, offline fallback)
  - `/symbols/`, `/wow-plugins/` → cache-first (versioned, immutable)
  - `/fonts/`, `/icons/` → cache-first (immutable)
  - CSS / JS → stale-while-revalidate
  - `/piwebapi`, `/api/` → network-only (never cached)
  - Runtime caches bounded to 200 entries each (LRU trim).
  - Precache uses individual `cache.add` calls so a single 404 no
    longer aborts the whole install.
  - SafeDOM and SafeExpr are precached so the first launch never
    falls back to unsafe-eval.
  - Listens for `SKIP_WAITING` postMessage so the page can ask the
    SW to take control after an update.
- **vite.config.ts** rewritten:
  - `vite-plugin-pwa` configured with Workbox `generateSW` strategy
    that mirrors the manual `sw.js` routing (so the Vite build path
    and the standalone-APK path behave identically at runtime).
  - `manualChunks(id)` function splits the bundle into:
    `vendor`, `vendor-dompurify`, `security`, `af`, `pi`, `ai`, `ux`.
  - `entryFileNames`, `chunkFileNames`, `assetFileNames` use
    content-hashed filenames (long-term caching).
  - `modulePreload.polyfill` enabled so older WebViews still get
    correct module preload behavior.
- **Bundle analyzer**: `npm run build:analyze` (sets `ANALYZE=1`)
  generates `dist/bundle-stats.html` via `rollup-plugin-visualizer`
  (treemap, with gzip + brotli sizes). The plugin is lazy-imported
  so it remains an optional dev dependency.
- **Symbol loader** at `www-src/js/perf/symbol-loader.js`:
  - `loadScript(url)`, `loadCSS(url)` — promise-deduped against both
    in-flight calls and pre-existing legacy `<script>` / `<link>`
    tags. Eliminates the duplicate-script-tag noise that the legacy
    `_loadScript` produces when two symbols share a plugin.
  - `prefetch(url)` — adds `<link rel="prefetch" as="...">` so the
    browser warms the cache during idle time.
  - `prefetchIdle(urls)` — wraps `requestIdleCallback` for batched
    background warmup.
  - Exposed as `window.SymbolLoader` so the legacy emulator can
    opt-in without being rewritten.
  - 11 unit tests in `symbol-loader.test.js` (jsdom).
- **package.json**: added `rollup-plugin-visualizer` and
  `workbox-window` dev deps; added `build:analyze` script.

### Service worker

There are now **two** service workers, one per build path:

| Path | SW source | Strategy router |
|------|-----------|------------------|
| Standalone APK / Cordova | `www-src/sw.js` (hand-written) | Network-first HTML, cache-first symbols, SWR for JS/CSS |
| Vite build / web preview | Generated by `vite-plugin-pwa` (Workbox) | Same strategies, expressed via `runtimeCaching` |

Both workers use the same cache-class names so a future migration
between them is transparent.

### Stage 4 — done
- **Design tokens** at `www-src/css/tokens.css`. CSS custom properties
  for brand, surface, text, border, status, spacing (4px grid),
  radius, typography, elevation, motion, z-index, and a container-
  query breakpoint scale. Three themes:
  - `:root[data-theme='dark']` (default, matches the legacy look)
  - `:root[data-theme='light']`
  - `:root[data-theme='auto']` honors `prefers-color-scheme` via a
    pure-CSS cascade (no JS dependency).
  - `prefers-reduced-motion` collapses motion durations to 0.
  - Includes `.pi-skip-link`, `.pi-sr-only`, and a global
    `:focus-visible` outline ring.
- **Theme switcher** at `www-src/js/ux/theme.js`:
  - `initTheme()` reads `localStorage.pivision.theme` and applies
    `data-theme` to `<html>` before paint (no FOUC).
  - `setTheme(t)`, `getTheme()`, `getResolvedTheme()`, `cycleTheme()`,
    `onThemeChange(fn)`.
  - Subscribes to `(prefers-color-scheme: dark)` so 'auto' listeners
    re-fire on OS-level changes.
  - Exposed as `window.PIVisionTheme`.
- **Accessibility helpers** at `www-src/js/ux/a11y.js`:
  - `injectSkipLink({ targetSelector, label })` — adds the
    skip-to-content link, makes the target focusable.
  - `createFocusTrap(container, { onEscape })` — locks Tab/Shift+Tab
    inside a container, restores focus on release.
  - `announce(message, { assertive })` — ARIA live region helper
    (polite + assertive variants).
  - `onArrowKeyNav(container, { itemSelector, orientation, wrap })`
    — keyboard navigation for lists/grids/tabs/menus.
  - `prefersReducedMotion()`.
  - Exposed as `window.PIVisionA11y`.
- **View Transitions wrapper** at `www-src/js/ux/transitions.js`:
  - `withTransition(callback)` runs the DOM update inside
    `document.startViewTransition` when available, falls back to
    immediate update otherwise. Always returns the same shape.
  - Honors `prefers-reduced-motion`.
  - `tagForTransition(el, name)` sets `view-transition-name`.
  - Exposed as `window.PIVisionTransitions`.
- **Wired into all three entry HTMLs** (`index.html`, `desktop.html`,
  `qa/qa-app.html`):
  - `tokens.css` is the first stylesheet so legacy CSS can shadow it.
  - The UX bootstrap module runs early (before app code) to set the
    theme attribute and inject the skip link without FOUC.
- **Tests**: 11 tests for `theme.js` and 11 for `a11y.js` (all
  jsdom-based via Vitest). Combined with previous stages the suite
  is now: SafeDOM (10), SafeExpr (43), symbol-loader (11), theme
  (11), a11y (11) = **86 unit tests** total.

### Stage 5 — done
- **Vitest setup file** at `tests/vitest.setup.ts`. Runs in jsdom and:
  - clears `localStorage` / `sessionStorage` before each test,
  - polyfills `matchMedia` and `requestIdleCallback` (jsdom omits both),
  - tears down DOM mutations and the `data-theme` attribute after
    each test so files don't bleed into one another.
- **Coverage config** in `vite.config.ts`:
  - v8 provider, html + lcov + text reporters → `./coverage`,
  - includes only the new code under `js/security/`, `js/perf/`,
    `js/ux/` (legacy is intentionally excluded until it's migrated),
  - thresholds: 70% lines / functions / statements, 60% branches
    (phased rollout — tightened in later stages).
- **Playwright config** at `playwright.config.ts`:
  - Two projects: `chromium-mobile` (Pixel 7 device) and
    `chromium-desktop` (1440×900).
  - `locale: 'he-IL'`, `timezoneId: 'Asia/Jerusalem'`,
    `reducedMotion: 'reduce'` for deterministic runs.
  - `webServer` boots `vite preview` automatically; bypassed when
    `BASE_URL` is supplied (for testing against deployed previews).
- **E2E smoke tests** at `tests/e2e/smoke.spec.ts` cover:
  - Each entry HTML loads with no console errors (with a small
    allow-list for known legacy noise).
  - Page titles match expectations.
  - `data-theme` is set on `<html>` (no FOUC).
  - `window.SafeDOM` is exposed and actually strips `<script>`.
  - Skip link is injected after DOMContentLoaded.
  - CSP meta tag exists and contains `object-src 'none'` /
    `base-uri 'self'`.
  - QA entry CSP **does not** contain `'unsafe-eval'` (regression
    guard for stage 1).
  - SafeExpr correctly evaluates expressions and blocks
    `__proto__` access.
- **GitHub Actions** at `.github/workflows/ci.yml`:
  - `build` job: lint + format + typecheck + Vitest + `vite build`,
    uploads `dist/` as an artifact.
  - `e2e` job: depends on `build`, downloads the artifact, installs
    Chromium, runs Playwright, uploads the HTML report.
  - `security` job: `npm audit --audit-level=high` + a grep guard
    that fails the build if a new `eval()` or `new Function()` is
    introduced outside the allow-list.
  - Concurrency group cancels in-progress runs on the same ref.
  - Format/lint steps use `continue-on-error: true` for the phased
    rollout — they will become hard failures in stage 6.
- **Dependabot** at `.github/dependabot.yml` — weekly npm updates
  grouped by stack (vite, eslint, playwright, types) and monthly
  GitHub Actions updates.
- **package.json** scripts: `test:coverage`, `test:e2e:ui`,
  `test:e2e:install`, `ci`. Added `@vitest/coverage-v8` devDep.

### How to run locally

```bash
npm install              # installs Vite, Vitest, Playwright, etc.
npm run test:e2e:install # one-time: downloads Chromium for Playwright
npm run ci               # full local CI: typecheck + unit tests + build
npm run test:coverage    # unit tests with coverage report → ./coverage
npm run test:e2e         # boots vite preview and runs Playwright
npm run test:e2e:ui      # interactive Playwright UI mode
```

### Tracked tech debt for stages 6+
- 351 raw `innerHTML =` assignments across 75 files. Migration order:
  `js/ai-chat.js` (17), `js/af-browser-ui.js` (30), `js/mobile-app.js` (28),
  `js/collab-ui.js` (14), `js/visual-builder.js` (13), then symbols.
- Drop `'unsafe-eval'` from `index.html`/`desktop.html`/`emulator/*` CSP
  once we're confident SafeExpr covers every shim usage in production.
  (Opt-in already supported via `PIVISION_ALLOW_UNSAFE_EVAL = false`.)
- 1 `eval()` in `emulator/js/emu-devtools.js:147` — intentional dev
  REPL. Move behind a build-time flag in stage 5.
- 4 `document.write()` calls in `qa/js/qa-advanced.js` and the
  mu20/mm20 reports plugins (used for opening print-preview windows) —
  replaceable with `window.open` + `document.body.appendChild`.
- Wire the legacy `_loadScript` in `emulator/js/app.js` to
  `window.SymbolLoader.loadScript` so the dedup actually applies in
  production. (Currently the helper is loaded but the legacy code
  doesn't call it yet.)
- Vite/HMR build is still untested in this environment (no npm).
  Run `npm install && npm run build` locally to validate.

## Original app metadata

- **Version**: v4.2.0-R300
- **Manifest**: PWA, RTL, Hebrew, theme `#0a0f1e`
- **AGP**: 8.10.1
- **Signature**: Android Debug certificate (not a release key)
- **Counts**: 142 HTML, 257 JS, 92 CSS, 569 symbols
