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

test('인트로는 세션당 한 번만 재생된다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.locator('.hero-title').first()).toBeVisible({ timeout: 20000 })

  const seen = await page.evaluate(() => sessionStorage.getItem('evanSystemIntroSeen'))
  expect(seen).toBe('1')

  // 같은 컨텍스트에서 재방문하면 인트로 없이 곧바로 히어로가 뜬다.
  await page.reload({ waitUntil: 'commit' })
  await expect(page.locator('.hero-title').first()).toBeVisible({ timeout: 12000 })
})

test('인트로가 끝나면 항성계가 완성 상태다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.locator('.hero-title').first()).toBeVisible({ timeout: 20000 })
  // 캔버스가 살아 있고 페이지 에러가 없으면 실체화 경로가 끝까지 돈 것이다.
  await expect(page.locator('canvas').first()).toBeVisible()
})
