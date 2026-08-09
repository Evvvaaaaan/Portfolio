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
  const satelliteBtn = page
    .locator('.project-satellites')
    .getByRole('button', { name: new RegExp(FIRST.title) })
  await expect(satelliteBtn).toBeVisible({ timeout: 10000 })

  // force:true는 "안정될 때까지 대기"만 건너뛸 뿐 히트테스트까지 생략하지는
  // 않아야 한다 — 버튼 중심이 실제로 다른 요소(예: 도킹 패널의 갤러리 카드)에
  // 가려지지 않고 .project-satellites 안에서 그대로 히트되는지 직접
  // 확인한다. 패널이 위성 버튼을 완전히 덮던 회귀(Finding 1)가 다시
  // 생기면 이 assertion이 실패해야 한다.
  const box = await satelliteBtn.boundingBox()
  expect(box).not.toBeNull()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const hit = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y)
      return el?.closest('.project-satellites') ? 'clear' : 'blocked'
    },
    [cx, cy],
  )
  expect(hit).toBe('clear')

  await satelliteBtn.click({ force: true })
  await page.waitForURL(`**/projects/${FIRST.slug}`, { timeout: 15000 })
})

test('전환 대기 중에 다른 곳으로 직접 이동하면, 지연 발화하던 위성 전환이 그 이동을 덮어쓰지 않는다', async ({ page }) => {
  test.slow()
  await goToProjects(page)
  const satelliteBtn = page
    .locator('.project-satellites')
    .getByRole('button', { name: new RegExp(FIRST.title) })
  await expect(satelliteBtn).toBeVisible({ timeout: 10000 })
  await satelliteBtn.click({ force: true })

  // LabTransition의 onNavigate는 navAt(≈900ms: BOOST_CHARGE_MS + BOOST_PEAK_MS/2)에
  // 발화한다 — 그 전에 네비바로 직접 다른 라우트(/guestbook)로 이동한다.
  //
  // dispatchEvent('click')가 필요한 이유: 오버레이(.labtransition-overlay)가
  // released되기 전(≈1000ms)까지는 pointer-events:auto로 전체 화면을 덮는다.
  // 일반 .click()은 물론 .click({force:true})도(Playwright의 사전 액션 가능성
  // 검사만 건너뛸 뿐, 실제 이벤트는 여전히 화면 좌표 기준 브라우저 히트테스트를
  // 거쳐 최상단 요소=오버레이로 전달된다) 이 창 안에서는 링크에 닿지 못하고
  // 조용히 씹힌다 — 그 자체는 유효한 보호막이지만, 포커스된 링크에서 Enter를
  // 누르는 등 좌표 히트테스트를 거치지 않는 활성화 경로는 여전히 열려 있다.
  // dispatchEvent는 좌표가 아니라 노드를 직접 대상으로 이벤트를 발생시켜 그런
  // 경로를 흉내 내고, 이 테스트가 실제로 잡으려는 App.jsx의 상태 경쟁만
  // 순수하게 검증한다.
  await page.waitForTimeout(300)
  await page.locator('.nav-links a[href="/guestbook"]').dispatchEvent('click')
  await page.waitForURL('**/guestbook', { timeout: 5000 })

  // 전환의 전체 재생 시간(BOOST_CHARGE_MS 800 + BOOST_PEAK_MS 200 +
  // BOOST_RELEASE_MS 700 + TEXT_HOLD_MS 900 + TEXT_OUT_MS 400 = 3000ms)이
  // navAt 이후로도 한참 지나도록 기다린다. 대기 중이던 전환이 취소되지 않았다면
  // 이 시점에 지연 발화한 onNavigate가 /projects/<slug>로 되돌려 사용자가 직접
  // 고른 /guestbook을 덮어쓴다 — 그 회귀를 잡는 assertion이다.
  await page.waitForTimeout(3000)
  expect(page.url()).toContain('/guestbook')
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
