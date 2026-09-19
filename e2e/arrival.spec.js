import { test, expect } from '@playwright/test'

test('Hero를 숨기지 않고 배경 도착 시퀀스를 마친다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.addInitScript(() => {
    window.__arrivalDone = false
    window.addEventListener('space-arrival:done', () => { window.__arrivalDone = true })
  })
  await page.goto('/', { waitUntil: 'commit' })
  const hero = page.locator('section.hero')
  await expect(hero).not.toHaveClass(/hero--awaiting-arrival/)
  await expect(page.locator('.hero-title-holo-wrap')).toHaveCSS('opacity', '1')
  await page.waitForFunction(() => window.__arrivalDone)
  await expect(page.locator('.hero-title').first()).toBeVisible()

  expect(errors).toEqual([])
})

test('reduced-motion이면 시퀀스 없이 즉시 등장한다', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()

  await page.goto('/')
  await expect(page.locator('.hero-title-holo-wrap')).toHaveCSS('opacity', '1')
  await expect(page.locator('section.hero')).not.toHaveClass(/hero--awaiting-arrival/, {
    timeout: 2000,
  })

  await context.close()
})

test('페이지 중간에서 리로드하면(스크롤 복원) 시퀀스를 생략한다', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2))
  await page.waitForTimeout(300) // 스크롤 반영 대기
  await page.reload()
  // 복원된 scrollY를 보고 'skipped'로 즉시 종결되어야 한다.
  await expect(page.locator('section.hero')).not.toHaveClass(/hero--awaiting-arrival/, {
    timeout: 1500,
  })
})
