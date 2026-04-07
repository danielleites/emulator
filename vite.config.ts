import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * PIVISION Mobile — Vite configuration
 *
 * Multi-page setup mirroring the original Cordova `assets/www/` layout.
 * Source root is `www-src/`; build output goes to `dist/` and is later
 * packaged into the Capacitor/Cordova `www/` directory.
 */
export default defineConfig({
  root: 'www-src',
  base: './',
  publicDir: false,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'www-src/index.html'),
        desktop: resolve(__dirname, 'www-src/desktop.html'),
        guide: resolve(__dirname, 'www-src/guide.html'),
        qa: resolve(__dirname, 'www-src/qa/qa-app.html'),
      },
      output: {
        manualChunks: {
          vendor: ['dompurify'],
        },
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
});
