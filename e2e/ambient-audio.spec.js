import { test, expect } from '@playwright/test'

// AudioContext를 실제로 만들지 않고 계측한다 — 헤드리스 크로미움은 오디오
// 출력이 없어 "소리가 났는지"를 직접 확인할 수 없다. 대신 컨텍스트가 언제
// 몇 개 만들어졌는지를 기록해 "자동 재생하지 않는다"와 "클릭에 반응한다"를
// 각각 증명한다.
async function instrument(page) {
  await page.addInitScript(() => {
    window.__audioCreated = 0
    const Real = window.AudioContext || window.webkitAudioContext
    window.AudioContext = class extends Real {
      constructor(...args) {
        super(...args)
        window.__audioCreated += 1
      }
    }
  })
}

test('기본은 완전 무음 — AudioContext를 만들지도 않는다', async ({ page }) => {
  await instrument(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sound on' })).toBeVisible({ timeout: 15000 })
  // 페이지가 자리를 잡을 시간을 준 뒤에도 여전히 0이어야 한다.
  await page.waitForTimeout(2000)
  expect(await page.evaluate(() => window.__audioCreated)).toBe(0)
})

test('토글을 누르면 그때 오디오가 시작된다', async ({ page }) => {
  await instrument(page)
  await page.goto('/')
  const on = page.getByRole('button', { name: 'Sound on' })
  await expect(on).toBeVisible({ timeout: 15000 })
  await on.click()
  await expect(page.getByRole('button', { name: 'Sound off' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(await page.evaluate(() => window.__audioCreated)).toBe(1)
})

test('다시 누르면 멈추고, 컨텍스트를 새로 만들지 않는다', async ({ page }) => {
  await instrument(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Sound on' }).click()
  const off = page.getByRole('button', { name: 'Sound off' })
  await expect(off).toBeVisible()
  await off.click()
  await expect(page.getByRole('button', { name: 'Sound on' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  // 컨텍스트는 재사용돼야 한다 — 매번 새로 만들면 탭이 오디오 장치를 계속 붙든다.
  expect(await page.evaluate(() => window.__audioCreated)).toBe(1)
})

test('토글은 데스크톱 메인에만 있다', async ({ page }) => {
  await page.goto('/guestbook')
  await expect(page.getByRole('button', { name: 'Sound on' })).toHaveCount(0)
})
