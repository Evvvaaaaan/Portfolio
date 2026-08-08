import { test, expect } from '@playwright/test'

// 인트로/도착 시퀀스가 끝난 뒤에 조작해야 우리가 만든 스크롤과 시퀀스가
// 겹치지 않는다. 시퀀스 종료 신호는 Hero의 대기 클래스가 떨어지는 것이다.
// 이 대기만으로 최대 20초를 쓸 수 있어, 호출하는 테스트는 test.slow()로
// 기본 30초 타임아웃을 늘려 둔다 (소프트웨어 렌더링에서 마운트가 느리다).
async function settle(page) {
  await expect(page.locator('section.hero')).not.toHaveClass(
    /hero--awaiting-arrival/,
    { timeout: 20000 },
  )
}

test('데스크톱 메인에 미니맵이 뜨고 정거장 버튼이 5개다', async ({ page }) => {
  await page.goto('/')
  const map = page.locator('nav.minimap')
  await expect(map).toBeVisible()
  await expect(map.locator('button.minimap-btn')).toHaveCount(5)
})

test('정거장 버튼을 누르면 그 섹션 위치로 스크롤한다', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await settle(page)
  const vh = await page.evaluate(() => window.innerHeight)
  // skills는 STATIONS에서 인덱스 2 — 스크롤 목표는 2 * 뷰포트 높이.
  await page
    .getByRole('navigation', { name: 'System map' })
    .getByRole('button', { name: 'Skills' })
    .click()
  await page.waitForFunction(
    (h) => Math.abs(window.scrollY - h * 2) < 8,
    vh,
    { timeout: 8000 },
  )
})

test('스크롤하면 카메라 마커가 따라 움직인다', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await settle(page)
  const marker = page.locator('circle.minimap-marker')
  const before = await marker.getAttribute('cy')
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 3))
  await expect
    .poll(async () => marker.getAttribute('cy'), { timeout: 8000 })
    .not.toBe(before)
})

test('미니맵은 모바일 뷰포트에서는 렌더하지 않는다', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 500, height: 900 } })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('nav.minimap')).toHaveCount(0)
  await context.close()
})
