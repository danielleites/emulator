/// <reference types="vitest" />
// `defineConfig` is imported from `vitest/config` (not `vite`) so the
// `test:` block typechecks alongside the regular Vite UserConfig keys.
import { defineConfig, type PluginOption } from 'vitest/config';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * PIVISION Mobile — Vite configuration
 *
 * Multi-page setup mirroring the original Cordova `assets/www/` layout.
 * Source root is `www-src/`; build output goes to `dist/` and is later
 * packaged into the Capacitor/Cordova `www/` directory.
 *
 * Stage 3: chunk strategy refined to keep vendor code, security
 * helpers, and the legacy bundles in separate chunks. The Workbox-
 * generated service worker replaces the manual `sw.js` for the Vite
 * build path; the manual `sw.js` is kept for the standalone-APK
 * build path (see README → "Service worker").
 */

const ANALYZE = process.env.ANALYZE === '1';

export default defineConfig(async () => {
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
        globPatterns: [
          '**/*.{html,js,css,svg,png,ttf,woff2}',
          '!symbols/**', // symbols precached on-demand at runtime
        ],
        // Symbol files are versioned via ?v= query strings → cache-first.
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

  if (ANALYZE) {
    // Lazy-import so the dep is optional.
    try {
      const { visualizer } = await import('rollup-plugin-visualizer');
      plugins.push(
        visualizer({
          filename: 'dist/bundle-stats.html',
          gzipSize: true,
          brotliSize: true,
          template: 'treemap',
        }) as PluginOption
      );
    } catch {
      // eslint-disable-next-line no-console
      console.warn('[vite] rollup-plugin-visualizer not installed; ANALYZE=1 ignored');
    }
  }

  return {
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
          manualChunks(id) {
            // node_modules → vendor chunk
            if (id.includes('node_modules')) {
              if (id.includes('dompurify')) return 'vendor-dompurify';
              return 'vendor';
            }
            // Security helpers — small, hot, share between routes
            if (id.includes('/js/security/')) return 'security';
            // Legacy AF data layer
            if (id.includes('/js/af-data-layer') || id.includes('/js/af-browser')) return 'af';
            // PI connector / adapter / sim
            if (id.includes('/js/pi-')) return 'pi';
            // AI / collab UI bundles
            if (id.includes('/js/ai-') || id.includes('/js/collab-')) return 'ai';
            // UX layer
            if (id.includes('/js/ux-') || id.includes('/js/accessibility') || id.includes('/js/i18n')) return 'ux';
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
      include: ['www-src/**/*.{test,spec}.{js,ts}'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        'tests/e2e/**', // playwright handles e2e
      ],
      globals: false,
      setupFiles: ['./tests/vitest.setup.ts'],
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
          // Phased rollout — these get tightened in subsequent stages.
          lines: 70,
          functions: 70,
          branches: 60,
          statements: 70,
        },
      },
    },
  };
});
