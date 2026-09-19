import { test, expect } from '@playwright/test'

const ids = [
  'spatial-studio',
  'particle-morph',
  'ink-flow',
  'neon-raymarch',
  'wind-atlas',
  'seismic-echo',
  'hand-conductor',
  'voice-bloom',
  'poster-lab',
  'solar-system',
  'deep-space',
  'earth-explorer',
  'non-euclidean-portals',
  'cosmic-mirror',
  'cloud-gallery',
  'procedural-city',
  'ship-in-a-bottle',
  'gothic-cathedral',
  'control-room',
  'video-wall',
  'midnight-dispatch',
  'fitting-studio',
  'terra',
  'living-paper',
  'curvature',
  'skybound',
]

test('gallery shows all curated works', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.carousel-card')).toHaveCount(ids.length)
})

test('descent completes and the gallery lands', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.lab-arrived')).toBeVisible()
})

// 링이 3D로 서 있는지 검사한다. transform-style이 flat으로 무너지면 정사영이
// 되어 각도 θ와 180-θ 패널이 같은 자리에 완전히 포개진다 — 작품들이 절반의
// 자리만 차지하게 되고, 아무리 돌려도 나머지 작품에는 영영 닿을 수 없다.
test('all works occupy distinct positions on the ring', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })

  const distinct = await page.evaluate(() => {
    const places = [...document.querySelectorAll('.carousel-card')].map((c) => {
      const r = c.getBoundingClientRect()
      return `${Math.round(r.x + r.width / 2)}/${Math.round(r.width)}`
    })
    return new Set(places).size
  })

  expect(distinct).toBe(ids.length)
})

test('exactly one work is active at a time', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.carousel-card.active')).toHaveCount(1)
})

test('dragging changes the active work', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })

  const before = await page.locator('.carousel-card.active').getAttribute('data-id')

  const scene = page.locator('.lab-scene')
  const box = await scene.boundingBox()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 20 })
  await page.mouse.up()
  await page.waitForTimeout(1200)

  const after = await page.locator('.carousel-card.active').getAttribute('data-id')
  expect(after).not.toBe(before)
})

test('the arrow button steps to the next work', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })

  const before = await page.locator('.carousel-card.active').getAttribute('data-id')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.waitForTimeout(900)

  const after = await page.locator('.carousel-card.active').getAttribute('data-id')
  expect(after).not.toBe(before)
})

test('clicking the front panel opens that work', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })

  const activeId = await page.locator('.carousel-card.active').getAttribute('data-id')
  await page.locator('.carousel-card.active').click()
  await expect(page).toHaveURL(new RegExp(`/gallery/${activeId}$`))
})

test('the lab renders without console errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(1000)
  expect(errors).toEqual([])
})

// These works can render without a canvas; their actual flows have separate tests.
const NO_CANVAS_IDS = new Set(['video-wall', 'living-paper'])
for (const id of ids.filter((id) => !NO_CANVAS_IDS.has(id))) {
  test(`experiment ${id} renders a canvas without console errors`, async ({ page }) => {
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`/gallery/${id}`)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1500)
    expect(errors).toEqual([])
  })
}

// 화면 클릭 → 그 앞으로 다가가기. 부채꼴 바깥쪽 화면일수록 각도가 커서, 카메라를
// 놓을 방향을 화면이 실제로 바라보는 법선이 아니라 반지름 방향으로 잡으면 화면
// 뒤로 날아가 등짝을 보게 된다 — 가장 많이 돌아간 끝 화면으로 검사한다.
test('clicking a control-room screen walks the camera up to its front', async ({ page }) => {
  await page.goto('/gallery/control-room')
  await expect(page.locator('canvas.control-room-gl')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.control-room-screen')).toHaveCount(4)
  await page.waitForTimeout(2500)

  const target = page.locator('.control-room-screen').last()
  const before = await target.boundingBox()
  await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2)
  await page.waitForTimeout(2500)
  const after = await target.boundingBox()

  // 다가갔다면 화면이 눈에 띄게 커지고, 정면으로 서니 가로 중앙에 온다
  expect(after.width).toBeGreaterThan(before.width * 1.5)
  const centerX = page.viewportSize().width / 2
  expect(Math.abs(after.x + after.width / 2 - centerX)).toBeLessThan(
    Math.abs(before.x + before.width / 2 - centerX)
  )
})

test('experiment video-wall renders its panel grid without console errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/gallery/video-wall')
  await expect(page.locator('.vw-tile').first()).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(1500)
  expect(errors).toEqual([])
})
