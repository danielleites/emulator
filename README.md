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
| 4 | UX/UI: theming, View Transitions, a11y, responsive | pending |
| 5 | Tests + CI: Vitest, Playwright, GitHub Actions | pending |
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

### Tracked tech debt for stages 4+
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
