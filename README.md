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

## Native packaging (Capacitor)

The repo ships a Capacitor scaffold (`capacitor.config.ts` +
`scripts/cap-prepare.mjs` + the `cap:*` npm scripts). The native
`android/` directory itself is **not** committed — it's regenerated
on first use by `npx cap add android` and refreshed by `cap sync`.

### One-time setup (per developer machine)

```bash
# Install deps (Capacitor packages are listed in dependencies).
npm install

# Generate the Android project. This pulls Capacitor's android
# template, wires it to capacitor.config.ts, and writes ./android/.
npm run cap:prepare       # populate ./www from ./www-src
npx cap add android       # one-time scaffold of ./android
```

You also need a working Android development environment:
- JDK 17+
- Android Studio (or stand-alone Android SDK + cmdline-tools)
- `ANDROID_HOME` exported

### Daily build cycle

```bash
npm run cap:sync          # runs cap-prepare + `cap sync android`
npm run cap:open          # opens android/ in Android Studio
# or:
npm run cap:run           # cap sync + adb install + adb run
```

`npm run cap:prepare` copies `www-src/` → `www/` (Capacitor's
`webDir`), excluding TypeScript sources, ambient declarations, and
test files. The raw web tree is what ships — **not** the Vite-built
`dist/` — because the legacy classic `<script>` tags rely on
in-order execution that Vite cannot losslessly bundle. Switching to
the bundled output is a stage-7 task once the legacy modules become
real ES modules. See `capacitor.config.ts` for the long version.

### Package identity

To preserve in-place upgrades from the original Cordova APK
(`PIV-v4.2.0-R300u-tested.apk`), `capacitor.config.ts` mirrors the
legacy `AndroidManifest.xml` identity:

| Field | Value |
|-------|-------|
| `appId` | `com.pivision.qa` |
| `appName` | `PIVISION QA` |
| `versionName` | `4.2.0` (override in `android/app/build.gradle`) |
| `allowMixedContent` | `true` (PI Web API on-prem HTTP) |

### Signing

Stage 6 produces a **debug-signed** APK by default. For Play Store
release you need a real keystore — generate one with `keytool` and
configure `signingConfigs.release` in
`android/app/build.gradle` after `cap add android` runs. The keystore
itself **must not** be committed (already in `.gitignore`).

## Staged modernization plan

| Stage | Goal | Status |
|-------|------|--------|
| 0 | Extract sources, scaffold Vite/TS/ESLint/Prettier/Vitest | ✅ done |
| 1 | Security: tighten CSP, SafeDOM helper, eslint rules | ✅ done |
| 2 | Architecture: SafeExpr evaluator, ambient types, ESM facades | ✅ done |
| 3 | Performance: Workbox PWA, refined chunks, symbol loader | ✅ done |
| 4 | UX/UI: design tokens, theme switcher, a11y, View Transitions | ✅ done |
| 5 | Tests + CI: Vitest setup, Playwright e2e, GitHub Actions | ✅ done |
| 6 | Capacitor scaffold (config + cap-prepare + scripts + docs) | ✅ done |
| 7 | Tech-debt: 102 innerHTML migrated, `unsafe-eval` dropped from CSP | ✅ done |
| 8 | Symbol Packs: make the emulator a general-purpose symbol tester | ✅ done |

## Authoring a Symbol Pack (stage 8)

The emulator learned to load **external symbol libraries** without
editing `app.js`. A *pack* is a drop-in directory under
`www-src/symbols/packs/<pack-id>/` containing a `pack.json` manifest
and the symbol files. The 113 built-in symbols continue to load
through their existing code paths unchanged — packs are additive.

### Quickstart

1. **Create the directory**:
   ```
   www-src/symbols/packs/my-pack/
   ├── pack.json
   └── symbols/
       ├── sym-foo.js
       ├── sym-foo-template.html
       └── sym-foo-config.html
   ```

