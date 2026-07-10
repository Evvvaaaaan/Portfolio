import { test, expect } from '@playwright/test'

test('speedrun: timer runs and scrolling to bottom clears all splits', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Mode' }).click()
  await page.getByRole('menuitem', { name: /Speedrun/ }).click()

  await expect(page.locator('.speedrun-panel')).toBeVisible()
  await page.waitForTimeout(300)
  await expect(page.locator('.speedrun-timer')).not.toHaveText('0:00.00')

  // 데스크톱 메인은 Lenis 슬라이드 덱이라 실제 휠 이벤트로 스크롤한다
  await page.mouse.move(400, 400)
  for (let i = 0; i < 30; i++) {
    if (await page.locator('.speedrun-clear').isVisible()) break
    await page.mouse.wheel(0, 800)
    await page.waitForTimeout(250)
  }

  await expect(page.locator('.speedrun-split--done')).toHaveCount(5)
  await expect(page.locator('.speedrun-clear')).toBeVisible()
})
