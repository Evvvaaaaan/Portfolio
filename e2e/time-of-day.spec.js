import { test, expect } from '@playwright/test'

// 씬은 캔버스 하나라 DOM으로는 색을 읽을 수 없다 — 시계를 고정한 두 시각에서
// 같은 정거장을 렌더해 픽셀이 실제로 다른지로 검증한다.
async function shotAt(browser, isoTime) {
  const context = await browser.newContext()
  const page = await context.newPage()
  // installFakeTimers가 아니라 setFixedTime — 애니메이션 루프의 rAF는 그대로
  // 흘러야 씬이 정상적으로 그려진다. new Date()만 고정하면 된다.
  await page.clock.setFixedTime(new Date(isoTime))
  await page.goto('/')
  await expect(page.locator('section.hero')).not.toHaveClass(
    /hero--awaiting-arrival/,
    { timeout: 20000 },
  )
  // 항성이 화면을 크게 채우는 home 정거장에서 찍는다 — 색 차이가 가장 크다.
  await page.waitForTimeout(2500)
  const buf = await page.locator('canvas').first().screenshot()
  await context.close()
  return buf
}

test('방문 시각이 다르면 항성계의 톤이 실제로 달라진다', async ({ browser }) => {
  test.slow()
  // 심야(0시)와 한낮(12시) — 키프레임 표에서 가장 멀리 떨어진 두 지점.
  const night = await shotAt(browser, '2026-08-08T00:00:00')
  const day = await shotAt(browser, '2026-08-08T12:00:00')
  expect(night.equals(day)).toBe(false)
})
