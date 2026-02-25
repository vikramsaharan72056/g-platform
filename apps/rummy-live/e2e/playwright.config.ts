import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 120000,
    fullyParallel: false, // Set to false to ensure we don't have race conditions during setup
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1, // Keep at 1 for deterministic game flow
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:8081', // Assuming Expo Web default port
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
