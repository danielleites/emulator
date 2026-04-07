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
| 1 | Security: tighten CSP, replace `eval`, sanitize `innerHTML` | pending |
| 2 | Architecture: TS migration, modularize 100KB+ files | pending |
| 3 | Performance: code splitting, lazy symbols, Workbox SW | pending |
| 4 | UX/UI: theming, View Transitions, a11y, responsive | pending |
| 5 | Tests + CI: Vitest, Playwright, GitHub Actions | pending |
| 6 | Capacitor migration | pending |
| 7 | New features (TBD) | pending |

## Original app metadata

- **Version**: v4.2.0-R300
- **Manifest**: PWA, RTL, Hebrew, theme `#0a0f1e`
- **AGP**: 8.10.1
- **Signature**: Android Debug certificate (not a release key)
- **Counts**: 142 HTML, 257 JS, 92 CSS, 569 symbols
