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
]

test('gallery shows 11 curated works', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.carousel-card')).toHaveCount(11)
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
