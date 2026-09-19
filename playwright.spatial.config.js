import { defineConfig, devices } from '@playwright/test'
import process from 'node:process'

const baseURL = process.env.SPATIAL_TEST_URL || 'http://127.0.0.1:5175'

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'spatial-studio.spec.js',
  timeout: 120_000,
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome',
    launchOptions: { args: ['--enable-webgl', '--ignore-gpu-blocklist'] } } }],
  webServer: process.env.SPATIAL_TEST_URL ? undefined : { command: 'npm run dev -- --host 127.0.0.1 --port 5175',
    url: 'http://127.0.0.1:5175/spatial', reuseExistingServer: true },
})
