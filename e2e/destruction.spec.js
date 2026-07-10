import { test, expect } from '@playwright/test'

test('destruction: page elements collapse and RESTORE brings them back', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Mode' }).click()
  await page.getByRole('menuitem', { name: /Destruction/ }).click()

  const host = page.locator('.destruction-host')
  await expect(host).toBeVisible()
  // 클론이 생성되었는지 (RESTORE 버튼 외 자식 존재)
  expect(await host.locator('[aria-hidden="true"]').count()).toBeGreaterThan(3)

  await page.getByRole('button', { name: 'RESTORE' }).click()
  await expect(host).toHaveCount(0)
  await expect(page.locator('section#home')).toBeVisible()
})
