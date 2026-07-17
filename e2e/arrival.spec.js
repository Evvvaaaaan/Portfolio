import { test, expect } from '@playwright/test'

test('첫 로딩 도착 시퀀스 후 Hero 콘텐츠가 등장한다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  const hero = page.locator('section.hero')
  // 시퀀스가 실제로 재생되는지 먼저 확인 — 이 단언이 없으면 스킵 경로와
  // 구분되지 않아 기능이 조용히 사라져도 테스트가 통과한다.
  await expect(hero).toHaveClass(/hero--awaiting-arrival/)
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
