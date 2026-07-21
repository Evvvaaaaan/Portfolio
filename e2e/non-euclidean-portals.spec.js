import { test, expect } from '@playwright/test'

test('non-euclidean portals: 진입 → 캔버스 렌더 → 콘솔 에러 없음', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/gallery/non-euclidean-portals')
  await expect(page.locator('.nep-wrap canvas')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.nep-start')).toBeVisible() // click-to-start overlay

  expect(errors).toEqual([])
})
