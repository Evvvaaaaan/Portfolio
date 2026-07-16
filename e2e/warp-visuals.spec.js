import { test, expect } from '@playwright/test'

test('메인 페이지 워프 연출이 콘솔 에러 없이 렌더된다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible()

  // 섹션 여러 개를 넘기며 워프 전환(스트릭/포스트프로세싱/틴트)을 트리거
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(1000)

  expect(errors).toEqual([])
})
