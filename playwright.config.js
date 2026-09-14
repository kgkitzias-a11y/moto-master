// Playwright end-to-end configuration for the Moto Master PWA (no build step).
// Run: npx playwright test   (a server already listening on 8123 is reused)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: 'list',
  webServer: {
    command: 'node tools/serve.js 8123',
    url: 'http://127.0.0.1:8123/',
    reuseExistingServer: true,
  },
  use: {
    ...devices['Desktop Chrome'],
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:8123/',
    viewport: { width: 390, height: 844 },
    // The app reloads itself the first time the service worker claims the page
    // (controllerchange -> location.reload()). That would tear down a session mid-test, so the
    // SW is blocked by default; offline.spec / pwa.spec opt back in with test.use().
    serviceWorkers: 'block',
    locale: 'el-GR',
    trace: 'retain-on-failure',
  },
});
