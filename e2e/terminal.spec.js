import { test, expect } from '@playwright/test'

test('terminal mode: enter, run help, exit', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Mode' }).click()
  await page.getByRole('menuitem', { name: /Terminal/ }).click()

  const input = page.getByLabel('Terminal input')
  await expect(input).toBeVisible()
  await input.fill('help')
  await input.press('Enter')
  await expect(page.getByText('Available commands:')).toBeVisible()

  await input.fill('exit')
  await input.press('Enter')
  await expect(page.locator('.terminal-overlay')).toHaveCount(0)
})

test('terminal mode: ESC exits', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Mode' }).click()
  await page.getByRole('menuitem', { name: /Terminal/ }).click()
  await expect(page.locator('.terminal-overlay')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.terminal-overlay')).toHaveCount(0)
})
