import { test, expect } from '@playwright/test'

test('첫 방문 인트로가 콘솔 에러 없이 끝나고 히어로가 나타난다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/', { waitUntil: 'commit' })
  // 인트로(1.9s) + 도착 워프(2.4s)가 끝나면 히어로 콘텐츠가 등장한다.
  await expect(page.locator('.hero-title').first()).toBeVisible({ timeout: 20000 })
  expect(errors).toEqual([])
})

// 도착 시퀀스가 종결되는 시점 = 인트로까지 포함한 오프닝 전체가 끝난 시점.
// .hero-title의 가시성은 도착 이전에도 참이라 인트로 유무를 구분하지 못한다.
async function msUntilSettled(page, navigate) {
  const t = Date.now()
  await navigate()
  await page.locator('section.hero').waitFor({ timeout: 20000 })
  await page.waitForFunction(
    () => {
      const hero = document.querySelector('section.hero')
      return !!hero && !hero.classList.contains('hero--awaiting-arrival')
    },
    { timeout: 30000 },
  )
  return Date.now() - t
}

test('인트로는 세션당 한 번만 재생된다', async ({ page }) => {
  // 첫 방문은 인트로(1.9s)를 거친 뒤 도착 워프로 넘어가고, 재방문은 인트로를
  // 건너뛴다 — 그 차이를 직접 잰다. 히어로 등장 시점만 보면 게이트가 깨져
  // 매번 재생되더라도 넉넉한 타임아웃 안에 들어와 통과해버린다.
  const firstVisitMs = await msUntilSettled(page, () => page.goto('/', { waitUntil: 'commit' }))

  const seen = await page.evaluate(() => sessionStorage.getItem('evanSystemIntroSeen'))
  expect(seen).toBe('1')

  const revisitMs = await msUntilSettled(page, () => page.reload({ waitUntil: 'commit' }))

  // 인트로는 벽시계 기준 1.9초로 고정이라 프레임률과 무관하다. 실측 마진은
  // 2.6~3.0초였으므로 900ms 임계값은 약 3배 여유를 둔 값이다.
  expect(revisitMs).toBeLessThan(firstVisitMs - 900)
})

test('인트로가 끝나면 도착 시퀀스까지 종결된다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' })
  const hero = page.locator('section.hero')
  // 인트로가 매달리면 beginArrival이 호출되지 않아 이 클래스가 떨어지지 않는다.
  await expect(hero).toHaveClass(/hero--awaiting-arrival/, { timeout: 15000 })
  await expect(hero).not.toHaveClass(/hero--awaiting-arrival/, { timeout: 25000 })
  await expect(page.locator('canvas').first()).toBeVisible()
})
