import { test, expect } from '@playwright/test'

test('a delayed map never sends the camera into unrendered ground', async ({ page }, testInfo) => {
  await page.addInitScript(() => sessionStorage.setItem('hwAccelNoticeDismissed', '1'))
  let release
  const pending = new Promise((resolve) => { release = resolve })
  await page.route('https://tile.googleapis.com/**', async (route) => { await pending; await route.abort() })
  try {
    await page.goto('/gallery/terra')
    const canvas = page.locator('.ej-canvas canvas')
    const scroller = page.locator('.ej-scroll')
    await page.locator('.ej-itinerary button').nth(1).click()
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop / (element.scrollHeight - element.clientHeight) * 5)).toBeCloseTo(1.94, 2)
    await expect(page.locator('.ej-stage')).toHaveAttribute('data-destination', 'rome')
    await page.screenshot({ path: testInfo.outputPath('delayed-map.png') })
    const altitude = Number(await canvas.getAttribute('data-camera-altitude'))
    console.log(JSON.stringify({ altitude, visibleTiles: await page.locator('.ej-stage').getAttribute('data-visible-tiles') }))
    expect(altitude).toBeGreaterThan(1000000)
    await expect(page.locator('.ej-stage')).toHaveAttribute('data-phase', 'approach')
    await expect(page.getByRole('button', { name: /Explore this place/ })).toHaveCount(0)
    const before = await scroller.evaluate((element) => element.scrollTop)
    await page.mouse.move(1000, 400)
    await page.mouse.wheel(0, 700)
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(before)
  } finally { release() }
})

test('Paris stays in the map scene throughout a scroll arrival and departure', async ({ page }, testInfo) => {
  await page.addInitScript(() => sessionStorage.setItem('hwAccelNoticeDismissed', '1'))
  await page.goto('/gallery/terra')
  const scroller = page.locator('.ej-scroll')
  for (const progress of [0.3, 0.6, 0.94, 1.02]) {
    await scroller.evaluate((element, p) => { element.scrollTop = (element.scrollHeight - element.clientHeight) * p / 5 }, progress)
    await page.waitForTimeout(600)
    await page.screenshot({ path: testInfo.outputPath(`scroll-${progress}.png`) })
    console.log(JSON.stringify({ progress, tiles: await page.locator('.ej-stage').getAttribute('data-tiles'), artwork: await page.locator('.ej-stage').getAttribute('data-artwork'), altitude: await page.locator('.ej-canvas canvas').getAttribute('data-camera-altitude') }))
  }
  await expect(page.locator('.ej-artwork')).toHaveCount(0)
})
