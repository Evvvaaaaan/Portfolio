import { test, expect } from '@playwright/test'
import { projects } from '../src/data/projects.js'

const FIRST = projects[0]

// 도착 시퀀스가 끝난 뒤 projects 정거장(인덱스 3)으로 이동해야 위성이 보인다.
async function goToProjects(page) {
  await page.goto('/')
  await expect(page.locator('section.hero')).not.toHaveClass(
    /hero--awaiting-arrival/,
    { timeout: 20000 },
  )
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 3))
  // 레일 스무딩(0.08/frame)이 정거장에 정착할 시간을 준다.
  await page.waitForTimeout(2500)
}

test('projects 정거장에서 위성 버튼이 나타난다', async ({ page }) => {
  test.slow()
  await goToProjects(page)
  await expect(page.locator('button.satellite-btn').first()).toBeVisible({ timeout: 10000 })
})

test('위성 버튼의 접근성 이름에 프로젝트 제목이 들어간다', async ({ page }) => {
  test.slow()
  await goToProjects(page)
  // Projects 섹션의 캐러셀 점 버튼도 프로젝트 제목을 aria-label로 쓰므로
  // .project-satellites로 범위를 좁혀야 정확히 위성 버튼을 가리킨다.
  await expect(
    page.locator('.project-satellites').getByRole('button', { name: new RegExp(FIRST.title) }),
  ).toBeVisible({ timeout: 10000 })
})

test('홈 정거장에서는 위성 버튼이 없다 — 누를 수 없는 버튼이 떠 있으면 안 된다', async ({ page }) => {
  test.slow()
  await goToProjects(page)
  await expect(page.locator('button.satellite-btn').first()).toBeVisible({ timeout: 10000 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(2500)
  await expect(page.locator('button.satellite-btn')).toHaveCount(0)
})

test('위성을 누르면 그 프로젝트 상세 페이지로 이동한다', async ({ page }) => {
  test.slow()
  await goToProjects(page)
  // 위와 같은 이유로 .project-satellites 범위 안에서 클릭해야 한다.
  // 위성은 궤도를 계속 돈다(의도된 동작) — 좌표가 매 프레임 실제로 바뀌므로
  // Playwright의 기본 "안정될 때까지 대기"는 영원히 끝나지 않는다. force로
  // 안정성 대기만 건너뛴다; 보이는지·이름이 맞는지·클릭 후 이동하는지는
  // 그대로 검증한다.
  await page
    .locator('.project-satellites')
    .getByRole('button', { name: new RegExp(FIRST.title) })
    .click({ force: true })
  await page.waitForURL(`**/projects/${FIRST.slug}`, { timeout: 15000 })
})

test('오버레이 컨테이너는 뒤의 콘텐츠 클릭을 막지 않는다', async ({ page }) => {
  test.slow()
  await goToProjects(page)
  await expect(page.locator('button.satellite-btn').first()).toBeVisible({ timeout: 10000 })
  // 오버레이는 inset:0으로 화면 전체를 덮지만 pointer-events:none이어야 한다.
  // 위성 버튼에서 떨어진 지점의 hit-test가 오버레이 컨테이너에 걸리면 실패.
  const hit = await page.evaluate(() => {
    const el = document.elementFromPoint(12, window.innerHeight - 12)
    return el?.closest('.project-satellites') ? 'blocked' : 'clear'
  })
  expect(hit).toBe('clear')
})
