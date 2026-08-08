import { test, expect } from '@playwright/test'

// 도착 시퀀스 종료 대기에만 최대 20초가 들 수 있어, 호출하는 테스트는
// test.slow()로 기본 30초 타임아웃을 늘린다.
async function settle(page) {
  await expect(page.locator('section.hero')).not.toHaveClass(
    /hero--awaiting-arrival/,
    { timeout: 20000 },
  )
}

test('오토파일럿 버튼이 데스크톱 메인에만 있다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Autopilot' })).toBeVisible()
  await page.goto('/guestbook')
  await expect(page.getByRole('button', { name: 'Autopilot' })).toHaveCount(0)
})

test('투어를 시작하면 스스로 다음 정거장으로 항행한다', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await settle(page)
  const vh = await page.evaluate(() => window.innerHeight)
  await page.getByRole('button', { name: 'Autopilot' }).click()
  await expect(page.getByRole('button', { name: 'Stop tour' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // 스텝 1(about, 인덱스 1)은 5초에 출발해 8초에 도착한다 — 여유를 두고 기다린다.
  await page.waitForFunction((h) => window.scrollY > h * 0.9, vh, { timeout: 15000 })
})

test('휠 입력이 들어오면 투어가 즉시 멈춘다', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await settle(page)
  await page.getByRole('button', { name: 'Autopilot' }).click()
  await expect(page.getByRole('button', { name: 'Stop tour' })).toBeVisible()
  await page.mouse.wheel(0, 200)
  await expect(page.getByRole('button', { name: 'Autopilot' })).toBeVisible({
    timeout: 5000,
  })
})

test('버튼을 다시 누르면 멈춘다 — 자기 클릭이 인터럽트로 잡혀 토글이 깨지지 않아야 한다', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await settle(page)
  const start = page.getByRole('button', { name: 'Autopilot' })
  await start.click()
  const stopBtn = page.getByRole('button', { name: 'Stop tour' })
  // 인터럽트 리스너가 붙은 뒤에도 버튼 자신의 클릭은 무시돼야 한다.
  await page.waitForTimeout(500)
  await expect(stopBtn).toBeVisible()
  await stopBtn.click()
  await expect(start).toHaveAttribute('aria-pressed', 'false')
})

test('reduced-motion이면 이동 없이 컷으로 정거장을 넘긴다', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('/')
  // reduced-motion에서는 도착 시퀀스가 즉시 'skipped'로 종결된다.
  await expect(page.locator('section.hero')).not.toHaveClass(
    /hero--awaiting-arrival/,
    { timeout: 5000 },
  )
  const vh = await page.evaluate(() => window.innerHeight)
  await page.getByRole('button', { name: 'Autopilot' }).click()
  // 정차만 남아 스텝이 2초라, 3초 안에 두 번째 정거장(about)에 이미 도달한다.
  await page.waitForFunction((h) => window.scrollY >= h * 0.95, vh, { timeout: 6000 })
  await context.close()
})
