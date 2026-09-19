import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { env } from 'node:process'

for (const scenario of [
  { name: 'desktop', viewport: { width: 1440, height: 960 }, cpuRate: 1 },
  { name: 'mobile constrained', viewport: { width: 390, height: 844 }, cpuRate: 4 },
]) test(`measures Terra frames while live maps stream during scrolling (${scenario.name})`, async ({ page }, testInfo) => {
  test.setTimeout(120000)
  await page.setViewportSize(scenario.viewport)
  if (scenario.cpuRate > 1) {
    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setCPUThrottlingRate', { rate: scenario.cpuRate })
    await session.send('Network.enable')
    await session.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 750000, uploadThroughput: 250000, connectionType: 'cellular4g' })
  }
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    sessionStorage.setItem('hwAccelNoticeDismissed', 'true')
    const probe = { active: false, frames: [], renders: [], work: [], longTasks: [] }
    window.terraProbe = probe
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (callback) => raf((time) => {
      const start = performance.now()
      callback(time)
      if (probe.active) probe.work.push(performance.now() - start)
    })
    const sample = (time) => {
      if (probe.active) probe.frames.push(time)
      raf(sample)
    }
    raf(sample)
    const clear = WebGL2RenderingContext.prototype.clear
    WebGL2RenderingContext.prototype.clear = function (mask) {
      if (probe.active && this.canvas.closest('.ej-canvas')) probe.renders.push(performance.now())
      return clear.call(this, mask)
    }
    new PerformanceObserver((list) => {
      if (probe.active) probe.longTasks.push(...list.getEntries().map((entry) => entry.duration))
    }).observe({ type: 'longtask', buffered: false })
  })
  let requests = 0, streamingRequests = 0
  page.on('request', (request) => {
    if (request.url().startsWith('https://tile.googleapis.com/')) requests++
  })
  await page.goto('/gallery/terra')
  await expect(page.locator('.ej-canvas canvas')).toBeVisible({ timeout: 15000 })
  let profiler
  if (env.TERRA_PROFILE) {
    profiler = await page.context().newCDPSession(page)
    await profiler.send('Profiler.enable')
    await profiler.send('Profiler.start')
  }
  await page.waitForTimeout(5000)
  const entryRequests = requests
  const results = []
  for (const [name, destination, from, to] of [['orbit-to-paris', 'paris', 0, 0.94], ['paris-to-rome', 'rome', 0.94, 1.94]]) {
    const beforeRequests = requests
    const metrics = await page.evaluate(async ({ from, to, destination }) => {
      const probe = window.terraProbe
      probe.frames = []; probe.renders = []; probe.work = []; probe.longTasks = []
      const scroller = document.querySelector('.ej-scroll')
      const stage = document.querySelector('.ej-stage')
      const range = scroller.scrollHeight - scroller.clientHeight
      let firstMapProgress = null, firstArrivalProgress = null, prematureArrivals = 0, streamingFrames = 0
      probe.active = true
      const start = performance.now()
      await new Promise((resolve) => {
        const scroll = (time) => {
          const t = Math.min(1, (time - start) / 8000)
          scroller.scrollTop = range * (from + (to - from) * t) / 5
          const progress = from + (to - from) * t
          // Ignore the departure city's tiles at the beginning of the next leg.
          if (progress > Math.floor(to) + 0.5 && stage.dataset.destination === destination && Number(stage.dataset.visibleTiles) > 0 && firstMapProgress === null) firstMapProgress = progress
          if (stage.dataset.destination === destination && stage.dataset.phase === 'arrived') {
            if (firstArrivalProgress === null) firstArrivalProgress = progress
            if (stage.dataset.tiles !== 'ready' || Number(stage.dataset.visibleTiles) === 0) prematureArrivals++
          }
          const stats = JSON.parse(document.querySelector('.ej-canvas canvas').dataset.tileStats || '{}')
          if (stats.downloading > 0 || stats.parsing > 0) streamingFrames++
          if (t < 1) requestAnimationFrame(scroll)
          else resolve()
        }
        requestAnimationFrame(scroll)
      })
      probe.active = false
      const duration = performance.now() - start
      const intervals = (values) => values.slice(1).map((value, i) => value - values[i])
      const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] || 0
      const frames = intervals(probe.frames), renders = intervals(probe.renders)
      return {
        durationMs: duration, rafFps: probe.frames.length * 1000 / duration,
        renderFps: probe.renders.length * 1000 / duration,
        frameP95Ms: percentile(frames, 0.95), renderP95Ms: percentile(renders, 0.95),
        callbackP95Ms: percentile(probe.work, 0.95), maxFrameMs: Math.max(...frames),
        longTaskCount: probe.longTasks.length, maxLongTaskMs: Math.max(0, ...probe.longTasks),
        visibleTiles: Number(document.querySelector('.ej-stage').dataset.visibleTiles),
        firstMapProgress, firstArrivalProgress, prematureArrivals, streamingFrames,
      }
    }, { from, to, destination })
    streamingRequests += requests - beforeRequests
    results.push({ name, requests: requests - beforeRequests, ...metrics })
    await page.waitForTimeout(1500)
    if (scenario.cpuRate === 1) await expect(page.locator('.ej-stage')).toHaveAttribute('data-phase', 'arrived', { timeout: 30000 })
  }
  const report = { viewport: scenario.viewport, cpuRate: scenario.cpuRate, network: scenario.cpuRate > 1 ? '6 Mbps down / 2 Mbps up / 150ms latency' : 'unthrottled', entryRequests, streamingRequests, results }
  await mkdir(testInfo.outputDir, { recursive: true })
  if (profiler) {
    const { profile } = await profiler.send('Profiler.stop')
    await writeFile(testInfo.outputPath('cpu-profile.json'), JSON.stringify(profile))
  }
  await writeFile(testInfo.outputPath('frame-performance.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  await testInfo.attach('frame-performance.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' })
  expect(streamingRequests).toBeGreaterThan(0)
  expect(entryRequests).toBeGreaterThan(0)
  for (const result of results) {
    expect(result.renderFps / result.rafFps).toBeGreaterThan(0.9)
    if (scenario.cpuRate === 1) {
      expect(result.visibleTiles).toBeGreaterThan(0)
      expect(result.firstMapProgress).not.toBeNull()
      expect(result.prematureArrivals).toBe(0)
      if (result.firstArrivalProgress !== null) expect(result.firstMapProgress).toBeLessThanOrEqual(result.firstArrivalProgress)
    }
  }
  await page.getByRole('button', { name: /Back to Earth/ }).click()
  await expect(page.locator('.ej-stage')).toHaveAttribute('data-phase', 'orbit', { timeout: 15000 })
  expect(errors).toEqual([])
})
