/**
 * PIVISION Mobile — Playwright config
 * Stage 5 of the modernization plan.
 *
 * Runs e2e smoke tests against the Vite preview server. Specs live
 * under `tests/e2e/`. The webServer block boots `vite preview` so
 * `npm run test:e2e` works without an external setup step.
 *
 * Round-3 fix: the entire config is built up as a typed local
 * `PlaywrightTestConfig` and then handed to `defineConfig`. This
 * forces TypeScript to type-check against the published shape
 * directly instead of attempting overload resolution at the
 * `defineConfig({...})` call site, which produced an unhelpful
 * "No overload matches this call" error.
 */

import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

const PORT = Number(process.env.PORT || 4173);
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const IS_CI = !!process.env.CI;

const config: PlaywrightTestConfig = {
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 2 : undefined,
  reporter: IS_CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'he-IL',
  },

  projects: [
    {
      // Pixel 5 is in every Playwright release; Pixel 7 was added in
      // 1.39 and we want to be conservative for runners on older
      // bundled versions.
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],

  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run preview -- --port ${PORT} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: !IS_CI,
        timeout: 60_000,
      },
};

export default defineConfig(config);
