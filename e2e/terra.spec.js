import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('hwAccelNoticeDismissed', '1'))
})

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await page.screenshot({ path: testInfo.outputPath('failure.png') }).catch(() => {})
    console.log(await page.locator('.ej-canvas canvas').getAttribute('data-tile-stats', { timeout: 1000 }).catch(() => 'No canvas'))
  }
})

test('Terra flies to real landmarks, allows orbiting, and returns to Earth', async ({ page }, testInfo) => {
  test.setTimeout(480000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /THREE.WebGLProgram|Shader Error/.test(message.text())) errors.push(message.text())
  })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('/gallery/terra')
  const stage = page.locator('.ej-stage')
  const canvas = page.locator('.ej-canvas canvas')
  await expect(canvas).toBeVisible({ timeout: 15000 })
  await expect(stage).toHaveAttribute('data-phase', 'orbit')
  await expect(canvas).toHaveAttribute('data-preload-destination', 'paris')
  await expect.poll(async () => Number(await canvas.getAttribute('data-preloaded-tiles')), { timeout: 30000 }).toBeGreaterThan(0)
  await expect(stage).toHaveAttribute('data-phase', 'orbit')
  await page.screenshot({ path: testInfo.outputPath('01-earth.png') })

  const initialPosition = await canvas.getAttribute('data-camera-position')
  await page.mouse.move(1050, 450)
  await page.mouse.wheel(0, 450)
  await expect(stage).toHaveAttribute('data-phase', 'flight')
  await expect(canvas).not.toHaveAttribute('data-camera-position', initialPosition)

  const places = ['paris', 'rome', 'new-york', 'rio', 'sydney']
  for (let index = 0; index < places.length; index++) {
    await page.locator('.ej-itinerary button').nth(index).click()
    await expect(stage).toHaveAttribute('data-destination', places[index])
    await expect(stage).toHaveAttribute('data-phase', 'arrived', { timeout: 90000 })
    await expect(stage).toHaveAttribute('data-tiles', 'ready', { timeout: 90000 })
    await expect.poll(async () => Number(await canvas.getAttribute('data-camera-altitude')), { timeout: 10000 }).toBeLessThan(650)
    await expect.poll(async () => Number(await stage.getAttribute('data-visible-tiles'))).toBeGreaterThan(0)
    await expect(page.locator('.ej-attribution')).toContainText('Google Maps')
    await expect(canvas).toHaveAttribute('data-preload-destination', places[Math.min(index + 1, places.length - 1)])
    await page.screenshot({ path: testInfo.outputPath(`${index + 2}-${places[index]}.png`) })
    if (index === 1) {
      await page.getByRole('button', { name: /Explore this place/ }).click()
      await expect(page.locator('.ej-scroll')).toHaveClass(/ej-inspecting/)
      const before = await canvas.getAttribute('data-camera-position')
      await page.mouse.move(980, 400)
      await page.mouse.down()
      await page.mouse.move(1140, 440, { steps: 15 })
      await page.mouse.up()
      await expect(canvas).not.toHaveAttribute('data-camera-position', before)
      await page.screenshot({ path: testInfo.outputPath('rome-orbit.png') })
      await page.getByRole('button', { name: /Return to the journey/ }).click()
      await expect(page.locator('.ej-scroll')).not.toHaveClass(/ej-inspecting/)
    }
  }
  await page.getByRole('button', { name: /Back to Earth/ }).click()
  await expect(stage).toHaveAttribute('data-phase', 'orbit', { timeout: 15000 })
  await page.getByRole('link', { name: '← Lab', exact: true }).click()
  await expect(page).toHaveURL(/\/gallery$/)
  await page.goto('/gallery/terra')
  await expect(page.locator('.ej-canvas canvas')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('Terra keeps the itinerary usable when the map service is unavailable', async ({ page }) => {
  await page.route('https://tile.googleapis.com/**', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 403, message: 'Unavailable' } }) }))
  await page.goto('/gallery/terra')
  await page.locator('.ej-itinerary button').nth(1).click()
  await expect(page.locator('.ej-stage')).toHaveAttribute('data-tiles', 'unavailable')
  await expect(page.locator('.ej-notice')).toContainText('3D imagery is unavailable')
  await page.locator('.ej-itinerary button').last().click()
  await expect(page.locator('.ej-stage')).toHaveAttribute('data-destination', 'sydney')
  await expect(page.getByRole('button', { name: /Reconnect/ })).toBeVisible()
})

