# Guestbook Globe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/guestbook` page where visitors pick a spot on an interactive 3D globe, leave a short message, and browse other visitors' messages as glowing star pins, persisted in Supabase.

**Architecture:** The client never talks to Supabase directly. A Vercel serverless function `api/guestbook.js` handles GET (list) and POST (create) using the existing PostgREST-over-fetch pattern in `api/_utils.js` with the service-role key. The globe is raw three.js + OrbitControls (the codebase pattern — see `src/experiments/SolarSystem/SolarSystem.jsx`; R3F is installed but unused, do NOT use it). Continents are a dot matrix sampled at runtime from a small bundled equirectangular land-mask PNG.

**Tech Stack:** React 19, Vite, three.js (`three` + `three/addons/controls/OrbitControls.js`), Vercel serverless functions (plain Node handlers), Supabase PostgREST, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-17-guestbook-globe-design.md`

## Global Constraints

- **No new npm dependencies.** Everything uses what's already in `package.json`.
- **Raw three.js, not @react-three/fiber** — match `SolarSystem.jsx` / `DeepSpace.jsx` patterns.
- Nickname ≤ **20** chars; message ≤ **200** chars; emoji optional, must be in the curated 24-emoji set.
- Coordinates rounded **server-side to 1 decimal place** (`Math.round(v * 10) / 10`).
- GET returns newest **300** non-hidden entries; public fields only (`id, nickname, message, emoji, lat, lng, created_at`) — `ip_hash` must never be returned.
- Rate limit: max **3 entries per ip_hash per hour** → HTTP 429.
- Honeypot field name: `website` — if filled, respond `200 {ok:true, entry:null}` without inserting (pretend success).
- i18n: all user-facing strings in **en/ko/ja/zh** in `src/i18n/translations.js`.
- Respect `prefers-reduced-motion`: skip camera intro and auto-spin.
- Commit messages: conventional commits (`feat:`, `test:`, `docs:`), English.
- All shell commands run from the repo root `/Users/evan/Desktop/02_project_dev/dev/evan-portfolio`.

---

### Task 1: Geo conversion utilities (lat/lng ↔ 3D)

**Files:**
- Create: `src/pages/Guestbook/geo.js`
- Test: `src/pages/Guestbook/geo.test.js`

**Interfaces:**
- Produces: `latLngToVector3(lat, lng, r = 1) → [x, y, z]` (plain array, three.js Y-up convention), `vector3ToLatLng(x, y, z) → [lat, lng]` (degrees, lng normalized to [-180, 180]). Used by Tasks 5–6.

- [ ] **Step 1: Write the failing test**

Create `src/pages/Guestbook/geo.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { latLngToVector3, vector3ToLatLng } from './geo.js'

describe('latLngToVector3', () => {
  it('경도 0, 위도 0은 +x 축 위의 점이 된다', () => {
    const [x, y, z] = latLngToVector3(0, 0)
    expect(x).toBeCloseTo(1, 5)
    expect(y).toBeCloseTo(0, 5)
    expect(z).toBeCloseTo(0, 5)
  })

  it('북극(위도 90)은 +y 축 위의 점이 된다', () => {
    const [x, y, z] = latLngToVector3(90, 0)
    expect(x).toBeCloseTo(0, 5)
    expect(y).toBeCloseTo(1, 5)
    expect(z).toBeCloseTo(0, 5)
  })

  it('반지름 인자를 곱한 크기의 벡터를 반환한다', () => {
    const [x, y, z] = latLngToVector3(37.5, 127, 2)
    expect(Math.hypot(x, y, z)).toBeCloseTo(2, 5)
  })
})

