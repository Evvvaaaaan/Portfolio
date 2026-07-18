import { test, expect } from '@playwright/test'

test('earth explorer: 폴백 지구본 진입 → 랜드마크 클릭 → 콘솔 에러 없음', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/gallery/earth-explorer')
  await expect(page.locator('.ee-wrap canvas')).toBeVisible({ timeout: 15000 })

  const seoulBtn = page.locator('.ee-landmark-btn', { hasText: '서울 잠실' })
  await expect(seoulBtn).toBeVisible()
  await seoulBtn.click()
  await expect(seoulBtn).toHaveClass(/active/)

  await page.waitForTimeout(2500) // 비행 애니메이션(2200ms) 완료 대기

  expect(errors).toEqual([])
})
