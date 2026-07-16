import { test, expect } from '@playwright/test'

test('첫 로딩 도착 시퀀스 후 Hero 콘텐츠가 등장한다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  const hero = page.locator('section.hero')
  // 시퀀스(~2.4s)가 끝나면 대기 클래스가 떨어지고 콘텐츠 스태거가 시작된다.
  await expect(hero).not.toHaveClass(/hero--awaiting-arrival/, { timeout: 6000 })
  await expect(page.locator('.hero-title').first()).toBeVisible()

  expect(errors).toEqual([])
})

test('reduced-motion이면 시퀀스 없이 즉시 등장한다', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()

  await page.goto('/')
  // 'skipped' 종결이 즉시 일어나므로 대기 클래스가 빠르게 사라져야 한다.
  await expect(page.locator('section.hero')).not.toHaveClass(/hero--awaiting-arrival/, {
    timeout: 2000,
  })

  await context.close()
})
