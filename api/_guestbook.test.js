import { describe, it, expect } from 'vitest'
import { validateEntry, hashIp, GUESTBOOK_EMOJI } from './_guestbook.js'

const valid = { nickname: 'Evan', message: 'hello there', emoji: '👋', lat: 37.5665, lng: 126.978 }

describe('validateEntry', () => {
  it('유효한 입력을 정규화하고 좌표를 소수 1자리로 반올림한다', () => {
    const r = validateEntry(valid)
    expect(r.ok).toBe(true)
    expect(r.value).toEqual({ nickname: 'Evan', message: 'hello there', emoji: '👋', lat: 37.6, lng: 127.0 })
  })

  it('이모지가 없으면 null로 정규화한다', () => {
    const r = validateEntry({ ...valid, emoji: undefined })
    expect(r.ok).toBe(true)
    expect(r.value.emoji).toBeNull()
  })

  it('닉네임/메시지가 비면 거절한다 (공백만인 경우 포함)', () => {
    expect(validateEntry({ ...valid, nickname: '  ' }).ok).toBe(false)
    expect(validateEntry({ ...valid, message: '' }).ok).toBe(false)
  })

  it('길이 초과는 cleanText 규칙대로 잘라서 수용한다', () => {
    const r = validateEntry({ ...valid, nickname: 'a'.repeat(30), message: 'b'.repeat(300) })
    expect(r.ok).toBe(true)
    expect(r.value.nickname).toHaveLength(20)
    expect(r.value.message).toHaveLength(200)
  })

  it('허용 목록에 없는 이모지는 거절한다', () => {
    expect(validateEntry({ ...valid, emoji: '🦖' }).ok).toBe(false)
  })

  it('좌표 범위를 벗어나거나 숫자가 아니면 거절한다', () => {
    expect(validateEntry({ ...valid, lat: 91 }).ok).toBe(false)
    expect(validateEntry({ ...valid, lat: -91 }).ok).toBe(false)
    expect(validateEntry({ ...valid, lng: 181 }).ok).toBe(false)
    expect(validateEntry({ ...valid, lng: -181 }).ok).toBe(false)
    expect(validateEntry({ ...valid, lat: 'abc' }).ok).toBe(false)
    expect(validateEntry({ ...valid, lat: undefined }).ok).toBe(false)
  })
})

describe('hashIp', () => {
  it('같은 입력은 같은 64자 hex, 다른 IP는 다른 해시를 낸다', () => {
    const a = hashIp('1.2.3.4', 's')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(hashIp('1.2.3.4', 's')).toBe(a)
    expect(hashIp('5.6.7.8', 's')).not.toBe(a)
  })
})

describe('GUESTBOOK_EMOJI', () => {
  it('24개의 고유한 이모지를 담고 있다', () => {
    expect(GUESTBOOK_EMOJI).toHaveLength(24)
    expect(new Set(GUESTBOOK_EMOJI).size).toBe(24)
  })
})
