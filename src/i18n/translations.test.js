import { describe, it, expect } from 'vitest'
import { translations } from './translations.js'

const LOCALES = ['en', 'ko', 'ja', 'zh']
const LAB_KEYS = ['eyebrow', 'title', 'hint', 'arrived', 'enter', 'descending', 'prev', 'next']

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

describe('Phase 4 내비게이션 문구', () => {
  const NAV_KEYS = ['autopilot', 'autopilotStop', 'autopilotOn', 'autopilotOff']
  const MINIMAP_KEYS = ['label', 'home']

  for (const locale of LOCALES) {
    it(`${locale}에 오토파일럿·미니맵 문구가 모두 있다`, () => {
      for (const key of NAV_KEYS) {
        expect(typeof translations[locale].nav[key]).toBe('string')
        expect(translations[locale].nav[key].length).toBeGreaterThan(0)
      }
      for (const key of MINIMAP_KEYS) {
        expect(typeof translations[locale].minimap[key]).toBe('string')
        expect(translations[locale].minimap[key].length).toBeGreaterThan(0)
      }
    })
  }

  it('로케일마다 다른 문구를 쓴다 — 복붙 누락 방지', () => {
    const labels = LOCALES.map((l) => translations[l].nav.autopilot)
    expect(new Set(labels).size).toBe(LOCALES.length)
  })

  it('영어 버튼 이름은 e2e가 접근성 이름으로 찾는 값과 정확히 같다', () => {
    expect(translations.en.nav.autopilot).toBe('Autopilot')
    expect(translations.en.nav.autopilotStop).toBe('Stop tour')
    expect(translations.en.minimap.label).toBe('System map')
  })
})

describe('Phase 6a 위성 문구', () => {
  for (const locale of LOCALES) {
    it(`${locale}에 위성 문구가 모두 있다`, () => {
      const s = translations[locale].satellites
      expect(typeof s.label).toBe('string')
      expect(s.label.length).toBeGreaterThan(0)
      expect(typeof s.open).toBe('string')
      // {title} 자리표시자가 없으면 버튼 이름에 프로젝트명이 안 들어간다.
      expect(s.open).toContain('{title}')
    })
  }

  it('로케일마다 다른 문구를 쓴다 — 복붙 누락 방지', () => {
    const labels = LOCALES.map((l) => translations[l].satellites.label)
    expect(new Set(labels).size).toBe(LOCALES.length)
  })
})
