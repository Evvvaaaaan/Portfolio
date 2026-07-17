import { test, expect } from '@playwright/test'

test('Lab 클릭 시 워프 전환을 거쳐 갤러리에 도착한다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  // waitUntil: 'commit' — load 이벤트는 병렬 부하에서 React 마운트보다 수 초
  // 늦게 뜰 수 있어, 그 사이 시퀀스(~2.4s)가 끝나면 양성 단언이 레이스로
  // 실패한다. commit 시점부터 폴링하면 클래스 등장을 놓치지 않는다.
  await page.goto('/', { waitUntil: 'commit' })
  // 도착 시퀀스가 끝나 화면이 안정된 뒤 클릭한다. toBeAttached를 먼저 확인해
  // 요소 부재로 인한 not.toHaveClass의 공허한 통과(vacuous pass)를 막는다.
  await expect(page.locator('section.hero')).toBeAttached({ timeout: 15000 })
  await expect(page.locator('section.hero')).not.toHaveClass(/hero--awaiting-arrival/, {
    timeout: 15000,
  })

  await page.getByRole('link', { name: 'Lab' }).first().click()

  // 피크(~900ms)에 네비게이션이 일어난다.
  await expect(page).toHaveURL(/\/gallery/, { timeout: 10000 })
  // 해제+문구가 끝나면 오버레이가 완전히 정리되어야 한다 (총 ~3.1s).
  await expect(page.locator('.labtransition-overlay')).toHaveCount(0, { timeout: 15000 })

  expect(errors).toEqual([])
})