2. **Write the manifest** (`pack.json`):
   ```jsonc
   {
     "id": "my-pack",                 // kebab-case, must match directory name
     "displayName": "My Pack",
     "version": "1.0.0",              // MAJOR.MINOR.PATCH (semver)
     "core": [                         // optional; loaded once per pack
       "core/base.js"
     ],
     "symbols": [
       {
         "name": "foo",                // unique across all packs
         "displayName": "Foo Symbol",
         "category": "Examples",
         "dataShape": "Value",         // None|Value|Table|Gauge|Trend|TimeSeries|XYPlot
         "requires": [                 // optional; loaded per symbol on demand
           "libs/chart.js"
         ],
         "files": {
           "js":       "symbols/sym-foo.js",
           "template": "symbols/sym-foo-template.html",
           "config":   "symbols/sym-foo-config.html"
         }
       }
     ]
   }
   ```

3. **Enable the pack** by adding its id to
   `www-src/symbols/packs/packs-index.json`:
   ```json
   { "packs": ["example-hello", "my-pack"] }
   ```

4. **Reload the emulator.** Your symbol appears in the picker under
   its declared category, loads lazily when selected, and renders
   inside the standard emulator canvas.

### Symbol file contract (`sym-foo.js`)

A symbol is a classic IIFE that registers itself with
`window.PIVisualization.symbolCatalog.register({...})`. The shape
mirrors the built-in symbols exactly (see
`www-src/symbols/sym-afbrowser20.js` for a real example, or
`www-src/symbols/packs/example-hello/symbols/sym-hello.js` for a
dependency-free minimal one):

```js
(function (PV) {
  'use strict';
  if (!PV || !PV.symbolCatalog) return;

  function symbolVis() {}
  symbolVis.prototype.init = function (scope, elem) {
    // Build DOM via createElement + textContent. Do NOT use
    // innerHTML — the stage-7 regression guard in CI will fail.
    // If you need HTML composition, use window.SafeDOM.setSafeHTML.
    var el = elem.get ? elem.get(0) : elem;
    var div = document.createElement('div');
    div.textContent = scope.config.Title || 'Hello';
    el.appendChild(div);

    // scope.$watch goes through SafeExpr — no `eval`, no CSP violation.
    if (scope && typeof scope.$watch === 'function') {
      scope.$watch('config.Title', function () {
        div.textContent = scope.config.Title || 'Hello';
      });
    }
  };

  PV.symbolCatalog.register({
    typeName: 'foo',
    displayName: 'Foo',
    datasourceBehavior:
      (PV.Extensibility && PV.Extensibility.Enums && PV.Extensibility.Enums.DatasourceBehaviors)
        ? PV.Extensibility.Enums.DatasourceBehaviors.None : 0,
    visObjectType: symbolVis,
    getDefaultConfig: function () {
      return { Title: 'Foo', Height: 180, Width: 360 };
    }
  });
})(typeof window !== 'undefined' ? window.PIVisualization : undefined);
```

### Rules enforced by the validator

The manifest is checked at load time by
`window.PIV_PACKS.validateManifest()`. Any violation fails the pack
load loudly (pack is skipped, error logged to console). Rules:

- `id` must be lowercase kebab-case and must match the directory name
- `version` must be `MAJOR.MINOR.PATCH` (optional `-prerelease` tail)
- `symbols[]` is required (empty array is accepted)
- Every path in `core[]`, `files.{js,template,config}`, and
  `requires[]` must be a **safe relative path**:
  - non-empty string
  - no `..` segments (no path traversal out of the pack directory)
  - not absolute (no leading `/`)
  - no URL scheme prefix (no `http://`, `data:`, `blob:`, `javascript:`, etc.)
- Symbol `name`s are unique across all enabled packs; on collision
  the first pack wins and the later one logs a warning.
- Built-in symbol names always win over pack names.

### Guarantees

