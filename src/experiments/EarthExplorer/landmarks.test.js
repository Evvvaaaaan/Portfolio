import { describe, it, expect } from 'vitest'
import { LANDMARKS } from './landmarks.js'

describe('LANDMARKS', () => {
  it('8개의 랜드마크를 담고 있다', () => {
    expect(LANDMARKS).toHaveLength(8)
  })

  it('id가 모두 고유하다', () => {
    const ids = LANDMARKS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('모든 좌표가 유효 범위 안에 있다', () => {
    for (const { lat, lon } of LANDMARKS) {
      expect(lat).toBeGreaterThanOrEqual(-90)
      expect(lat).toBeLessThanOrEqual(90)
      expect(lon).toBeGreaterThanOrEqual(-180)
      expect(lon).toBeLessThanOrEqual(180)
    }
  })

  it('name과 id가 모두 비어있지 않은 문자열이다', () => {
    for (const { id, name } of LANDMARKS) {
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
      expect(typeof name).toBe('string')
      expect(name.length).toBeGreaterThan(0)
    }
  })
})
