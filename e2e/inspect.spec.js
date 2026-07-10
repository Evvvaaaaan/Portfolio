import { test, expect } from '@playwright/test'

test('inspect: tour panel steps through annotated elements', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Mode' }).click()
  await page.getByRole('menuitem', { name: /Inspect/ }).click()

  const panel = page.locator('.inspect-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Hero')
  await expect(page.locator('.inspect-highlight')).toBeVisible()

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(panel).toContainText('Navbar')

  await page.getByRole('button', { name: 'Prev' }).click()
  await expect(panel).toContainText('Hero')

  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
})