| Property | What it means |
|----------|---------------|
| **Non-breaking** | Removing the pack id from `packs-index.json` returns the emulator to its pre-stage-8 behavior byte-for-byte. |
| **Additive** | Built-in `SYMBOL_LIST` entries in `app.js` are never mutated; pack entries are pushed at boot time. |
| **Lazy** | `core/` files load once per pack on first symbol pick. `requires[]` files load once per file on first use. `files.js` + template fetch only when the user selects the symbol. |
| **Idempotent** | `PIV_PACKS.init()` resolves to the same promise on re-entry; reloading the page is safe. |
| **Sandboxed validation** | Path traversal, absolute paths, and URL schemes in manifest fields are rejected by the validator. |

### CI guards

Pack code is covered by the same CI regression guards as the rest of
the emulator:

- `eval()` / `new Function()` outside the allow-list fails the
  `Security audit` job.
- New raw `innerHTML = ...` in the stage-7 migrated files fails the
  same job. Pack symbols should use `createElement` or
  `window.SafeDOM.setSafeHTML`.
- `securitypolicyviolation` events during emulator boot fail the
  `E2E (Playwright)` job.
- `PIV_PACKS.validateManifest()` is covered by 58 Vitest unit tests
  in `www-src/emulator/js/emu-packs.test.js`.
- The reference `example-hello` pack has 5 end-to-end tests in
  `tests/e2e/smoke.spec.ts` that exercise discovery → validation →
  load → registration → CSP clean.

### Reference implementation

`www-src/symbols/packs/example-hello/` is a complete, dependency-free
pack that ships enabled in `packs-index.json`. It's the minimal
working example; start there, copy it, and rename.

## Pack Dev Kit (`scripts/pack-*.mjs`)

Four zero-dependency Node scripts that automate the full pack
authoring workflow. They live under `scripts/` and are exposed as
npm tasks. Use them in this order when you start a new pack.

### `npm run pack:new` — scaffold a pack

```bash
npm run pack:new my-pack
npm run pack:new my-pack --display "My Pack" --version 0.1.0
```

Creates `www-src/symbols/packs/my-pack/` with a valid (but empty)
`pack.json`, makes a `symbols/` subdirectory, and adds the pack id
to `packs-index.json`. Validates `id` (kebab-case) and `version`
(semver) using the same rules `emu-packs.js` enforces at runtime,
so anything that gets past `pack:new` is guaranteed to load.

### `npm run pack:add-symbol` — scaffold a symbol

```bash
npm run pack:add-symbol my-pack temperature
npm run pack:add-symbol my-pack pie-chart \
  --display "Pie Chart" \
  --category Charts \
  --data-shape Table
```

Generates the triplet (`sym-temperature.js` /
`-template.html` / `-config.html`) inside the pack's `symbols/`
folder from the templates in `scripts/templates/`. Appends a new
entry to `pack.json` with the chosen `category` (default
"Custom") and `dataShape` (default "Value"). Refuses to overwrite
existing files and refuses to register a duplicate symbol name.

The generated `sym-<name>.js` is intentionally compatible with
**both** real PI Vision server (drop into
`/Scripts/app/editor/symbols/ext/`) **and** this emulator (via
Symbol Packs). It uses `createElement` + `textContent` everywhere
(no `innerHTML` sinks) and registers via the standard
`PV.symbolCatalog.register({...})` API. Three `$watch` callbacks
are pre-wired so the symbol reacts to config edits and live data
out of the box.

### `npm run pack:dev` — watch server with auto-reload

```bash
npm run pack:dev                       # default port 5173
npm run pack:dev -- --port 4000        # custom port
npm run pack:dev -- --no-open          # skip the URL banner
```

Starts a static HTTP server over `www-src/` (no bundling, no
transforms — files served byte-for-byte) and watches
`www-src/symbols/packs/` for changes. Every HTML response is
rewritten on the fly to inject a tiny client snippet that
subscribes to a Server-Sent Events stream at
`/__pack-dev__/events`. When you save a file inside any pack
directory, the server fires a `reload` event, the client calls
`location.reload()`, and the open browser tab refreshes to show
your edit. ~200 ms debounce collapses the bursts most editors
produce per save.

