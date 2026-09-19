import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__arrivalDone = false
    window.addEventListener('space-arrival:done', () => { window.__arrivalDone = true })
  })
})

test('첫 방문 인트로가 콘솔 에러 없이 끝나고 히어로가 나타난다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/', { waitUntil: 'commit' })
  // 콘텐츠는 먼저 표시되고, 짧은 배경 연출은 독립적으로 마무리된다.
  await expect(page.locator('.hero-title').first()).toBeVisible({ timeout: 20000 })
  await waitUntilSettled(page)
  expect(errors).toEqual([])
})

// 콘텐츠 표시는 배경 연출과 독립적이므로 종결 이벤트를 직접 확인한다.
async function waitUntilSettled(page) {
  await page.locator('section.hero').waitFor({ timeout: 20000 })
  await page.waitForFunction(() => window.__arrivalDone, null, { timeout: 30000 })
}

// 세션 게이트의 "판단" 자체는 introSequence.test.js가 결정적으로 검증한다
// (shouldPlayIntro({seen:true}) === false). 여기서 검증하는 것은 그 판단이
// 실제로 배선돼 있는지다 — 인트로가 끝나면 플래그가 기록되고, 이미 기록된
// 세션으로 다시 들어와도 오프닝이 매달리지 않고 끝까지 돈다.
//
// 첫 방문과 재방문의 소요 시간을 비교하는 방식은 쓰지 않는다: 전체 스위트를
// 병렬로 돌리면 부하 때문에 재방문이 첫 방문보다 느려지는 경우가 실제로
// 관측됐다(첫 7950ms vs 재방문 10172ms). 벽시계 비교는 이 환경에서 신뢰할 수
// 없다.
test('인트로 완료 시 세션 플래그가 기록되고, 재방문 경로도 끝까지 돈다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' })
  await waitUntilSettled(page)

  const seen = await page.evaluate(() => sessionStorage.getItem('evanSystemIntroSeen'))
  expect(seen).toBe('1')

  await page.reload({ waitUntil: 'commit' })
  await waitUntilSettled(page)

  // 재방문에서도 플래그가 유지돼야 다음 진입까지 인트로가 다시 뜨지 않는다.
  const seenAfter = await page.evaluate(() => sessionStorage.getItem('evanSystemIntroSeen'))
  expect(seenAfter).toBe('1')
})

test('인트로가 끝나면 도착 시퀀스까지 종결된다', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' })
  const hero = page.locator('section.hero')
  await expect(hero).not.toHaveClass(/hero--awaiting-arrival/)
  await waitUntilSettled(page)
  await expect(page.locator('canvas').first()).toBeVisible()
})

test('인트로 도중 라우트를 떠나도 돌아오면 완성 상태다', async ({ page }) => {
  const errors = []
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/', { waitUntil: 'commit' })
  // 인트로가 실제로 시작된 뒤(플래그 기록 = 두 번째 프레임) 곧바로 이탈한다.
  await page.waitForFunction(
    () => sessionStorage.getItem('evanSystemIntroSeen') === '1',
    { timeout: 20000 },
  )
  // SpaceBackground는 클라이언트 사이드 라우팅(react-router pushState)에서만
  // 마운트가 유지된다 — page.goto()는 실제 브라우저 내비게이션이라 매번
  // 문서를 새로 로드해 SpaceBackground를 처음부터 다시 마운트시키므로, 버그가
  // 재현되는 "라우트가 바뀌어도 언마운트되지 않는" 경로를 전혀 타지 않는다.
  // 네비 링크 클릭 + 브라우저 뒤로가기로 실제 재현 경로를 그대로 따른다.
  // 데스크톱 네비바에는 더 이상 Guestbook 링크가 없다 — 앱 안에서 그곳으로 가는
  // 유일한 경로는 버거 메뉴 오버레이인데, 그 오버레이는 768px 초과에서 CSS로
  // 감춰져 있어 좌표 클릭이 닿지 않는다. 여기서 확인하려는 것은 "클릭이 보이는
  // 위치에 있는가"가 아니라 SPA 라우팅을 거쳤을 때의 마운트 유지이므로, 노드에
  // 이벤트를 직접 발화시킨다.
  await page.locator('.nav-burger').dispatchEvent('click')
  await page.locator('.nav-mobile a[href="/guestbook"]').dispatchEvent('click')
  await page.waitForURL('**/guestbook')
  await page.waitForTimeout(3000)
  await page.goBack()
  await page.waitForURL('http://localhost:5173/')
  await waitUntilSettled(page)
  await expect(page.locator('.hero-title-holo-wrap')).toHaveCSS('opacity', '1')
  expect(errors).toEqual([])
})
