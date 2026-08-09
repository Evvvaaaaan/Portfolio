import { test, expect } from '@playwright/test'

// AudioContext를 실제로 만들지 않고 계측한다 — 헤드리스 크로미움은 오디오
// 출력이 없어 "소리가 났는지"를 직접 확인할 수 없다. 대신 컨텍스트가 언제
// 몇 개 만들어졌는지를 기록해 "자동 재생하지 않는다"와 "클릭에 반응한다"를
// 각각 증명한다. close()도 함께 세어 "언마운트되면 컨텍스트를 실제로 닫는다"
// (좁혔다 넓혔다를 반복해도 컨텍스트가 쌓이지 않는다)를 증명한다.
async function instrument(page) {
  await page.addInitScript(() => {
    window.__audioCreated = 0
    window.__audioClosed = 0
    const Real = window.AudioContext || window.webkitAudioContext
    window.AudioContext = class extends Real {
      constructor(...args) {
        super(...args)
        window.__audioCreated += 1
      }
      close(...args) {
        window.__audioClosed += 1
        return super.close(...args)
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

test('1024px 미만 폭에서는 사운드 토글을 렌더하지 않는다', async ({ page }) => {
  // 769~1023px는 네비바 폭이 가장 빠듯한 구간이라, 네 번째 컨트롤을 아이콘
  // 전용으로 줄여도 기존 세 컨트롤의 여백을 잠식해 오버플로가 난다(실측:
  // 900px에서 사운드 버튼 유무에 따라 오버플로 0px → 28px). CSS로만 숨기면
  // 버튼이 DOM/탭 순서에 남아 이 폭의 스크린리더 사용자가 보이지 않는
  // 컨트롤에 닿게 되므로, 렌더링 자체를 막는다.
  await page.setViewportSize({ width: 900, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Autopilot' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Sound on' })).toHaveCount(0)
})

test('좁혀서 언마운트되면 컨텍스트를 닫고, 다시 넓혀도 컨텍스트가 쌓이지 않는다', async ({ page }) => {
  await instrument(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Sound on' }).click()
  await expect(page.getByRole('button', { name: 'Sound off' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(await page.evaluate(() => window.__audioCreated)).toBe(1)

  // 1024px 밑으로 좁히면 SoundToggle이 언마운트된다. dispose()만으로는
  // AudioContext 자체가 안 닫혀 살아남는다 — close()까지 불려야 한다.
  await page.setViewportSize({ width: 900, height: 900 })
  await expect(page.getByRole('button', { name: 'Sound on' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.__audioClosed)).toBe(1)

  // 다시 넓히면 재마운트된다 — audioRef는 빈 ref로 새로 시작하므로 다시
  // 켜면 두 번째 컨텍스트가 생긴다. 그러나 "살아있는"(생성 - 닫힘) 컨텍스트
  // 수는 여전히 1이어야 한다 — 좁혔다 넓혔다를 반복해도 컨텍스트가 쌓이지
  // 않고 매 언마운트마다 정확히 회수됨을 증명한다.
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('button', { name: 'Sound on' }).click()
  await expect(page.getByRole('button', { name: 'Sound off' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const [created, closed] = await page.evaluate(() => [window.__audioCreated, window.__audioClosed])
  expect(created).toBe(2)
  expect(closed).toBe(1)
  expect(created - closed).toBe(1)
})
