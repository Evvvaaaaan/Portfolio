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
