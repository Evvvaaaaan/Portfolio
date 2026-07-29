import { test, expect } from '@playwright/test'

const ids = [
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
]

test('gallery shows 14 curated works', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.carousel-card')).toHaveCount(14)
})

test('descent completes and the gallery lands', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.lab-arrived')).toBeVisible()
})

// 링이 3D로 서 있는지 검사한다. transform-style이 flat으로 무너지면 정사영이
// 되어 각도 θ와 180-θ 패널이 같은 자리에 완전히 포개진다 — 14개가 7자리만
// 차지하게 되고, 아무리 돌려도 절반의 작품에는 영영 닿을 수 없다.
test('all 14 works occupy distinct positions on the ring', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.lab-stage[data-landed="true"]')).toBeVisible({ timeout: 15000 })

  const distinct = await page.evaluate(() => {
    const places = [...document.querySelectorAll('.carousel-card')].map((c) => {
      const r = c.getBoundingClientRect()
      return `${Math.round(r.x + r.width / 2)}/${Math.round(r.width)}`
    })
    return new Set(places).size
  })

  expect(distinct).toBe(14)
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

for (const id of ids) {
  test(`experiment ${id} renders a canvas without console errors`, async ({ page }) => {
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`/gallery/${id}`)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1500)
    expect(errors).toEqual([])
  })
}
