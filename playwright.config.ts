/**
 * PIVISION Mobile — Playwright config
 * Stage 5 of the modernization plan.
 *
 * Runs e2e smoke tests against the Vite preview server. Specs live
 * under `tests/e2e/`. The webServer block boots `vite preview` so
 * `npm run test:e2e` works without an external setup step.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT || 4173);
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    // The app is RTL Hebrew; reduce-motion keeps tests deterministic.
    reducedMotion: 'reduce',
  },

  projects: [
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],

  // Boot `vite preview` for the duration of the test run. Skip on
  // CI when BASE_URL is supplied externally (e.g. against a
  // deployed preview).
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run preview -- --port ' + PORT + ' --strictPort',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