test('Terra supports mobile scrolling, Korean, and reduced motion', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('https://tile.googleapis.com/**', (route) => route.abort())
  await page.goto('/gallery/terra')
  await expect(page.locator('.ej-scroll')).toHaveClass(/ej-calm/)
  await expect(page.locator('.ej-canvas canvas')).toHaveCSS('touch-action', 'pan-y')
  await page.getByRole('button', { name: 'Switch to Korean' }).click()
  await expect(page.getByRole('button', { name: /여행 시작하기/ })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('mobile-earth.png') })
  await page.locator('.ej-itinerary button').nth(1).click()
  await expect(page.locator('.ej-stage')).toHaveAttribute('data-destination', 'rome')
  await expect(page.locator('.ej-story h1')).toContainText('콜로세움')
  await page.screenshot({ path: testInfo.outputPath('mobile-rome.png') })
  expect(await page.locator('.ej-stage').evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true)
  const scroller = page.locator('.ej-scroll')
  await scroller.focus()
  await page.keyboard.press('Home')
  await expect(page.locator('.ej-stage')).toHaveAttribute('data-phase', 'orbit')
  const touch = await page.context().newCDPSession(page)
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 370 }] })
  for (let y = 350; y >= 190; y -= 20) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300, y }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
})

test('Terra keeps its controls reachable on short landscape screens', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('https://tile.googleapis.com/**', (route) => route.abort())
  await page.goto('/gallery/terra')
  await expect(page.locator('.ej-canvas canvas')).toBeVisible({ timeout: 15000 })
  for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }, { width: 1024, height: 500 }]) {
    await page.setViewportSize(viewport)
    await page.screenshot({ path: testInfo.outputPath(`landscape-earth-${viewport.width}.png`) })
    for (const locator of [page.locator('.ej-header'), page.locator('.ej-begin'), page.locator('.ej-footer'), page.locator('.ej-attribution')]) {
      const box = await locator.boundingBox()
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    }
    await page.locator('.ej-itinerary button').nth(1).click()
    await expect(page.locator('.ej-stage')).toHaveAttribute('data-destination', 'rome')
    await expect(page.locator('.ej-story h1')).toContainText('Colosseum')
    const story = await page.locator('.ej-story').boundingBox()
    const footer = await page.locator('.ej-footer').boundingBox()
    expect(story.y + story.height).toBeLessThan(footer.y)
    await page.screenshot({ path: testInfo.outputPath(`landscape-rome-${viewport.width}.png`) })
    await page.getByRole('button', { name: /Back to Earth/ }).click()
    await expect(page.locator('.ej-stage')).toHaveAttribute('data-phase', 'orbit')
  }
})

test('Terra can recreate its scene after losing the graphics context', async ({ page }) => {
  await page.route('https://tile.googleapis.com/**', (route) => route.abort())
  await page.goto('/gallery/terra')
  const canvas = page.locator('.ej-canvas canvas')
  await expect(canvas).toBeVisible({ timeout: 15000 })
  const oldCanvas = await canvas.elementHandle()
  await canvas.evaluate((element) => element.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext())
  await expect(page.getByRole('alert')).toContainText('The 3D view is unavailable')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(canvas).toHaveCount(1)
  expect(await oldCanvas.evaluate((element) => element.isConnected)).toBe(false)
  await page.locator('.ej-itinerary button').nth(1).click()
  await expect(page.locator('.ej-stage')).toHaveAttribute('data-phase', 'approach', { timeout: 15000 })
  await expect(page.locator('.ej-notice')).toContainText('3D imagery is unavailable')
})

test('Terra keeps a stable globe when a delayed map connection fails', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let rejectMap
  const failure = new Promise((resolve) => { rejectMap = resolve })
  await page.route('https://tile.googleapis.com/**', async (route) => {
    await failure
    await route.abort()
  })
  await page.goto('/gallery/terra')
  await page.locator('.ej-itinerary button').nth(1).click()
  const stage = page.locator('.ej-stage')
  await expect(stage).toHaveAttribute('data-phase', 'approach')
  await expect(stage).toHaveAttribute('data-tiles', 'loading')
  await page.waitForTimeout(1500)
  // Sample only the 3D view, away from changing labels and controls.
  const clip = { x: 850, y: 350, width: 160, height: 160 }
  const before = await page.screenshot({ clip })
  rejectMap()
  await expect(stage).toHaveAttribute('data-tiles', 'unavailable')
  await expect.poll(async () => Number(await page.locator('.ej-canvas canvas').getAttribute('data-camera-altitude'))).toBeGreaterThan(1000000)
  await expect.poll(async () => before.equals(await page.screenshot({ clip }))).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('recovered-globe.png') })
})

