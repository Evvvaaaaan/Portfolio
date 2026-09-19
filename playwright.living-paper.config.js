import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config.js'

export default defineConfig({
  ...base,
  testMatch: 'living-paper.spec.js',
  projects: [
    {
      name: 'fallback',
      grep: /without experimental APIs/,
      use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--disable-blink-features=CanvasDrawElement'] } },
    },
    ...['chrome', 'chromium'].map(channel => ({
      name: `native-${channel}`,
      grep: /native HTML/,
      use: {
        ...devices['Desktop Chrome'],
        channel,
        deviceScaleFactor: 2,
        launchOptions: { args: ['--enable-blink-features=CanvasDrawElement'] },
      },
    })),
  ],
})
