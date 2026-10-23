import { defineConfig } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './tests',
  testMatch: 'browser.spec.ts',
  fullyParallel: true,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://127.0.0.1:4185',
    ...(executablePath ? { launchOptions: { executablePath } } : { channel: 'chrome' }),
    viewport: { width: 1000, height: 700 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev:test -- --config tests/fixture/vite.config.ts',
    url: 'http://127.0.0.1:4185',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});


