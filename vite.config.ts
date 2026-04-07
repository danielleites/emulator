/// <reference types="vitest" />
//
// `defineConfig` is imported from `vitest/config` (not `vite`) so the
// `test:` block typechecks against the merged Vitest+Vite UserConfig
// type. `PluginOption` lives in `vite` proper, so it's imported from
// there separately.
//
import { defineConfig } from 'vitest/config';
import type { PluginOption } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * PIVISION Mobile — Vite configuration
 *
 * Multi-page setup mirroring the original Cordova `assets/www/` layout.
 * Source root is `www-src/`; build output goes to `dist/` and is later
 * packaged into the Capacitor/Cordova `www/` directory.
 *
 * Stage 3 brought refined chunk strategy + Workbox SW; round-3 of CI
 * fixes simplified this file to a sync config so the typecheck step
 * stops fighting with `defineConfig` overload resolution. The optional
 * `rollup-plugin-visualizer` integration was dropped here — it can be
 * re-added in stage 6 once we have a stable bundle profile.
 */

const plugins: PluginOption[] = [
  VitePWA({
    registerType: 'autoUpdate',
    strategies: 'generateSW',
    // 'auto' injects a registration snippet into every entry HTML.
    // The legacy `mobile-app.js` also calls
    // `navigator.serviceWorker.register('./sw.js')` for the
    // standalone-APK code path; double-registration is idempotent
    // so the two paths coexist safely.
    injectRegister: 'auto',
    filename: 'sw.js',
    manifestFilename: 'manifest-mobile.json',
    includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'fonts/*.{woff2,ttf}'],
    workbox: {
      globPatterns: ['**/*.{html,js,css,svg,png,ttf,woff2}'],
      // Workbox uses globIgnores (not negation in globPatterns) to
      // exclude paths from precaching. Symbols are loaded on demand
      // by the legacy `_loadSymbol` and the runtimeCaching CacheFirst
      // strategy below, so they don't need to be precached.
      globIgnores: ['**/node_modules/**/*', 'sw.js', 'workbox-*.js', 'symbols/**'],
      runtimeCaching: [
        {
          urlPattern: ({ url }) => url.pathname.includes('/symbols/'),
          handler: 'CacheFirst',
          options: {
            cacheName: 'pivision-symbols',
            expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
          },
        },
        {
          urlPattern: ({ url }) =>
            url.pathname.includes('/fonts/') || url.pathname.includes('/icons/'),
          handler: 'CacheFirst',
          options: {
            cacheName: 'pivision-static',
            expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 },
          },
        },
        {
          urlPattern: ({ request }) => request.destination === 'document',
          handler: 'NetworkFirst',
          options: {
            cacheName: 'pivision-html',
            networkTimeoutSeconds: 5,
            expiration: { maxEntries: 30 },
          },
        },
        {
          urlPattern: ({ url }) =>
            url.pathname.includes('/piwebapi') || url.pathname.includes('/api/'),
          handler: 'NetworkOnly',
        },
      ],
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/api/, /^\/piwebapi/],
      cleanupOutdatedCaches: true,
    },
    manifest: false, // we ship our own manifest-mobile.json
  }),
];

export default defineConfig({
  root: 'www-src',
  base: './',
  publicDir: false,
  plugins,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2020',
    cssCodeSplit: true,
    modulePreload: { polyfill: true },
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'www-src/index.html'),
        desktop: resolve(__dirname, 'www-src/desktop.html'),
        guide: resolve(__dirname, 'www-src/guide.html'),
        qa: resolve(__dirname, 'www-src/qa/qa-app.html'),
      },
      output: {
        manualChunks(id: string): string | undefined {
          if (id.includes('node_modules')) {
            if (id.includes('dompurify')) return 'vendor-dompurify';
            return 'vendor';
          }
          if (id.includes('/js/security/')) return 'security';
          if (id.includes('/js/af-data-layer') || id.includes('/js/af-browser')) return 'af';
          if (id.includes('/js/pi-')) return 'pi';
          if (id.includes('/js/ai-') || id.includes('/js/collab-')) return 'ai';
          if (
            id.includes('/js/ux-') ||
            id.includes('/js/accessibility') ||
            id.includes('/js/i18n')
          ) {
            return 'ux';
          }
          return undefined;
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  server: {
    port: 5173,
    open: '/index.html',
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
  test: {
    environment: 'jsdom',
    // The Vite `root` above is `www-src/`, so vitest's globs are
    // already scoped there. Using a leading `www-src/` here would
    // double up to `www-src/www-src/**` and find zero files.
    include: ['**/*.{test,spec}.{js,ts}'],
    exclude: ['**/node_modules/**', '**/dist/**', '../tests/e2e/**'],
    globals: false,
    // Setup file path is resolved relative to the Vite root.
    setupFiles: ['../tests/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'www-src/js/security/**/*.{js,ts}',
        'www-src/js/perf/**/*.{js,ts}',
        'www-src/js/ux/**/*.{js,ts}',
      ],
      exclude: ['**/*.test.{js,ts}', '**/*.spec.{js,ts}'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
});
