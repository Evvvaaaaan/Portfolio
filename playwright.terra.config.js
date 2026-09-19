import { platform } from 'node:os'
import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'

export default defineConfig({
  ...base,
  testMatch: '**/terra*.spec.js',
  use: {
    ...base.use,
    // Chromium's default software WebGL path does not measure display/GPU performance.
    launchOptions: { args: platform() === 'darwin' ? ['--use-angle=metal'] : [] },
  },
})
