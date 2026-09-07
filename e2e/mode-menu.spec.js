import { test, expect } from '@playwright/test'
import { openSiteMenu } from './openSiteMenu.js'

test('mode menu appears on main page only and opens a panel', async ({ page }) => {
  await page.goto('/')
  await openSiteMenu(page)
  const btn = page.getByRole('button', { name: 'Mode' })
  await expect(btn).toBeVisible()
  await btn.click()
  await expect(page.getByRole('menuitem', { name: /Normal/ })).toBeVisible()

  await page.goto('/gallery')
  // 메뉴를 연 상태에서 없어야 "메인 전용"이 증명된다 — 닫힌 채로 세면 컨트롤이
  // 어디에 있든 0이라 공허하게 통과한다.
  await openSiteMenu(page)
  await expect(page.getByRole('button', { name: 'Mode' })).toHaveCount(0)
})

test('normal page renders unchanged without interacting with modes', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('section#home')).toBeVisible()
  await expect(page.locator('.mode-badge')).toHaveCount(0)
})
