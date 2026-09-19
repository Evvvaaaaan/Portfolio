import { platform } from 'node:os'
import base from './playwright.config.js'

export default {
  ...base,
  testMatch: '**/curvature.spec.js',
  use: { ...base.use, launchOptions: { args: platform() === 'darwin' ? ['--use-angle=metal'] : [] } },
}
