import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT || 5173);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm --filter @bpmn/api-server dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: {
      ENABLE_TEST_AUTH: 'true',
      NODE_ENV: 'test',
    },
  },
});
