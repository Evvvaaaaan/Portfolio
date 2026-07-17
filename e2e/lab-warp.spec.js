import { test, expect } from '@playwright/test'

test('Lab 클릭 시 워프 전환을 거쳐 갤러리에 도착한다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  // 도착 시퀀스가 끝나 화면이 안정된 뒤 클릭한다.
  await expect(page.locator('section.hero')).not.toHaveClass(/hero--awaiting-arrival/, {
    timeout: 6000,
  })

  await page.getByRole('link', { name: 'Lab' }).first().click()

  // 피크(~900ms)에 네비게이션이 일어난다.
  await expect(page).toHaveURL(/\/gallery/, { timeout: 4000 })
  // 해제+문구가 끝나면 오버레이가 완전히 정리되어야 한다 (총 ~3.1s).
  await expect(page.locator('.labtransition-overlay')).toHaveCount(0, { timeout: 8000 })

  expect(errors).toEqual([])
})