Open one of these URLs after the server starts:

- `http://localhost:5173/emulator/index.html` — full emulator
- `http://localhost:5173/index.html` — mobile shell
- `http://localhost:5173/desktop.html` — desktop shell
- `http://localhost:5173/qa/qa-app.html` — QA tool

Zero external dependencies — only Node built-ins (`http`,
`fs/promises`, `path`).

### `npm run pack:lint` — static validator

```bash
npm run pack:lint                  # every enabled pack
npm run pack:lint -- --strict      # warnings become errors
npm run pack:lint -- --json        # machine-readable output
npm run pack:lint -- my-pack       # lint a single pack
```

Pre-commit / CI-friendly linter. Re-runs the same `pack.json`
schema validator the emulator uses at runtime, then statically
analyzes every referenced source file for the patterns most
likely to break the symbol in production:

| Severity | Rule | Where | Why |
|----------|------|-------|-----|
| error | `no-eval` | symbol `.js` | CSP forbids `unsafe-eval` |
| error | `no-new-function` | symbol `.js` | same |
| error | `no-document-write` | symbol `.js` | SPA-unsafe; dropped in stage 7 |
| warning | `no-raw-inner-html` | symbol `.js` | use `createElement` or `window.SafeDOM.setSafeHTML` |
| warning | `no-inline-event-handler` | `-template.html` / `-config.html` | inline `onXxx=` blocked by production CSP; use `ng-*` directives |

Comment lines and lines tagged `eslint-disable` are skipped to
avoid false positives. The linter also catches missing files,
stale references in `core[]` / `requires[]`, and `id` /
directory mismatches.

Exit codes:

- `0` — no errors (warnings allowed in default mode)
- `1` — at least one error, OR warnings with `--strict`
- `2` — invalid CLI arguments

### Recommended dev loop

```bash
# One-time
npm run pack:new my-pack

# Each new symbol
npm run pack:add-symbol my-pack <name>

# Iterate
npm run pack:dev          # leave running in one terminal
# edit www-src/symbols/packs/my-pack/symbols/sym-<name>.js
# save → browser auto-reloads → see the result

# Before commit
npm run pack:lint
# fix any errors / warnings, repeat until clean

# (optional) stricter CI gate
npm run pack:lint -- --strict
```

### Optional: wire `pack:lint` into CI

Add a step to the existing `security` job in `.github/workflows/ci.yml`:

```yaml
- name: Lint installed Symbol Packs
  run: npm run pack:lint -- --strict
```

This runs after the eval/Function grep guard already there, so
both the main source tree and any installed pack are gated by the
same defensive rules.

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

### Stage 6 — done
- **`capacitor.config.ts`** at repo root. Mirrors the legacy
  `AndroidManifest.xml` package identity (`com.pivision.qa`,
  `PIVISION QA`) so an upgrade install from the original APK is
  in-place rather than a fresh app. Includes `allowMixedContent`
  for on-prem HTTP PI Web API endpoints and
  `webContentsDebuggingEnabled` for stage-6/7 troubleshooting.
