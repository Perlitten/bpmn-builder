import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT || 5173);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'pnpm --filter @bpmn/api-server dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: {
      ENABLE_TEST_AUTH: 'true',
      NODE_ENV: 'test',
      DB_PROVIDER: process.env.DB_PROVIDER || 'sqlite',
      DATABASE_URL: process.env.DATABASE_URL || 'file:./data/e2e.db',
      SESSION_SECRET: process.env.SESSION_SECRET || 'e2e-test-session-secret-at-least-16-chars',
    },
  },
});
