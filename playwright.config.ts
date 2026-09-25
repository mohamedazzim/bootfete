import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'tests/reports/playwright-report' }],
    ['json', { outputFile: 'tests/reports/playwright-results.json' }],
    ['junit', { outputFile: 'tests/reports/playwright-junit.xml' }]
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: false,
    // The remote Neon DB adds latency to every API call the pages make;
    // give assertions comfortable room.
    expect: { timeout: 15000 },
  },
  outputDir: 'tests/reports/test-results',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Pin the port explicitly: the app's .env may set PORT for deployment,
    // but E2E must run against a known URL.
    command: 'cross-env PORT=5000 npm run dev',
    url: 'http://localhost:5000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