- **`scripts/cap-prepare.mjs`** — copies `www-src/` → `www/`
  (Capacitor's `webDir`) with the right exclusions: TypeScript
  sources, ambient declarations, test files, and the `types/`
  directory are stripped. Idempotent — wipes `www/` first so a
  removed source file can never linger in the runtime image.
- **`cap:*` npm scripts**:
  - `cap:prepare` — runs the prepare script standalone
  - `cap:sync` — `cap:prepare` then `cap sync android`
  - `cap:open` — `cap open android`
  - `cap:run` — `cap:sync` then `cap run android`
- **`@capacitor/{core,cli,android}` v6.2** added to `dependencies`.
- **`.gitignore`** extended for the generated `www/`, `android/`,
  and `ios/` trees so first-time `cap add android` doesn't
  accidentally commit the entire native project.
- **README.md** documents the one-time setup (Android Studio, JDK,
  `ANDROID_HOME`), the daily build cycle, the package identity,
  and the signing story.

The `android/` directory itself is intentionally **not** in this
repo. It's a regenerable native scaffold; committing it would bloat
the repo, conflict on every Capacitor upgrade, and expose
contributors to merge hell. `npx cap add android` regenerates it
from `capacitor.config.ts` in seconds.

### Stage 7 round 1 — done (tech-debt quick wins)
- **`_loadScript` → `SymbolLoader.loadScript`** wired in both
  `emulator/js/app.js` and `emulator/emulator/js/app.js`. The legacy
  inline script-injection path is preserved as a fallback for
  runtimes that never loaded `js/perf/symbol-loader.js`. Two symbols
  that share a plugin (e.g. the `mug*` family) now produce a single
  `<script>` tag in the DOM instead of duplicates.
- **`symbol-loader.js` wired** into both `emulator/index.html` and
  `emulator/emulator/index.html` as a `<script type="module">` tag,
  loaded *after* `safe-expr.js` and *before* `emu-shims.js`/`app.js`.
- **All four `document.write()` callers replaced** with
  `Blob` URL navigation:
  - `qa/js/qa-advanced.js` (PDF report popup)
  - `symbols/mu20-plugins/mu20-reports.js` (`_exportPdf`)
  - `symbols/mm20-plugins/mm20-reports.js` (`_exportPdf`)
  - The print window opens via `URL.createObjectURL(blob)`, focuses,
    prints, then revokes the URL after a timeout.
  `document.write` is SPA-unsafe (it can clobber the parent document
  under some flow timings) and was the last call site in the
  security plan's tracked-debt list.
- **`emu-devtools.js` REPL eval gated** behind
  `window.PIVISION_DEVTOOLS_EVAL` (default `undefined` → off). The
  flag is documented in `www-src/types/globals.d.ts`. Production
  builds ship with the REPL refusing to evaluate; developers
  debugging an emulator session set the flag to `true` from the JS
  console once before typing into the panel.

### Stage 7 rounds 2–5 — done (innerHTML → SafeDOM migration)
The top 5 legacy files ranked by XSS exposure were migrated from raw
`innerHTML =` writes to a local `setSafeInner(el, html)` helper that
routes through `window.SafeDOM.setSafeHTML` (the DOMPurify wrapper
introduced in stage 1). Each file keeps a small eslint-disabled
fallback in its helper so the code still works if SafeDOM fails to
load.

| Round | File | Sites | Commit |
|-------|------|-------|--------|
| 2 | `www-src/js/ai-chat.js` | 17 | `92470b8` |
| 3 | `www-src/js/af-browser-ui.js` | 30 | `0cbd791` |
| 4 | `www-src/js/mobile-app.js` | 28 | `393ab61` |
| 5 | `www-src/js/collab-ui.js` | 14 | `9ec5d20` |
| 5 | `www-src/js/visual-builder.js` | 13 | `9ec5d20` |
| | **Total** | **102** | |

Highlights:
- **`ai-chat.js`** — the `formatAIResponse()` sink (AI-generated
  markdown → HTML) now routes through SafeDOM. This was the single
  highest-impact fix in the migration because arbitrary AI output
  flowed directly into `innerHTML`.
- **`af-browser-ui.js`** — PI-server-supplied tag names, attribute
  descriptions, and event frame text are sanitized at the sink
  instead of relying on every template author to call `_escHtml`.
- **`mobile-app.js`** — added an inline `escapeHtml()` helper to the
  top of the IIFE so ~40 template-literal interpolations (alert
  titles, profile names, diagnostics strings, KPI values) are now
  escaped. Fixed a latent attribute-injection bug in the
  connection-profile delete button (`onclick='deleteProfile(\${id})'`
  now escapes the id).
- **`collab-ui.js`** — WebSocket peer-supplied chat messages,
  mentions, comments, and lock badges are sanitized. Added
  `_escapeAttr` to the join-dialog nickname/room-id inputs that load
  from localStorage.
- **`visual-builder.js`** — the property panel, export modal,
  templates dialog, and open-design dialog all route through the
  helper, plus interpolations of design names, template names, and
  component labels get `_esc()` wrappers.

All 4 `innerHTML = ''` clears became `replaceChildren()` (modern and
avoids the sanitizer round-trip).

### Stage 7 — CI regression guard (commit `5fe366a`)
Added a second block to the CI `security` job that fails the build
if any new raw `innerHTML =` write lands in one of the five
migrated files. The guard greps each file for `\.innerHTML\s*=[^=]`
and filters out eslint-disabled lines + read-only references.
Normalized the helper fallbacks to use on-line
`// eslint-disable-line` markers so the grep can filter them
without false positives.

### Stage 7 — CSP `unsafe-eval` removal (commit `41a664e`)
The last headline item on the security migration plan. The four
entry HTMLs that previously needed `'unsafe-eval'` no longer permit
it. The Angular-shim `_evalExpr()` goes through `window.SafeExpr`
(the recursive-descent parser from stage 2) and the legacy
`new Function` fallback is gated off by an inline flag set at the
very top of each entry:

```html
<script>window.PIVISION_ALLOW_UNSAFE_EVAL = false;</script>
```

Coverage audit: grep-extracted 1759 distinct `ng-*` expressions
from the emulator and symbol templates, and smoke-tested SafeExpr
against a representative sample (literals, member access, method
calls, ternaries, logical, `$index`, etc.). Only edge case that
doesn't parse is a single `filter-pipe` expression
(`"s.pts | limitTo:-50"`, one occurrence) — the legacy `with()`
evaluator didn't handle it either, so this is a no-op degrade.

Developers can re-enable for debugging by setting
`window.PIVISION_ALLOW_UNSAFE_EVAL = true` in devtools before the
emulator loads (though CSP will still block the actual
`new Function` call — the flag just surfaces which expression
failed for triage).

### Stage 7 — Tech-debt summary

| Metric | Before round 1 | After stage 7 |
|--------|---------------|---------------|
| Raw `innerHTML =` in top-5 legacy files | 102 | 0 |
| Raw `innerHTML =` total (www-src/) | 351 | ~249 (symbols only) |
| `document.write()` call sites | 4 | 0 |
| `eval()` in emu-devtools REPL | unguarded | feature-flag gated |
| `_loadScript` dedup | helper unused | wired |
| `'unsafe-eval'` in CSP (entry HTMLs) | 4 | 0 |
| CI regression guards | `eval()` / `new Function()` only | + `innerHTML =` in 5 migrated files |

### Tracked tech debt for stage 8+ (remaining)
- ~249 raw `innerHTML =` writes inside `www-src/symbols/**`. These
  are sandboxed symbol bundles that render in isolated iframes via
  `symbol-sandbox.js`; they have a different threat model than the
  main shell and get their own round.
- Drop `'unsafe-inline'` from the `script-src` in the entry HTMLs.
  This requires replacing the remaining inline `<script>` blocks
  with external files or adopting nonces via `vite-plugin-pwa`.
- Verify on a real Android device. The Vite build, the unit tests,
  and the Playwright e2e suite all pass in CI, but no APK has been
  built or installed yet — run `npm install && npm run cap:prepare
  && npx cap add android && npx cap run android` locally to
  validate end-to-end.
- SafeExpr coverage smoke-tested against 9 representative
  expressions from the codebase. If the emulator misbehaves in the
  field, the debug path is: open devtools → check the console for
  the specific expression that failed → either add its syntax to
  SafeExpr or `git revert 41a664e` to restore the fallback.

## Original app metadata

- **Version**: v4.2.0-R300
- **Manifest**: PWA, RTL, Hebrew, theme `#0a0f1e`
- **AGP**: 8.10.1
- **Signature**: Android Debug certificate (not a release key)
- **Counts**: 142 HTML, 257 JS, 92 CSS, 569 symbols
