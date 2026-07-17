import { test, expect } from '@playwright/test'

const entries = [
  {
    id: 'e1', nickname: 'Mila', message: 'Hello from Berlin!', emoji: '👋',
    lat: 52.5, lng: 13.4, created_at: new Date().toISOString(),
  },
]

test('방명록: 지구본 클릭 → 작성 폼 → 제출 성공 토스트', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.route('**/api/guestbook', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { ok: true, entries } })
    }
    return route.fulfill({
      json: {
        ok: true,
        entry: {
          id: 'e2', nickname: 'Evan', message: 'e2e hello', emoji: null,
          lat: 37.5, lng: 127.0, created_at: new Date().toISOString(),
        },
      },
    })
  })

  await page.goto('/guestbook')
  const canvas = page.locator('.gb-canvas canvas')
  await expect(canvas).toBeVisible()

  // 인트로 회전(1.8s)이 끝나길 기다린 뒤, 최신 핀(중앙)을 피해 살짝 옆을 클릭
  await page.waitForTimeout(2200)
  const box = await canvas.boundingBox()
  await page.mouse.click(box.x + box.width / 2 + box.height * 0.18, box.y + box.height / 2)
  await expect(page.locator('.gb-form')).toBeVisible()

  await page.fill('.gb-form input[name="nickname"]', 'Evan')
  await page.fill('.gb-form textarea[name="message"]', 'e2e hello')
  await page.click('.gb-form button[type="submit"]')
  await expect(page.locator('.gb-toast')).toBeVisible()
  await expect(page.locator('.gb-form')).toHaveCount(0)

  expect(errors).toEqual([])
})
