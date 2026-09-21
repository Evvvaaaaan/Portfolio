import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: /midnight.*\.spec\.js/,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: './test-results/midnight',
  use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: 'http://127.0.0.1:5184' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5184 --strictPort', url: 'http://127.0.0.1:5184/gallery/midnight-dispatch', reuseExistingServer: true },
})
