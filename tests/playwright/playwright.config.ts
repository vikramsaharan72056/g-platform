import { defineConfig, devices } from '@playwright/test';

const reuseExistingServer = !process.env.CI;

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  timeout: 120 * 1000,
  globalTimeout: 45 * 60 * 1000,
  expect: {
    timeout: 15 * 1000,
  },
  reporter: [
    ['list'],
    ['json', { outputFile: 'tests/playwright/results/results.json' }],
    ['html', { outputFolder: 'tests/playwright/results/html', open: 'never' }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15 * 1000,
    navigationTimeout: 45 * 1000,
  },
  projects: [
    {
      name: 'admin-web',
      testMatch: /admin-functional\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5173',
      },
    },
    {
      name: 'mobile-web',
      testMatch: /mobile-functional\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:19006',
      },
    },
  ],
  webServer: [
    {
      command: 'npm run api:dev',
      port: 3000,
      timeout: 180 * 1000,
      reuseExistingServer,
    },
    {
      command: 'npm run admin:dev',
      port: 5173,
      timeout: 180 * 1000,
      reuseExistingServer,
    },
    {
      command: 'npm run mobile:web:test',
      port: 19006,
      timeout: 240 * 1000,
      reuseExistingServer,
      env: {
        EXPO_PUBLIC_API_URL: 'http://localhost:3000',
      },
    },
  ],
});