describe('vector3ToLatLng (라운드트립)', () => {
  const cases = [
    [37.5, 127],    // 서울
    [-33.9, 151.2], // 시드니
    [52.5, 13.4],   // 베를린
    [0, -180],      // 날짜변경선
    [-89, 45],      // 남극 근처
  ]
  it.each(cases)('(%f, %f) 좌표가 변환 후 복원된다', (lat, lng) => {
    const [x, y, z] = latLngToVector3(lat, lng)
    const [rlat, rlng] = vector3ToLatLng(x, y, z)
    expect(rlat).toBeCloseTo(lat, 4)
    // 경도는 -180/180이 같은 지점 — 정규화 차이를 허용
    const dLng = Math.abs(((rlng - lng + 540) % 360) - 180)
    expect(dLng).toBeCloseTo(0, 4)
  })

  it('반지름이 1이 아닌 벡터도 올바른 위경도를 반환한다', () => {
    const [x, y, z] = latLngToVector3(37.5, 127, 3)
    const [rlat, rlng] = vector3ToLatLng(x, y, z)
    expect(rlat).toBeCloseTo(37.5, 4)
    expect(rlng).toBeCloseTo(127, 4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/Guestbook/geo.test.js`
Expected: FAIL — `Failed to load ... geo.js` (module does not exist)

- [ ] **Step 3: Write the implementation**

Create `src/pages/Guestbook/geo.js`:

```js
const DEG = Math.PI / 180

// 위경도(도) → 반지름 r 구면 위 3D 좌표 (three.js Y-up).
// 경도 0 = +x, 동경으로 갈수록 -z 방향으로 감긴다.
export function latLngToVector3(lat, lng, r = 1) {
  const phi = (90 - lat) * DEG    // 극각
  const theta = (lng + 180) * DEG // 방위각
  return [
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ]
}

// 구면 위 3D 좌표 → [lat, lng] (도). 경도는 [-180, 180]으로 정규화.
export function vector3ToLatLng(x, y, z) {
  const r = Math.hypot(x, y, z)
  const lat = 90 - Math.acos(y / r) / DEG
  const lng = Math.atan2(z, -x) / DEG - 180
  return [lat, ((lng + 540) % 360) - 180]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/Guestbook/geo.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/pages/Guestbook/geo.js src/pages/Guestbook/geo.test.js
git commit -m "feat(guestbook): add lat/lng to 3D sphere conversion utils"
```

---

### Task 2: Relative time formatter

**Files:**
- Create: `src/pages/Guestbook/relativeTime.js`
- Test: `src/pages/Guestbook/relativeTime.test.js`

**Interfaces:**
- Produces: `formatRelativeTime(iso, lang = 'en', now = Date.now()) → string` (e.g. `'3 days ago'`, `'3일 전'`). Uses built-in `Intl.RelativeTimeFormat` — no library. Used by Task 6.

- [ ] **Step 1: Write the failing test**

Create `src/pages/Guestbook/relativeTime.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/Guestbook/relativeTime.test.js`
Expected: FAIL — module does not exist

- [ ] **Step 3: Write the implementation**

Create `src/pages/Guestbook/relativeTime.js`:

```js
const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]

// ISO 시각 → '3일 전' 같은 로케일별 상대 시간. 미래/방금은 1분 전으로 클램프.
export function formatRelativeTime(iso, lang = 'en', now = Date.now()) {
  const diffSec = Math.max(60, Math.round((now - new Date(iso).getTime()) / 1000))
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'always' })
  for (const [unit, sec] of UNITS) {
    if (diffSec >= sec) return rtf.format(-Math.floor(diffSec / sec), unit)
  }
  return rtf.format(-1, 'minute')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/Guestbook/relativeTime.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/pages/Guestbook/relativeTime.js src/pages/Guestbook/relativeTime.test.js
git commit -m "feat(guestbook): add locale-aware relative time formatter"
```

---

### Task 3: Emoji set + server-side validation helpers

**Files:**
- Create: `src/pages/Guestbook/emoji.js`
- Create: `api/_guestbook.js`
- Test: `api/_guestbook.test.js`
- Modify: `vitest.config.js` (add `api/**/*.test.js` to include)

**Interfaces:**
- Consumes: `cleanText(value, max)` from `api/_utils.js` (exists — trims and slices to max).
- Produces:
  - `GUESTBOOK_EMOJI: string[]` (24 emoji) from `src/pages/Guestbook/emoji.js` — shared by the client picker (Task 6) and server validation.
  - `validateEntry(body) → { ok: true, value: { nickname, message, emoji, lat, lng } } | { ok: false, error: string }` from `api/_guestbook.js` — coords already rounded to 1 decimal in `value`.
  - `hashIp(ip, salt?) → string` (64-char sha256 hex; salt defaults to `process.env.GUESTBOOK_IP_SALT || 'guestbook'`).

Files in `api/` starting with `_` are not exposed as endpoints by Vercel — that's why the helper lives in `api/_guestbook.js`.

- [ ] **Step 1: Create the shared emoji module** (data only, no logic — no test needed)

Create `src/pages/Guestbook/emoji.js`:

```js
// 방명록에서 선택 가능한 이모지. 클라이언트 피커와 서버 검증(api/_guestbook.js)이 공유한다.
export const GUESTBOOK_EMOJI = [
  '👋', '❤️', '✨', '🌏', '🚀', '🌙', '⭐', '🔥',
  '🎉', '😊', '😎', '🤖', '🐱', '🌸', '☕', '🎧',
  '💻', '🍀', '🌈', '🍕', '⚡', '🎮', '👾', '🛸',
]
```

- [ ] **Step 2: Add api tests to vitest include**

In `vitest.config.js`, change:

```js
    include: ['src/**/*.test.{js,jsx}'],
```

to:

```js
    include: ['src/**/*.test.{js,jsx}', 'api/**/*.test.js'],
```

- [ ] **Step 3: Write the failing test**

Create `api/_guestbook.test.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run api/_guestbook.test.js`
Expected: FAIL — `api/_guestbook.js` does not exist

- [ ] **Step 5: Write the implementation**

Create `api/_guestbook.js`:

```js
import { createHash } from 'node:crypto'
import { cleanText } from './_utils.js'
import { GUESTBOOK_EMOJI } from '../src/pages/Guestbook/emoji.js'

export { GUESTBOOK_EMOJI }

function roundCoord(v) {
  return Math.round(v * 10) / 10
}

// 방명록 POST 본문 검증. 성공 시 좌표가 소수 1자리로 반올림된 정규화 값을 돌려준다.
export function validateEntry(body) {
  const nickname = cleanText(body.nickname, 20)
  const message = cleanText(body.message, 200)
  const emoji = body.emoji ? String(body.emoji) : null
  const lat = Number(body.lat)
  const lng = Number(body.lng)

  if (!nickname) return { ok: false, error: 'nickname' }
  if (!message) return { ok: false, error: 'message' }
  if (emoji && !GUESTBOOK_EMOJI.includes(emoji)) return { ok: false, error: 'emoji' }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { ok: false, error: 'lat' }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { ok: false, error: 'lng' }

  return { ok: true, value: { nickname, message, emoji, lat: roundCoord(lat), lng: roundCoord(lng) } }
}

// 레이트 리밋용 IP 해시. 원본 IP는 저장하지 않는다.
export function hashIp(ip, salt = process.env.GUESTBOOK_IP_SALT || 'guestbook') {
  return createHash('sha256').update(`${ip}${salt}`).digest('hex')
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run api/_guestbook.test.js`
Expected: PASS, 9 tests

- [ ] **Step 7: Run the whole unit suite (기존 테스트 포함 회귀 확인)**

Run: `npm test`
Expected: PASS, 0 failures (includes pre-existing tests)

- [ ] **Step 8: Commit**

```bash
git add src/pages/Guestbook/emoji.js api/_guestbook.js api/_guestbook.test.js vitest.config.js
git commit -m "feat(guestbook): add entry validation, ip hashing, shared emoji set"
```

---

### Task 4: Supabase table SQL + API endpoint

**Files:**
- Create: `supabase/guestbook_entries.sql`
- Modify: `api/_utils.js` (append `selectSupabase` after `insertSupabase`)
- Create: `api/guestbook.js`
- Test: `api/guestbook.test.js`

**Interfaces:**
- Consumes: `sendJson`, `readJson`, `insertSupabase` from `api/_utils.js`; `validateEntry`, `hashIp` from `api/_guestbook.js` (Task 3).
- Produces:
  - `selectSupabase(table, query) → Promise<rows[]>` in `api/_utils.js` (GET `rest/v1/<table>?<query>` with service key headers).
  - HTTP `GET /api/guestbook` → `200 { ok: true, entries: [{ id, nickname, message, emoji, lat, lng, created_at }] }` with `Cache-Control: public, max-age=60, s-maxage=60`.
  - HTTP `POST /api/guestbook` with `{ nickname, message, emoji?, lat, lng, website? }` → `200 { ok: true, entry: {...public fields} }`, or `400/429/500 { ok: false, error }`. Task 6's client calls both.

- [ ] **Step 1: Write the DDL file** (applied manually — see Step 8)

Create `supabase/guestbook_entries.sql`:

```sql
-- 방명록 테이블. Supabase SQL Editor에서 1회 실행.
create table if not exists public.guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nickname text not null,
  message text not null,
  emoji text,
  lat numeric not null,
  lng numeric not null,
  ip_hash text,
  is_hidden boolean not null default false
);

-- RLS 활성화 + 정책 없음 = anon 키 접근 전면 차단.
-- 접근은 service role 키(RLS 우회)를 쓰는 서버리스 함수만 가능.
alter table public.guestbook_entries enable row level security;

create index if not exists guestbook_entries_created_at_idx
  on public.guestbook_entries (created_at desc);

create index if not exists guestbook_entries_ip_hash_idx
  on public.guestbook_entries (ip_hash, created_at desc);
```

- [ ] **Step 2: Add `selectSupabase` to `api/_utils.js`**

Append after the existing `insertSupabase` function (which ends at line 67):

```js
export async function selectSupabase(table, query) {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Supabase select failed: ${errorText}`)
  }

  return response.json()
}
```

- [ ] **Step 3: Write the failing handler tests**

Create `api/guestbook.test.js`. The handler is tested by stubbing `globalThis.fetch` (both `selectSupabase` and `insertSupabase` go through it) and driving fake `req`/`res` objects:

```js
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run api/guestbook.test.js`
Expected: FAIL — `api/guestbook.js` does not exist

- [ ] **Step 5: Write the handler**

Create `api/guestbook.js`:

```js
import { insertSupabase, readJson, selectSupabase, sendJson } from './_utils.js'
import { hashIp, validateEntry } from './_guestbook.js'

const TABLE = 'guestbook_entries'
const PUBLIC_FIELDS = 'id,nickname,message,emoji,lat,lng,created_at'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  sendJson(res, 405, { ok: false, error: 'Method not allowed' })
}

async function handleGet(req, res) {
  try {
    const entries = await selectSupabase(
      TABLE,
      `select=${PUBLIC_FIELDS}&is_hidden=eq.false&order=created_at.desc&limit=300`,
    )
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60')
    sendJson(res, 200, { ok: true, entries })
  } catch (error) {
    console.error('Guestbook GET error:', error)
    sendJson(res, 500, { ok: false, error: 'Failed to load guestbook' })
  }
}

async function handlePost(req, res) {
  try {
    const body = await readJson(req)

    // 허니팟: 봇이 채우는 숨김 필드. 채워져 있으면 저장 없이 성공한 척한다.
    if (body.website) {
      sendJson(res, 200, { ok: true, entry: null })
      return
    }

    const result = validateEntry(body)
    if (!result.ok) {
      sendJson(res, 400, { ok: false, error: `Invalid field: ${result.error}` })
      return
    }

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
    const ipHash = hashIp(ip)

    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
    const recent = await selectSupabase(
      TABLE,
      `select=id&ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(oneHourAgo)}&limit=3`,
    )
    if (recent.length >= 3) {
      sendJson(res, 429, { ok: false, error: 'Rate limit exceeded' })
      return
    }

    const [row] = await insertSupabase(TABLE, { ...result.value, ip_hash: ipHash })
    const { id, nickname, message, emoji, lat, lng, created_at } = row
    sendJson(res, 200, { ok: true, entry: { id, nickname, message, emoji, lat, lng, created_at } })
  } catch (error) {
    console.error('Guestbook POST error:', error)
    sendJson(res, 500, { ok: false, error: 'Failed to save entry' })
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run api/guestbook.test.js`
Expected: PASS, 7 tests

- [ ] **Step 7: Run the whole unit suite**

Run: `npm test`
Expected: PASS, 0 failures

- [ ] **Step 8: 🖐 MANUAL ACTION — create the table in Supabase**

The executor cannot run DDL against Supabase (service key only speaks PostgREST, not SQL). Ask the user to paste the contents of `supabase/guestbook_entries.sql` into the Supabase Dashboard → SQL Editor and run it. **Do not block on this** — continue with Task 5; flag it in the final report if still pending.

- [ ] **Step 9: Commit**

```bash
git add supabase/guestbook_entries.sql api/_utils.js api/guestbook.js api/guestbook.test.js
git commit -m "feat(guestbook): add guestbook API endpoint with rate limiting"
```

---

### Task 5: Land-mask asset + globe component

**Files:**
- Create: `src/assets/earth-land-mask.png` (generated, committed binary)
- Create: `src/pages/Guestbook/landDots.js`
- Create: `src/pages/Guestbook/GuestbookGlobe.jsx`

**Interfaces:**
- Consumes: `latLngToVector3`, `vector3ToLatLng` from `./geo.js` (Task 1).
- Produces: default-export React component `<GuestbookGlobe entries={[]} tempPin={null|{lat,lng}} onPickLocation={(lat,lng)=>{}} onPickPin={(entry)=>{}} />`. `entries` is the API's public-field array sorted newest-first (`entries[0]` is rendered as the pulsing "latest" pin and targeted by the intro rotation). Renders a full-size canvas inside `<div className="gb-canvas">`. Used by Task 6.

No unit tests here (WebGL + image decoding need a browser) — behavior is covered by the Playwright test in Task 7 and the build check below.

- [ ] **Step 1: Generate the land-mask PNG**

The three.js repo ships NASA-derived planet textures (public domain imagery). The specular map has bright oceans and dark land — ideal for masking. Download and downscale with macOS `sips`:

```bash
curl -fsSL -o /tmp/earth_specular_2048.jpg \
  https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_specular_2048.jpg
sips -z 250 500 -s format png /tmp/earth_specular_2048.jpg \
  --out src/assets/earth-land-mask.png
```

Expected: `src/assets/earth-land-mask.png` exists, roughly 500×250, under ~150 KB.
If the URL 404s (path moved), fetch the same file from a release tag instead: `https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/planets/earth_specular_2048.jpg`.

Verify: `sips -g pixelWidth -g pixelHeight src/assets/earth-land-mask.png` → 500 / 250.

- [ ] **Step 2: Write the land-dot sampler**

Create `src/pages/Guestbook/landDots.js`:

```js
import { latLngToVector3 } from './geo.js'

// 등장방형(equirectangular) 마스크 이미지를 샘플링해 육지 도트의 구면 좌표를 만든다.
// specular 맵 기준: 바다가 밝고 육지가 어둡다 → 어두운 픽셀 = 육지.
export function loadLandDots(imageUrl, { radius = 1, step = 2, threshold = 90 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, img.width, img.height)

      const positions = []
      for (let py = 0; py < img.height; py += step) {
        for (let px = 0; px < img.width; px += step) {
          const i = (py * img.width + px) * 4
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
          if (brightness < threshold) {
            const lat = 90 - (py / img.height) * 180
            const lng = (px / img.width) * 360 - 180
            positions.push(...latLngToVector3(lat, lng, radius))
          }
        }
      }
      resolve(new Float32Array(positions))
    }
    img.onerror = reject
    img.src = imageUrl
  })
}
```

- [ ] **Step 3: Write the globe component**

Create `src/pages/Guestbook/GuestbookGlobe.jsx`:

```jsx
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { latLngToVector3, vector3ToLatLng } from './geo.js'
import { loadLandDots } from './landDots.js'
import landMaskUrl from '../../assets/earth-land-mask.png'

const GLOBE_R = 1
const PIN_R = 1.03
const INTRO_MS = 1800
const PIN_SCALE = 0.06
const LATEST_SCALE = 0.1

function makeGlowTexture(inner, outer) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, inner)
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function makePinSprite(texture, entry) {
  const material = new THREE.SpriteMaterial({
    map: texture,
    blending: THREE.AdditiveBlending,
    depthWrite: false, // 구가 depth를 쓰므로 뒷면 핀은 자동으로 가려진다
    transparent: true,
  })
  const sprite = new THREE.Sprite(material)
  const [x, y, z] = latLngToVector3(entry.lat, entry.lng, PIN_R)
  sprite.position.set(x, y, z)
  sprite.scale.setScalar(PIN_SCALE)
  sprite.userData.entry = entry
  return sprite
}

export default function GuestbookGlobe({ entries, tempPin, onPickLocation, onPickPin }) {
  const mountRef = useRef(null)
  const stateRef = useRef(null)
  // 콜백을 ref로 들고 있어 장면 재구성 없이 최신 콜백을 쓴다
  const callbacksRef = useRef({})
  callbacksRef.current = { onPickLocation, onPickPin }

  // 장면 구성 (마운트 시 1회)
  useEffect(() => {
    const mount = mountRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 100)
    camera.position.set(0, 0.4, 3.2)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 1.7
    controls.maxDistance = 5
    controls.rotateSpeed = 0.55

    const globe = new THREE.Group()
    scene.add(globe)

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_R, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x0a101f }),
    )
    globe.add(sphere)

    loadLandDots(landMaskUrl, { radius: GLOBE_R + 0.005, step: 2 })
      .then((positions) => {
        if (!stateRef.current) return // 이미 언마운트됨
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        const dots = new THREE.Points(geo, new THREE.PointsMaterial({
          color: 0x7fa8ff,
          size: 0.012,
          transparent: true,
          opacity: 0.85,
        }))
        globe.add(dots)
      })
      .catch(() => {}) // 마스크 로드 실패 시 도트 없이 구만 표시

    const pinGroup = new THREE.Group()
    globe.add(pinGroup)

    const glowTex = makeGlowTexture('rgba(160,200,255,0.9)', 'rgba(80,120,255,0)')
    const tempTex = makeGlowTexture('rgba(255,210,140,0.9)', 'rgba(255,140,60,0)')

    // 클릭과 드래그 회전을 이동 거리로 구분한다
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let downAt = null
    let lastInteract = 0

    const onPointerDown = (e) => {
      downAt = { x: e.clientX, y: e.clientY }
      lastInteract = performance.now()
    }
    const onPointerUp = (e) => {
      lastInteract = performance.now()
      if (!downAt) return
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y)
      downAt = null
      if (moved > 6) return

      const rect = renderer.domElement.getBoundingClientRect()
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)

      const pinHits = raycaster.intersectObjects(pinGroup.children)
      if (pinHits.length > 0) {
        callbacksRef.current.onPickPin?.(pinHits[0].object.userData.entry)
        return
      }
      const sphereHits = raycaster.intersectObject(sphere)
      if (sphereHits.length > 0) {
        const local = globe.worldToLocal(sphereHits[0].point.clone())
        const [lat, lng] = vector3ToLatLng(local.x, local.y, local.z)
        callbacksRef.current.onPickLocation?.(lat, lng)
      }
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', onResize)

    const state = {
      globe, pinGroup, glowTex, tempTex, reduced,
      latestSprite: null, tempSprite: null, intro: null, introPlayed: false,
    }
    stateRef.current = state

    let raf
    const animate = () => {
      raf = requestAnimationFrame(animate)
      const t = performance.now()

      if (state.intro) {
        // 페이지 진입 인트로: 최신 핀이 정면을 향할 때까지 slerp
        const k = Math.min((t - state.intro.start) / INTRO_MS, 1)
        const ease = 1 - Math.pow(1 - k, 3)
        globe.quaternion.slerpQuaternions(state.intro.from, state.intro.to, ease)
        if (k >= 1) state.intro = null
      } else if (!state.reduced && t - lastInteract > 3000) {
        globe.rotateY(0.0009) // 유휴 시 슬로우 스핀
      }

      if (state.latestSprite) {
        state.latestSprite.scale.setScalar(LATEST_SCALE * (1 + 0.22 * Math.sin(t / 320)))
      }
      if (state.tempSprite) {
        state.tempSprite.scale.setScalar(PIN_SCALE * 1.4 * (1 + 0.15 * Math.sin(t / 200)))
      }

      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      stateRef.current = null
    }
  }, [])

  // entries → 핀 동기화 + 첫 로드 시 인트로 예약
  useEffect(() => {
    const state = stateRef.current
    if (!state) return

    for (const child of [...state.pinGroup.children]) {
      child.material.dispose()
      state.pinGroup.remove(child)
    }
    state.latestSprite = null

    entries.forEach((entry, i) => {
      const sprite = makePinSprite(state.glowTex, entry)
      if (i === 0) {
        sprite.scale.setScalar(LATEST_SCALE)
        state.latestSprite = sprite
      }
      state.pinGroup.add(sprite)
    })

    if (entries.length > 0 && !state.introPlayed && !state.reduced) {
      state.introPlayed = true
      const [x, y, z] = latLngToVector3(entries[0].lat, entries[0].lng, 1)
      state.intro = {
        from: state.globe.quaternion.clone(),
        to: new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(x, y, z).normalize(),
          new THREE.Vector3(0, 0.12, 1).normalize(), // 카메라 방향(살짝 위)
        ),
        start: performance.now(),
      }
    }
  }, [entries])

  // 작성 위치 임시 핀 동기화 (pinGroup 밖에 두어 핀 클릭 레이캐스트에서 제외)
  useEffect(() => {
    const state = stateRef.current
    if (!state) return

    if (state.tempSprite) {
      state.globe.remove(state.tempSprite)
      state.tempSprite.material.dispose()
      state.tempSprite = null
    }
    if (tempPin) {
      const sprite = makePinSprite(state.tempTex, tempPin)
      sprite.userData.entry = null
      state.globe.add(sprite)
      state.tempSprite = sprite
    }
  }, [tempPin])

  return <div ref={mountRef} className="gb-canvas" />
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: exits 0. (The component isn't routed yet — this checks syntax/imports and that the PNG resolves as a Vite asset.)

Run: `npm run lint`
Expected: 0 errors on the new files.

- [ ] **Step 5: Commit**

```bash
git add src/assets/earth-land-mask.png src/pages/Guestbook/landDots.js src/pages/Guestbook/GuestbookGlobe.jsx
git commit -m "feat(guestbook): add dot-matrix globe component with star pins"
```

---

### Task 6: Guestbook page, i18n, route, navbar link

**Files:**
- Create: `src/pages/Guestbook/Guestbook.jsx`
- Create: `src/pages/Guestbook/Guestbook.css`
- Modify: `src/i18n/translations.js` (add `nav.guestbook` + `guestbook` section to all 4 langs)
- Modify: `src/App.jsx` (route, footer suppression, scroll lock)
- Modify: `src/components/Navbar/Navbar.jsx` (desktop + mobile links)

**Interfaces:**
- Consumes: `GuestbookGlobe` (Task 5), `GUESTBOOK_EMOJI` (Task 3), `formatRelativeTime` (Task 2), `useLang` from `src/context/LangContext`, API contract from Task 4.
- Produces: `/guestbook` route rendering the page. CSS class names used by the e2e test (Task 7): `.gb-canvas`, `.gb-form`, `.gb-toast`, `.gb-card`.

- [ ] **Step 1: Add i18n strings**

In `src/i18n/translations.js`, for **each** of the four language objects:

1. Add `guestbook` to `nav` (after `contact`, before `hire`):
   - en: `guestbook: 'Guestbook',`
   - ko: `guestbook: '방명록',`
   - ja: `guestbook: 'ゲストブック',`
   - zh: `guestbook: '留言板',`

2. Add a top-level `guestbook` section right before each language's `footer` line.

en:

```js
    guestbook: {
      title: 'Guestbook',
      hint: 'Click anywhere on the globe to leave your mark',
      loadError: 'Could not load messages.',
      retry: 'Retry',
      form: {
        title: 'Leave a message',
        nickname: 'Nickname', nicknamePH: 'Your nickname',
        message: 'Message', messagePH: 'Leave a short message...',
        emoji: 'Mood (optional)',
        submit: 'Pin it', sending: 'Pinning...',
        cancel: 'Cancel',
        success: 'Your star is now on the globe!',
        errorInvalid: 'Please fill in a nickname and message.',
        errorRate: 'Too many messages — please try again in an hour.',
        errorServer: 'Something went wrong. Please try again.',
      },
    },
```

ko:

```js
    guestbook: {
      title: '방명록',
      hint: '지구를 클릭해 흔적을 남겨보세요',
      loadError: '메시지를 불러오지 못했습니다.',
      retry: '다시 시도',
      form: {
        title: '메시지 남기기',
        nickname: '닉네임', nicknamePH: '닉네임을 입력하세요',
        message: '메시지', messagePH: '짧은 메시지를 남겨주세요...',
        emoji: '기분 (선택)',
        submit: '남기기', sending: '남기는 중...',
        cancel: '취소',
        success: '당신의 별이 지구에 새겨졌습니다!',
        errorInvalid: '닉네임과 메시지를 입력해주세요.',
        errorRate: '작성이 너무 잦아요 — 1시간 후에 다시 시도해주세요.',
        errorServer: '문제가 발생했습니다. 다시 시도해주세요.',
      },
    },
```

ja:

```js
    guestbook: {
      title: 'ゲストブック',
      hint: '地球をクリックして足跡を残しましょう',
      loadError: 'メッセージを読み込めませんでした。',
      retry: '再試行',
      form: {
        title: 'メッセージを残す',
        nickname: 'ニックネーム', nicknamePH: 'ニックネームを入力',
        message: 'メッセージ', messagePH: '短いメッセージをどうぞ...',
        emoji: '気分（任意）',
        submit: '残す', sending: '送信中...',
        cancel: 'キャンセル',
        success: 'あなたの星が地球に刻まれました！',
        errorInvalid: 'ニックネームとメッセージを入力してください。',
        errorRate: '投稿が多すぎます。1時間後にもう一度お試しください。',
        errorServer: '問題が発生しました。もう一度お試しください。',
      },
    },
```

zh:

```js
    guestbook: {
      title: '留言板',
      hint: '点击地球，留下你的足迹',
      loadError: '无法加载留言。',
      retry: '重试',
      form: {
        title: '留下留言',
        nickname: '昵称', nicknamePH: '请输入昵称',
        message: '留言', messagePH: '写一句简短的留言...',
        emoji: '心情（可选）',
        submit: '留下', sending: '发送中...',
        cancel: '取消',
        success: '你的星星已落在地球上！',
        errorInvalid: '请填写昵称和留言。',
        errorRate: '发送太频繁了，请一小时后再试。',
        errorServer: '出了点问题，请重试。',
      },
    },
```

- [ ] **Step 2: Write the page component**

Create `src/pages/Guestbook/Guestbook.jsx`:

```jsx
import { useCallback, useEffect, useState } from 'react'
import { useLang } from '../../context/LangContext'
import { GUESTBOOK_EMOJI } from './emoji.js'
import { formatRelativeTime } from './relativeTime.js'
import GuestbookGlobe from './GuestbookGlobe.jsx'
import './Guestbook.css'

export default function Guestbook() {
  const { lang, t } = useLang()
  const g = t.guestbook

  const [entries, setEntries] = useState([])
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState(null)     // { lat, lng } | null
  const [activeEntry, setActiveEntry] = useState(null)
  const [status, setStatus] = useState('idle')       // idle | sending | error
  const [errorMsg, setErrorMsg] = useState('')
  const [toast, setToast] = useState(false)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const res = await fetch('/api/guestbook')
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      setEntries(data.entries || [])
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handlePickLocation = useCallback((lat, lng) => {
    setActiveEntry(null)
    setStatus('idle')
    setSelected({ lat: Math.round(lat * 10) / 10, lng: Math.round(lng * 10) / 10 })
  }, [])

  const handlePickPin = useCallback((entry) => {
    setSelected(null)
    setActiveEntry(entry)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setStatus('sending')
    try {
      const res = await fetch('/api/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: form.get('nickname'),
          message: form.get('message'),
          emoji: form.get('emoji') || null,
          website: form.get('website'),
          lat: selected.lat,
          lng: selected.lng,
        }),
      })
      if (!res.ok) {
        setStatus('error')
        setErrorMsg(
          res.status === 429 ? g.form.errorRate
          : res.status === 400 ? g.form.errorInvalid
          : g.form.errorServer,
        )
        return
      }
      const data = await res.json()
      if (data.entry) setEntries((prev) => [data.entry, ...prev])
      setSelected(null)
      setStatus('idle')
      setToast(true)
      setTimeout(() => setToast(false), 3000)
    } catch {
      setStatus('error')
      setErrorMsg(g.form.errorServer)
    }
  }

  return (
    <div className="guestbook-page">
      <GuestbookGlobe
        entries={entries}
        tempPin={selected}
        onPickLocation={handlePickLocation}
        onPickPin={handlePickPin}
      />

      <div className="gb-head">
        <h1>{g.title}</h1>
        <p>{g.hint}</p>
      </div>

      {loadError && (
        <div className="gb-load-error" role="alert">
          {g.loadError}{' '}
          <button type="button" onClick={load}>{g.retry}</button>
        </div>
      )}

      {selected && (
        <form className="gb-form" onSubmit={handleSubmit}>
          <h2>{g.form.title}</h2>
          <p className="gb-coords">{selected.lat.toFixed(1)}°, {selected.lng.toFixed(1)}°</p>
          <label>
            {g.form.nickname}
            <input name="nickname" maxLength={20} required placeholder={g.form.nicknamePH} />
          </label>
          <label>
            {g.form.message}
            <textarea name="message" maxLength={200} required rows={3} placeholder={g.form.messagePH} />
          </label>
          <fieldset className="gb-emoji">
            <legend>{g.form.emoji}</legend>
            <div className="gb-emoji-grid">
              {GUESTBOOK_EMOJI.map((em) => (
                <label key={em} className="gb-emoji-item">
                  <input type="radio" name="emoji" value={em} />
                  <span>{em}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {/* 허니팟: 사람 눈에 안 보이는 필드. 봇이 채우면 서버가 조용히 버린다 */}
          <input type="text" name="website" className="gb-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          {status === 'error' && <p className="gb-error" role="alert">{errorMsg}</p>}
          <div className="gb-actions">
            <button type="button" className="gb-btn-ghost" onClick={() => setSelected(null)}>
              {g.form.cancel}
            </button>
            <button type="submit" className="gb-btn" disabled={status === 'sending'}>
              {status === 'sending' ? g.form.sending : g.form.submit}
            </button>
          </div>
        </form>
      )}

      {activeEntry && (
        <div className="gb-card" role="dialog" aria-label={activeEntry.nickname}>
          <button type="button" className="gb-card-close" onClick={() => setActiveEntry(null)} aria-label="Close">
            ×
          </button>
          <div className="gb-card-head">
            {activeEntry.emoji && <span className="gb-card-emoji">{activeEntry.emoji}</span>}
            <strong>{activeEntry.nickname}</strong>
            <time>{formatRelativeTime(activeEntry.created_at, lang)}</time>
          </div>
          <p className="gb-card-msg">{activeEntry.message}</p>
        </div>
      )}

      {toast && <div className="gb-toast">{g.form.success}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Write the page styles**

Create `src/pages/Guestbook/Guestbook.css`:

```css
.guestbook-page {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

.gb-canvas {
  position: absolute;
  inset: 0;
}

.gb-canvas canvas {
  display: block;
  cursor: grab;
}

.gb-canvas canvas:active {
  cursor: grabbing;
}

.gb-head {
  position: absolute;
  top: 96px;
  left: clamp(20px, 5vw, 64px);
  pointer-events: none;
}

.gb-head h1 {
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  color: #fff;
  margin: 0 0 6px;
}

.gb-head p {
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.95rem;
  margin: 0;
}

.gb-load-error {
  position: absolute;
  top: 96px;
  right: clamp(20px, 5vw, 64px);
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  background: rgba(20, 12, 12, 0.7);
  border: 1px solid rgba(255, 120, 120, 0.25);
  border-radius: 10px;
  padding: 10px 14px;
}

.gb-load-error button {
  background: none;
  border: none;
  color: #9db9ff;
  cursor: pointer;
  text-decoration: underline;
  font-size: 0.85rem;
}

.gb-form,
.gb-card {
  position: absolute;
  right: clamp(20px, 4vw, 56px);
  top: 50%;
  transform: translateY(-50%);
  width: min(340px, calc(100vw - 40px));
  background: rgba(10, 14, 26, 0.82);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 16px;
  padding: 22px;
  color: #fff;
}

.gb-form h2 {
  margin: 0 0 2px;
  font-size: 1.1rem;
}

.gb-coords {
  margin: 0 0 14px;
  font-size: 0.78rem;
  color: rgba(157, 185, 255, 0.8);
  font-variant-numeric: tabular-nums;
}

.gb-form label {
  display: block;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 12px;
}

.gb-form input[type='text'],
.gb-form input:not([type]),
.gb-form textarea {
  display: block;
  width: 100%;
  margin-top: 5px;
  padding: 9px 11px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9px;
  color: #fff;
  font: inherit;
  font-size: 0.9rem;
  resize: none;
}

.gb-form input:focus,
.gb-form textarea:focus {
  outline: none;
  border-color: rgba(157, 185, 255, 0.6);
}

.gb-emoji {
  border: none;
  margin: 0 0 12px;
  padding: 0;
}

.gb-emoji legend {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
  padding: 0;
  margin-bottom: 6px;
}

.gb-emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
}

.gb-emoji-item input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.gb-emoji-item span {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  padding: 4px 0;
  border-radius: 7px;
  cursor: pointer;
  border: 1px solid transparent;
}

.gb-emoji-item input:checked + span {
  background: rgba(157, 185, 255, 0.18);
  border-color: rgba(157, 185, 255, 0.55);
}

.gb-hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
}

.gb-error {
  color: #ff9d9d;
  font-size: 0.82rem;
  margin: 0 0 10px;
}

.gb-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.gb-btn,
.gb-btn-ghost {
  font: inherit;
  font-size: 0.88rem;
  padding: 9px 18px;
  border-radius: 10px;
  cursor: pointer;
}

.gb-btn {
  background: #9db9ff;
  border: none;
  color: #0a0e1a;
  font-weight: 600;
}

.gb-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.gb-btn-ghost {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.7);
}

.gb-card-close {
  position: absolute;
  top: 10px;
  right: 12px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 1.3rem;
  cursor: pointer;
  line-height: 1;
}

.gb-card-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}

.gb-card-emoji {
  font-size: 1.3rem;
}

.gb-card-head time {
  margin-left: auto;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
}

.gb-card-msg {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.85);
  overflow-wrap: break-word;
}

.gb-toast {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(10, 14, 26, 0.9);
  border: 1px solid rgba(157, 185, 255, 0.4);
  border-radius: 12px;
  padding: 12px 22px;
  color: #cdddff;
  font-size: 0.9rem;
}

/* 모바일: 폼/카드를 바텀 시트로 */
@media (max-width: 640px) {
  .gb-form,
  .gb-card {
    top: auto;
    right: 0;
    left: 0;
    bottom: 0;
    transform: none;
    width: 100%;
    border-radius: 18px 18px 0 0;
    max-height: 70vh;
    overflow-y: auto;
  }

  .gb-head {
    top: 84px;
  }

  .gb-emoji-grid {
    grid-template-columns: repeat(8, 1fr);
  }
}
```

- [ ] **Step 4: Wire the route + footer/scroll behavior in `src/App.jsx`**

Add the import next to the other page imports:

```js
import Guestbook from './pages/Guestbook/Guestbook'
```

Add the route inside `<Routes>` after the `/projects/:slug` route:

```jsx
          <Route path="/guestbook" element={<Guestbook />} />
```

In the scroll-lock effect, change:

```js
    const isGallery = location.pathname === '/gallery'
    if (isGallery) {
```

to:

```js
    const lockScroll = location.pathname === '/gallery' || location.pathname === '/guestbook'
    if (lockScroll) {
```

In `AppContent`, change the footer condition block:

```js
  const isExperimentDemo = /^\/gallery\/[^/]+$/.test(location.pathname)
  const showGlobalFooter = (!isMainPage || !isDesktop) && !isLabPage && !isExperimentDemo
```

to:

```js
  const isExperimentDemo = /^\/gallery\/[^/]+$/.test(location.pathname)
  // 방명록도 실험 데모처럼 고정 풀뷰포트 캔버스라 푸터를 겹치지 않게 숨긴다
  const isGuestbook = location.pathname === '/guestbook'
  const showGlobalFooter = (!isMainPage || !isDesktop) && !isLabPage && !isExperimentDemo && !isGuestbook
```

- [ ] **Step 5: Add navbar links in `src/components/Navbar/Navbar.jsx`**

Add a click handler next to `handleLabClick` (after line 71):

```js
  const handleGuestbookClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    setMenuOpen(false)
    navigate('/guestbook')
  }
```

In the **desktop** nav, right after the Lab `<a>` (which closes with `Lab</a>`), add:

```jsx
          <a
            href="/guestbook"
            className={`nav-link ${location.pathname === '/guestbook' ? 'nav-link--active' : ''}`}
            onClick={handleGuestbookClick}
          >
            {t.nav.guestbook}
          </a>
```

In the **mobile** menu overlay, right after its Lab `<a>`, add:

```jsx
            <a href="/guestbook" className="nav-link" onClick={handleGuestbookClick}>
              {t.nav.guestbook}
            </a>
```

- [ ] **Step 6: Verify build, lint, and unit suite**

Run: `npm run build && npm run lint && npm test`
Expected: all exit 0, 0 test failures.

- [ ] **Step 7: Visual sanity check**

Run: `npm run dev` (background), open `http://localhost:5173/guestbook`.
Expected: globe with blue land dots renders over the space background; dragging rotates; clicking opens the form with an amber temp pin; the Navbar shows a Guestbook link. (Pins/entries require the API, which doesn't run under plain Vite — the load-error notice appearing is expected here.) Stop the dev server after checking.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Guestbook/Guestbook.jsx src/pages/Guestbook/Guestbook.css src/i18n/translations.js src/App.jsx src/components/Navbar/Navbar.jsx
git commit -m "feat(guestbook): add guestbook page with globe, form, and navbar entry"
```

---

### Task 7: Playwright smoke test + full verification

**Files:**
- Create: `e2e/guestbook.spec.js`

**Interfaces:**
- Consumes: `/guestbook` route (Task 6), CSS hooks `.gb-canvas`, `.gb-form`, `.gb-toast` (Task 6), API contract (Task 4 — mocked via `page.route`).

- [ ] **Step 1: Write the e2e test**

Create `e2e/guestbook.spec.js`. The API is mocked with `page.route` so the test is hermetic (no Supabase, and no 404 console errors under plain Vite). The click is offset from dead center because the intro rotation parks the newest pin at the center of the globe:

```js
import { test, expect } from '@playwright/test'

const entries = [
  {
    id: 'e1', nickname: 'Mila', message: 'Hello from Berlin!', emoji: '👋',
    lat: 52.5, lng: 13.4, created_at: new Date().toISOString(),
  },
]

test('방명록: 지구본 클릭 → 작성 폼 → 제출 성공 토스트', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.route('**/api/guestbook', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { ok: true, entries } })
    }
    return route.fulfill({
      json: {
        ok: true,
        entry: {
          id: 'e2', nickname: 'Evan', message: 'e2e hello', emoji: null,
          lat: 37.5, lng: 127.0, created_at: new Date().toISOString(),
        },
      },
    })
  })

  await page.goto('/guestbook')
  const canvas = page.locator('.gb-canvas canvas')
  await expect(canvas).toBeVisible()

  // 인트로 회전(1.8s)이 끝나길 기다린 뒤, 최신 핀(중앙)을 피해 살짝 옆을 클릭
  await page.waitForTimeout(2200)
  const box = await canvas.boundingBox()
  await page.mouse.click(box.x + box.width / 2 + box.height * 0.18, box.y + box.height / 2)
  await expect(page.locator('.gb-form')).toBeVisible()

  await page.fill('.gb-form input[name="nickname"]', 'Evan')
  await page.fill('.gb-form textarea[name="message"]', 'e2e hello')
  await page.click('.gb-form button[type="submit"]')
  await expect(page.locator('.gb-toast')).toBeVisible()
  await expect(page.locator('.gb-form')).toHaveCount(0)

  expect(errors).toEqual([])
})
```

- [ ] **Step 2: Run the new e2e test**

Run: `npx playwright test e2e/guestbook.spec.js`
Expected: 1 passed. If the click lands off the sphere (form doesn't open), reduce the horizontal offset from `box.height * 0.18` to `box.height * 0.12` — the sphere spans roughly ±75% of the viewport half-height at the default camera distance.

- [ ] **Step 3: Full verification sweep**

Run: `npm test && npm run build && npx playwright test`
Expected: unit suite 0 failures; build exits 0; full e2e suite passes (pre-existing specs included — establish any pre-existing e2e failures by checking git history/`npx playwright test` on a clean checkout before blaming this change).

- [ ] **Step 4: Commit**

```bash
git add e2e/guestbook.spec.js
git commit -m "test(e2e): add guestbook globe smoke test"
```

---

### Task 8: Production deploy note (manual follow-ups)

No code. Surface these in the final report to the user:

1. **Supabase DDL** — confirm `supabase/guestbook_entries.sql` was run in the Supabase SQL Editor (Task 4 Step 8). Without it, GET/POST return 500 in production.
2. **Optional env var** — `GUESTBOOK_IP_SALT` on Vercel hardens the IP hash (falls back to a built-in constant if unset).
3. **Local API testing** — plain `npm run dev` does not serve `api/*`; use `vercel dev` or a preview deploy to exercise the real endpoint end-to-end.
4. **Moderation** — hide an entry by setting `is_hidden = true` on its row in the Supabase table editor (no admin UI, per spec).
