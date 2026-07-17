import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import handler from './guestbook.js'

const ROW = {
  id: 'abc', nickname: 'Evan', message: 'hi', emoji: '👋',
  lat: 37.6, lng: 127.0, created_at: '2026-07-17T00:00:00Z', ip_hash: 'SECRET',
}

function fakeReq({ method = 'GET', body, headers = {} } = {}) {
  return { method, body, headers }
}

function fakeRes() {
  const res = { statusCode: 0, headers: {} }
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v }
  res.end = (chunk) => { res.body = chunk ? JSON.parse(chunk) : null }
  return res
}

function okJson(data) {
  return { ok: true, json: async () => data, text: async () => JSON.stringify(data) }
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('GET /api/guestbook', () => {
  it('공개 필드만 담긴 목록과 캐시 헤더를 반환한다', async () => {
    const { ip_hash: _hidden, ...publicRow } = ROW
    fetch.mockResolvedValueOnce(okJson([publicRow]))

    const res = fakeRes()
    await handler(fakeReq({ method: 'GET' }), res)

    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toContain('max-age=60')
    expect(res.body).toEqual({ ok: true, entries: [publicRow] })
    // PostgREST 쿼리가 숨김 글을 제외하고 최신순 300개를 요청하는지 확인
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('is_hidden=eq.false')
    expect(url).toContain('order=created_at.desc')
    expect(url).toContain('limit=300')
    expect(url).not.toContain('ip_hash')
  })

  it('Supabase 실패 시 500을 반환한다', async () => {
    fetch.mockResolvedValueOnce({ ok: false, text: async () => 'boom' })
    const res = fakeRes()
    await handler(fakeReq({ method: 'GET' }), res)
    expect(res.statusCode).toBe(500)
    expect(res.body.ok).toBe(false)
  })
})

describe('POST /api/guestbook', () => {
  const validBody = { nickname: 'Evan', message: 'hello', emoji: '👋', lat: 37.5665, lng: 126.978 }

  it('허니팟이 채워지면 insert 없이 성공한 척 응답한다', async () => {
    const res = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { ...validBody, website: 'spam.com' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, entry: null })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('검증 실패 시 400을 반환한다', async () => {
    const res = fakeRes()
    await handler(fakeReq({ method: 'POST', body: { ...validBody, lat: 999 } }), res)
    expect(res.statusCode).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('같은 IP로 1시간 내 3건이면 429를 반환한다', async () => {
    fetch.mockResolvedValueOnce(okJson([{ id: '1' }, { id: '2' }, { id: '3' }]))
    const res = fakeRes()
    await handler(fakeReq({ method: 'POST', body: validBody, headers: { 'x-forwarded-for': '1.2.3.4' } }), res)
    expect(res.statusCode).toBe(429)
    expect(fetch).toHaveBeenCalledTimes(1) // 카운트 조회만, insert 없음
  })

  it('성공 시 반올림된 좌표로 insert하고 ip_hash 없는 공개 필드를 반환한다', async () => {
    fetch
      .mockResolvedValueOnce(okJson([]))     // 레이트 리밋 조회
      .mockResolvedValueOnce(okJson([ROW]))  // insert 응답
    const res = fakeRes()
    await handler(fakeReq({ method: 'POST', body: validBody, headers: { 'x-forwarded-for': '1.2.3.4' } }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.entry).not.toHaveProperty('ip_hash')
    expect(res.body.entry.id).toBe('abc')

    const insertPayload = JSON.parse(fetch.mock.calls[1][1].body)
    expect(insertPayload.lat).toBe(37.6)
    expect(insertPayload.lng).toBe(127.0)
    expect(insertPayload.ip_hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('기타 메서드', () => {
  it('PUT은 405를 반환한다', async () => {
    const res = fakeRes()
    await handler(fakeReq({ method: 'PUT' }), res)
    expect(res.statusCode).toBe(405)
  })
})
