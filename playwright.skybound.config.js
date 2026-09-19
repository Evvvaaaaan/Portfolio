import { platform } from 'node:os'
import base from './playwright.config.js'

export default {
  ...base,
  testMatch: '**/skybound.spec.js',
  use: { ...base.use, viewport: { width: 1440, height: 900 }, launchOptions: { args: platform() === 'darwin' ? ['--use-angle=metal'] : [] } },
}
