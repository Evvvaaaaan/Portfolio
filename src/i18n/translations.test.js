import { describe, it, expect } from 'vitest'
import { translations } from './translations.js'

const LOCALES = ['en', 'ko', 'ja', 'zh']
const LAB_KEYS = ['eyebrow', 'title', 'hint', 'arrived', 'enter', 'descending']

describe('translations.lab', () => {
  it('네 개 로케일이 모두 있다', () => {
    expect(Object.keys(translations).sort()).toEqual([...LOCALES].sort())
  })

  for (const locale of LOCALES) {
    it(`${locale}에 lab 문구가 모두 있다`, () => {
      const lab = translations[locale].lab
      expect(lab).toBeDefined()
      for (const key of LAB_KEYS) {
        expect(typeof lab[key]).toBe('string')
        expect(lab[key].length).toBeGreaterThan(0)
      }
    })
  }

  it('영어 도착 문구는 "Lab arrived"다', () => {
    expect(translations.en.lab.arrived).toBe('Lab arrived')
  })

  it('로케일마다 다른 문구를 쓴다 — 복붙 누락 방지', () => {
    const arrived = LOCALES.map((l) => translations[l].lab.arrived)
    expect(new Set(arrived).size).toBe(LOCALES.length)
  })
})
