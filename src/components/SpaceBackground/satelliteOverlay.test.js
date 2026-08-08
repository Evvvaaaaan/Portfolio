import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  publishSatellites,
  subscribeSatellites,
  getSatellites,
} from './satelliteOverlay.js'

beforeEach(() => {
  publishSatellites([])
})

describe('satelliteOverlay 스토어', () => {
  it('publish한 값을 getSatellites로 다시 읽는다', () => {
    const list = [{ slug: 'findx', title: 'FindX', x: 10, y: 20, visible: true }]
    publishSatellites(list)
    expect(getSatellites()).toEqual(list)
  })

  it('구독자는 publish마다 최신 목록을 받는다', () => {
    const seen = []
    subscribeSatellites((l) => seen.push(l))
    publishSatellites([{ slug: 'a', title: 'A', x: 1, y: 2, visible: true }])
    publishSatellites([{ slug: 'b', title: 'B', x: 3, y: 4, visible: false }])
    expect(seen).toHaveLength(2)
    expect(seen[0][0].slug).toBe('a')
    expect(seen[1][0].slug).toBe('b')
  })

  it('구독 해지 후에는 더 받지 않는다 — 언마운트된 오버레이가 계속 깨어나면 안 된다', () => {
    const fn = vi.fn()
    const off = subscribeSatellites(fn)
    publishSatellites([{ slug: 'a', title: 'A', x: 0, y: 0, visible: true }])
    off()
    publishSatellites([{ slug: 'b', title: 'B', x: 0, y: 0, visible: true }])
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('구독자가 여럿이어도 모두 받는다', () => {
    const a = vi.fn()
    const b = vi.fn()
    subscribeSatellites(a)
    subscribeSatellites(b)
    publishSatellites([])
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('한 구독자가 던져도 다른 구독자는 계속 받는다 — 렌더 루프가 멈추면 씬 전체가 죽는다', () => {
    const boom = () => {
      throw new Error('boom')
    }
    const ok = vi.fn()
    subscribeSatellites(boom)
    subscribeSatellites(ok)
    expect(() => publishSatellites([])).not.toThrow()
    expect(ok).toHaveBeenCalledTimes(1)
  })
})
