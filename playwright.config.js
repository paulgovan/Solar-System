import { defineConfig } from '@playwright/test';

// End-to-end smoke tests against the production build.
// Locally they use the installed Google Chrome; CI uses Playwright's bundled Chromium.
const CI = !!process.env.CI;
const PORT = Number(process.env.E2E_PORT || 4173); // set E2E_PORT to avoid clashes between parallel checkouts

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: CI ? 120_000 : 60_000, // GPU-less CI runners render with software GL
  retries: CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 1280, height: 800 },
    ...(CI ? {} : { channel: 'chrome' }),
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
