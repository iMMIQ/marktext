import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './benchmarks',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: [
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report-benchmark' }],
    ],
    timeout: 30 * 60_000,
    expect: { timeout: 10_000 },
    outputDir: 'test-results/benchmark-artifacts',
    use: {
        baseURL: 'http://localhost:5174',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                channel: process.env.CI || process.env.PLAYWRIGHT_USE_BUNDLED_CHROMIUM
                    ? undefined
                    : 'chrome',
                launchOptions: {
                    args: ['--enable-precise-memory-info'],
                },
            },
        },
    ],
    webServer: {
        command: 'pnpm exec vite preview --port 5174 --strictPort',
        url: 'http://localhost:5174',
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
