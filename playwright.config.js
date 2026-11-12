import { defineConfig } from '@playwright/test';

// End-to-end smoke tests against the production build.
// Locally they use the installed Google Chrome; CI uses Playwright's bundled Chromium.
const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173/',
    viewport: { width: 1280, height: 800 },
    ...(CI ? {} : { channel: 'chrome' }),
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
