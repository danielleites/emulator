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
| 2 | Architecture: TS migration, modularize 100KB+ files | pending |
| 3 | Performance: code splitting, lazy symbols, Workbox SW | pending |
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

### Tracked tech debt for stages 2–3
- 351 raw `innerHTML =` assignments across 75 files. Migration order:
  `js/ai-chat.js` (17), `js/af-browser-ui.js` (30), `js/mobile-app.js` (28),
  `js/collab-ui.js` (14), `js/visual-builder.js` (13), then symbols.
- 1 `new Function()` in `emulator/js/emu-shims.js:1411` (Angular shim).
  Replace with a safe expression evaluator (recursive descent) so we can
  drop `unsafe-eval` from CSP.
- 1 `eval()` in `emulator/js/emu-devtools.js:147` — intentional dev REPL,
  guarded by a feature flag in stage 2.
- 4 `document.write()` calls in `qa/js/qa-advanced.js` and the mu20/mm20
  reports plugins (used for opening print-preview windows).

## Original app metadata

- **Version**: v4.2.0-R300
- **Manifest**: PWA, RTL, Hebrew, theme `#0a0f1e`
- **AGP**: 8.10.1
- **Signature**: Android Debug certificate (not a release key)
- **Counts**: 142 HTML, 257 JS, 92 CSS, 569 symbols
