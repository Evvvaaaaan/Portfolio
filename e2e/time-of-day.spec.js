import { test, expect } from '@playwright/test'

// 이 스펙이 증명하는 것: 방문 시각이 자정이든 정오든, 등급이 씬에 꽂히는
// 경로(SpaceBackground.jsx의 setGrade 호출)가 도착 시퀀스를 깨뜨리지
// 않고, 캔버스가 정상적으로 렌더되며, 콘솔/페이지 에러가 없다는 것 —
// 딱 그만큼의 스모크 테스트다.
//
// 이 스펙이 증명하지 않는 것: 등급이 실제로 "다른 색"을 만들어내는지는
// 여기서 다루지 않는다. setFixedTime은 Date만 고정할 뿐 rAF와
// THREE.Clock의 실시간 t는 그대로 흐르므로, 별 회전과 필름 그레인
// (postfx의 hash12 시드)이 매 로드마다 픽셀을 바꾼다 — 두 스크린샷이
// 다르다는 사실만으로는 등급이 원인이라고 단정할 수 없다(항상 참인
// 동어반복이 된다). computeGrade → setGrade → 유니폼까지의 등급 체인
// 자체의 정확성은 src/components/SpaceBackground/evanSystem.test.js의
// 단위 테스트("시각이 다르면 씬에 실제로 다른 색이 꽂힌다")가 이미
// 고정해 증명한다 — 이 스펙은 그걸 다시 증명하지 않는다.
async function mountAt(browser, isoTime) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  // installFakeTimers가 아니라 setFixedTime — 애니메이션 루프의 rAF는 그대로
  // 흘러야 씬이 정상적으로 그려진다. new Date()만 고정하면 된다.
  await page.clock.setFixedTime(new Date(isoTime))
  await page.goto('/')
  await expect(page.locator('section.hero')).not.toHaveClass(
    /hero--awaiting-arrival/,
    { timeout: 20000 },
  )
  await expect(page.locator('canvas').first()).toBeVisible()

  await context.close()
  expect(errors).toEqual([])
}

test('자정 방문 — 등급이 꽂혀도 도착 시퀀스와 렌더가 정상이다', async ({ browser }) => {
  test.slow()
  await mountAt(browser, '2026-08-08T00:00:00')
})

test('정오 방문 — 등급이 꽂혀도 도착 시퀀스와 렌더가 정상이다', async ({ browser }) => {
  test.slow()
  await mountAt(browser, '2026-08-08T12:00:00')
})
