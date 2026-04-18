import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    testMatch: ['**/*.spec.js'],
    outputDir: './test-results',
    reporter: [['line']],
    fullyParallel: false,
    workers: 1,
    timeout: 60_000,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'off',
    },
    webServer: {
        command: 'npx web-dev-server --root-dir . --hostname 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: true,
    },
});