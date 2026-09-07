import { test, expect } from '@playwright/test'
import { openSiteMenu } from './openSiteMenu.js'

// 도착 시퀀스 종료 대기에만 최대 20초가 들 수 있어, 호출하는 테스트는
// test.slow()로 기본 30초 타임아웃을 늘린다.
async function settle(page) {
  await expect(page.locator('section.hero')).not.toHaveClass(
    /hero--awaiting-arrival/,
    { timeout: 20000 },
  )
}

// 투어를 시작하면 메뉴가 닫히므로(오버레이가 덮은 채로는 투어가 안 보인다)
// 버튼은 접근성 트리에서 빠진다 — 역할 기반 조회 대신 클래스로 상태만 읽는다.
const autopilotBtn = (page) => page.locator('.autopilot-btn')

test('오토파일럿 버튼이 데스크톱 메인의 사이트 메뉴에만 있다', async ({ page }) => {
  await page.goto('/')
  await openSiteMenu(page)
  await expect(page.getByRole('button', { name: 'Autopilot' })).toBeVisible()

  await page.goto('/guestbook')
  // 메뉴를 연 상태에서 없어야 "메인 전용"이 증명된다.
  await openSiteMenu(page)
  await expect(page.getByRole('button', { name: 'Autopilot' })).toHaveCount(0)
})

test('투어를 시작하면 메뉴가 닫히고 스스로 다음 정거장으로 항행한다', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await settle(page)
  const vh = await page.evaluate(() => window.innerHeight)
  await openSiteMenu(page)
  await page.getByRole('button', { name: 'Autopilot' }).click()

  // 메뉴가 닫혀도 컨트롤은 마운트된 채로 남아야 한다 — 언마운트되면
  // useAutopilot의 정리가 예약된 투어 타이머를 지워 투어가 즉시 죽는다.
  await expect(page.locator('.nav-mobile')).toBeHidden()
  await expect(autopilotBtn(page)).toHaveAttribute('aria-pressed', 'true')

  // 스텝 1(about, 인덱스 1)은 5초에 출발해 8초에 도착한다 — 여유를 두고 기다린다.
  await page.waitForFunction((h) => window.scrollY > h * 0.9, vh, { timeout: 15000 })
})

test('휠 입력이 들어오면 투어가 즉시 멈춘다', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await settle(page)
  await openSiteMenu(page)
  await page.getByRole('button', { name: 'Autopilot' }).click()
  await expect(autopilotBtn(page)).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.wheel(0, 200)
  await expect(autopilotBtn(page)).toHaveAttribute('aria-pressed', 'false', { timeout: 5000 })
})

// 컨트롤이 사이트 메뉴 안으로 들어가면서, 투어가 도는 중에 버튼을 다시 누르는
// 경로는 사라졌다 — 버튼에 닿으려면 버거를 눌러야 하는데 그 pointerdown 자체가
// useAutopilot의 인터럽트라 메뉴가 열리는 시점에는 이미 멈춰 있다. 그 계약을
// 그대로 검증한다: 투어 중 메뉴를 열면 버튼이 다시 "시작" 상태여야 한다.
test('투어 중 메뉴를 열면 그 입력이 인터럽트로 잡혀 멈춘 상태로 보인다', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await settle(page)
  await openSiteMenu(page)
  await page.getByRole('button', { name: 'Autopilot' }).click()
  await expect(autopilotBtn(page)).toHaveAttribute('aria-pressed', 'true')

  await openSiteMenu(page)
  await expect(page.getByRole('button', { name: 'Autopilot' })).toBeVisible()
  await expect(autopilotBtn(page)).toHaveAttribute('aria-pressed', 'false')
})

test('reduced-motion이면 이동 없이 컷으로 정거장을 넘긴다', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('/')
  // reduced-motion에서는 도착 시퀀스가 즉시 'skipped'로 종결된다.
  await expect(page.locator('section.hero')).not.toHaveClass(
    /hero--awaiting-arrival/,
    { timeout: 5000 },
  )
  const vh = await page.evaluate(() => window.innerHeight)
  await openSiteMenu(page)
  await page.getByRole('button', { name: 'Autopilot' }).click()
  // 정차만 남아 스텝이 2초라, 3초 안에 두 번째 정거장(about)에 이미 도달한다.
  await page.waitForFunction((h) => window.scrollY >= h * 0.95, vh, { timeout: 6000 })
  await context.close()
})
