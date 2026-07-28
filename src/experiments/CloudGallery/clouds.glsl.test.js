import { describe, it, expect } from 'vitest'
import { CLOUD_FRAG } from './clouds.glsl'

describe('CLOUD_FRAG', () => {
  it('is a non-empty shader string', () => {
    expect(typeof CLOUD_FRAG).toBe('string')
    expect(CLOUD_FRAG.length).toBeGreaterThan(100)
  })

  it('declares every uniform the component drives', () => {
    for (const u of [
      'uRes', 'uTime', 'uCamPos', 'uCamRight', 'uCamUp',
      'uCamFwd', 'uTanFov', 'uSunDir', 'uSunColor',
    ]) {
      expect(CLOUD_FRAG).toContain(u)
    }
  })

  it('writes to gl_FragColor exactly once', () => {
    const matches = CLOUD_FRAG.match(/gl_FragColor/g) || []
    expect(matches.length).toBe(1)
  })
})
