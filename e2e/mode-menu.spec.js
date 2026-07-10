import { test, expect } from '@playwright/test'

test('mode menu appears on main page only and opens a panel', async ({ page }) => {
  await page.goto('/')
  const btn = page.getByRole('button', { name: 'Mode' })
  await expect(btn).toBeVisible()
  await btn.click()
  await expect(page.getByRole('menuitem', { name: /Normal/ })).toBeVisible()

  await page.goto('/gallery')
  await expect(page.getByRole('button', { name: 'Mode' })).toHaveCount(0)
})

test('normal page renders unchanged without interacting with modes', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('section#home')).toBeVisible()
  await expect(page.locator('.mode-badge')).toHaveCount(0)
})
