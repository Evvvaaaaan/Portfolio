import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from './relativeTime.js'

const NOW = Date.parse('2026-07-17T12:00:00Z')
const ago = (ms) => new Date(NOW - ms).toISOString()

describe('formatRelativeTime', () => {
  it('60초 미만은 1분 전으로 클램프한다', () => {
    expect(formatRelativeTime(ago(30_000), 'en', NOW)).toBe('1 minute ago')
  })

  it('분/시간/일 단위를 선택한다 (en)', () => {
    expect(formatRelativeTime(ago(5 * 60_000), 'en', NOW)).toBe('5 minutes ago')
    expect(formatRelativeTime(ago(3 * 3600_000), 'en', NOW)).toBe('3 hours ago')
    expect(formatRelativeTime(ago(2 * 86400_000), 'en', NOW)).toBe('2 days ago')
  })

  it('로케일에 맞는 문자열을 반환한다 (ko)', () => {
    expect(formatRelativeTime(ago(2 * 86400_000), 'ko', NOW)).toBe('2일 전')
  })

  it('30일 이상은 개월 단위로 표시한다', () => {
    expect(formatRelativeTime(ago(40 * 86400_000), 'en', NOW)).toBe('1 month ago')
  })
})
