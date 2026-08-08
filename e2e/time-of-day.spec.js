import { test, expect } from '@playwright/test'

// 등급 체인(computeGrade → setGrade → 유니폼) 자체의 정확성은
// evanSystem.test.js의 단위 테스트가 이미 증명한다 — 이 스펙은 그걸 다시
// 증명하지 않는다. setFixedTime은 Date만 고정할 뿐 rAF와 THREE.Clock의
// 실시간 t는 그대로 흐르므로, 별 회전과 필름 그레인(postfx의 hash12 시드)이
// 매 로드마다 픽셀을 바꾼다 — 그래서 night와 day 스크린샷이 다르다는 사실만으로
// 등급이 원인이라고 단정할 수 없다. 여기서는 등급이 꽂힌 씬이 두 시각 모두
// 정상적으로 마운트되고 렌더된다는 스모크 테스트로만 취급한다.
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
