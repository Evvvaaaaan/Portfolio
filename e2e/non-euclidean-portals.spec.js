import { test, expect } from '@playwright/test'

test('non-euclidean portals: 진입 → 캔버스 렌더 → 콘솔 에러 없음', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/gallery/non-euclidean-portals')
  await expect(page.locator('.nep-wrap canvas')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.nep-start')).toBeVisible() // click-to-start overlay

  expect(errors).toEqual([])
})

test('non-euclidean portals: 포탈 통과 시 방 라벨이 바뀐다', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/gallery/non-euclidean-portals')
  await expect(page.locator('.nep-wrap canvas')).toBeVisible({ timeout: 15000 })
  await page.locator('.nep-start').click()

  await expect(page.locator('.nep-roomlabel')).toHaveText('THE SMALL ROOM')
  // hold W to walk forward through the doorway into the hall
  await page.keyboard.down('KeyW')
  await expect(page.locator('.nep-roomlabel')).toHaveText('IMPOSSIBLE HALL', { timeout: 8000 })
  await page.keyboard.up('KeyW')

  expect(errors).toEqual([])
})