test('Terra does not offer ground inspection before the map is ready', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let release
  const pending = new Promise((resolve) => { release = resolve })
  await page.route('https://tile.googleapis.com/**', async (route) => { await pending; await route.abort() })
  try {
    await page.goto('/gallery/terra')
    const canvas = page.locator('.ej-canvas canvas')
    await expect(canvas).toBeVisible({ timeout: 15000 })
    await page.locator('.ej-scroll').evaluate((element) => { element.scrollTop = (element.scrollHeight - element.clientHeight) * 1.2 / 5 })
    await expect(page.locator('.ej-stage')).toHaveAttribute('data-phase', 'approach')
    const before = (await canvas.getAttribute('data-camera-position')).split(',').map(Number)
    await expect(page.getByRole('button', { name: /Explore this place/ })).toHaveCount(0)
    await expect(page.locator('.ej-scroll')).not.toHaveClass(/ej-inspecting/)
    await page.waitForTimeout(300)
    const after = (await canvas.getAttribute('data-camera-position')).split(',').map(Number)
    const distance = Math.hypot(...after.map((value, index) => value - before[index]))
    expect(distance).toBeLessThan(2)
    await expect(canvas).toHaveAttribute('data-camera-position', before.join(','))
  } finally { release() }
})

test('Terra reports unavailable imagery when the root loads but terrain requests fail', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let failedTiles = 0
  await page.route('https://tile.googleapis.com/**', (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/root.json')) return route.continue()
    failedTiles++
    return route.abort()
  })
  await page.goto('/gallery/terra')
  await page.locator('.ej-itinerary button').nth(1).click()
  await expect.poll(() => failedTiles, { timeout: 15000 }).toBeGreaterThan(0)
  await expect(page.locator('.ej-stage')).toHaveAttribute('data-tiles', 'unavailable', { timeout: 10000 })
  await expect(page.getByRole('button', { name: /Reconnect/ })).toBeVisible()
  await page.getByRole('button', { name: /Back to Earth/ }).click()
  await expect(page.locator('.ej-stage')).toHaveAttribute('data-phase', 'orbit')
})

test('Terra stops background work when leaving during rapid destination changes', async ({ page }) => {
  test.setTimeout(120000)
  await page.addInitScript(() => {
    // Simulate a slow GPU whose background shaders are still compiling at exit.
    const getProgramParameter = WebGL2RenderingContext.prototype.getProgramParameter
    WebGL2RenderingContext.prototype.getProgramParameter = function (program, parameter) {
      const extension = this.getExtension('KHR_parallel_shader_compile')
      if (extension && parameter === extension.COMPLETION_STATUS_KHR && this.canvas.closest('.ej-canvas')) return false
      return getProgramParameter.call(this, program, parameter)
    }
  })
  const errors = []
  let requests = 0
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (request.url().startsWith('https://tile.googleapis.com/')) requests++ })
  for (let visit = 0; visit < 3; visit++) {
    await page.goto('/gallery/terra')
    const canvas = page.locator('.ej-canvas canvas')
    await expect(canvas).toHaveCount(1)
    await expect.poll(async () => Number(await canvas.getAttribute('data-preloaded-tiles')), { timeout: 30000 }).toBeGreaterThan(0)
    for (const index of [4, 0, 2, 1]) await page.locator('.ej-itinerary button').nth(index).click()
    await expect(page.locator('.ej-stage')).toHaveAttribute('data-destination', 'rome', { timeout: 15000 })
    await page.getByRole('link', { name: '← Lab', exact: true }).click()
    await expect(canvas).toHaveCount(0)
    await page.waitForTimeout(500)
    const requestsAfterExit = requests
    await page.waitForTimeout(500)
    expect(requests).toBe(requestsAfterExit)
  }
  expect(errors).toEqual([])
})
