import { test, expect } from '@playwright/test'

test('Evan System: 메인 로드 후 항성계 스테이지가 콘솔 에러 없이 뜬다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.locator('.hero-title').first()).toBeVisible({ timeout: 15000 })
  // 배경 캔버스 존재 (스테이지 렌더 대상)
  await expect(page.locator('canvas').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('Evan System: 스크롤로 Projects 정거장에 도착하면 카드가 인터랙션 가능하다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.locator('.hero-title').first()).toBeVisible({ timeout: 15000 })

  // 정거장 3 = projects. 스냅 로직이 정착시킬 때까지 기다린다.
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 3))
  await page.waitForFunction(
    () => Math.abs(window.scrollY - window.innerHeight * 3) < 2,
    { timeout: 5000 },
  )
  // App.jsx renders an invisible full-height anchor placeholder with the
  // same id (for hash-scroll targets) alongside the real content section —
  // both match '#projects', so scope to the actual <section> to avoid a
  // Playwright strict-mode ambiguity.
  const projects = page.locator('section#projects')
  await expect(projects).toBeVisible()
  // 도킹 정착 시 pointer-events가 auto여야 카드 클릭이 산다.
  const slide = page.locator('.scroll-slide').nth(3)
  await expect(slide).toHaveCSS('pointer-events', 'auto', { timeout: 5000 })
})

test('Evan System: 해시 진입(#contact)은 해당 정거장에서 시작한다', async ({ page }) => {
  await page.goto('/#contact', { waitUntil: 'commit' })
  await page.waitForFunction(
    () => Math.abs(window.scrollY - window.innerHeight * 4) < 2,
    { timeout: 10000 },
  )
})
