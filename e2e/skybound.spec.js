import { test, expect } from '@playwright/test'
import { GATES } from '../src/experiments/Skybound/game.js'

const url = '/gallery/skybound?debug'
async function open(page) {
  await page.addInitScript(() => sessionStorage.setItem('hwAccelNoticeDismissed', '1'))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.sb-canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: '비행 시작하기' })).toBeVisible()
}
async function start(page) { await open(page); await page.getByRole('button', { name: '비행 시작하기' }).click() }

test('renders the aircraft, flies with keys, brakes and switches camera', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await open(page)
  await expect(page.locator('.sb-canvas')).toHaveAttribute('data-assets', 'ready')
  expect(await page.evaluate(() => window.__skybound.assets())).toEqual({ aircraft: 'ready', lighting: 'ready', terrain: 'ready' })
  await expect(page.getByRole('link', { name: '3D 모델 · 환경 에셋 크레딧 ↗' })).toHaveAttribute('href', '/skybound/ATTRIBUTION.md')
  await page.screenshot({ path: '/private/tmp/skybound-desktop-intro.png' })
  await page.getByRole('button', { name: '비행 시작하기' }).click()
  await expect(page.locator('.sb-canvas')).toHaveAttribute('data-view', 'cockpit')
  await page.screenshot({ path: '/private/tmp/skybound-cockpit.png' })
  await page.keyboard.down('KeyW')
  await page.keyboard.down('KeyD')
  await page.waitForFunction(() => { const s = window.__skybound.state(); return s.position.y > 145 && s.heading > 0.3 })
  await page.keyboard.up('KeyW')
  await page.keyboard.up('KeyD')
  await page.screenshot({ path: '/private/tmp/skybound-flight.png' })
  await page.keyboard.down('Space')
  await page.waitForFunction(() => window.__skybound.state().speed < 45)
  await page.keyboard.up('Space')
  await page.keyboard.press('KeyC')
  await expect(page.locator('.sb-canvas')).toHaveAttribute('data-view', 'chase')
  await page.screenshot({ path: '/private/tmp/skybound-chase-upgraded.png' })
  await page.keyboard.press('KeyC')
  await expect(page.locator('.sb-canvas')).toHaveAttribute('data-view', 'nose')
  await page.keyboard.press('KeyC')
  await expect(page.locator('.sb-canvas')).toHaveAttribute('data-view', 'cockpit')
  expect(errors).toEqual([])
  const metrics = await page.evaluate(() => window.__skybound.metrics())
  expect(metrics.calls).toBeLessThan(140)
})

test('passes two real checkpoints without duplicate scoring', async ({ page }) => {
  await start(page)
  await expect(page.locator('.skybound')).toHaveAttribute('data-gate', '2', { timeout: 14000 })
  const score = await page.evaluate(() => window.__skybound.state().score)
  expect(score).toBeGreaterThan(300)
  await page.keyboard.press('KeyP')
  await page.waitForTimeout(250)
  expect(await page.evaluate(() => window.__skybound.state().score)).toBe(score)
})

test('pause and loss of focus freeze the flight and release held input', async ({ page }) => {
  await start(page)
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(350)
  await page.keyboard.press('Escape')
  const frozen = await page.evaluate(() => window.__skybound.state())
  await page.waitForTimeout(250)
  expect(await page.evaluate(() => window.__skybound.state())).toEqual(frozen)
  await page.keyboard.up('KeyD')
  await page.getByRole('button', { name: '비행 계속하기' }).click()
  await page.waitForFunction(() => Math.abs(window.__skybound.state().roll) < 0.02)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.locator('.skybound')).toHaveAttribute('data-phase', 'paused')
})

test('a deliberate dive crashes and retry restores a fresh flight', async ({ page }) => {
  await start(page)
  await page.keyboard.down('KeyS')
  await expect(page.locator('.skybound')).toHaveAttribute('data-phase', 'crashed', { timeout: 9000 })
  await page.keyboard.up('KeyS')
  await expect(page.getByText('수면과 충돌했습니다.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '다시 비행하기' }).click()
  await expect(page.locator('.skybound')).toHaveAttribute('data-phase', 'playing')
  const s = await page.evaluate(() => window.__skybound.state())
  expect(s.gate).toBe(0)
  expect(s.score).toBe(0)
  expect(s.position.y).toBe(125)
})

test('free flight has no countdown, and reduced motion preserves controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  await page.getByRole('button', { name: /자유 비행/ }).click()
  await page.getByRole('button', { name: '비행 시작하기' }).click()
  await expect(page.locator('.skybound')).toHaveClass(/sb-calm/)
  await expect(page.locator('.skybound')).toHaveAttribute('data-mode', 'free')
  await page.waitForTimeout(350)
  expect(await page.evaluate(() => window.__skybound.state().time)).toBe(150)
  await page.getByRole('button', { name: '엔진 소리', exact: true }).click()
  await page.keyboard.down('KeyW')
  await page.waitForFunction(() => window.__skybound.state().position.y > 130, null, { timeout: 3000 })
  await page.keyboard.up('KeyW')
})

test('cockpit is attached to the pilot seat through banking and switches without resetting flight', async ({ page }) => {
  await start(page)
  await page.keyboard.down('KeyD')
  await page.keyboard.down('KeyW')
  await page.waitForFunction(() => window.__skybound.state().roll > .7)
  const pose = await page.evaluate(() => ({ state: window.__skybound.state(), camera: window.__skybound.camera() }))
  expect(pose.camera.cockpitVisible).toBe(true)
  expect(pose.camera.quaternion).toEqual(pose.camera.aircraftQuaternion)
  const offset = Math.hypot(...pose.camera.position.map((n, i) => n - Object.values(pose.state.position)[i]))
  expect(offset).toBeCloseTo(Math.hypot(1.12, 1.15), 4)
  await page.keyboard.up('KeyD')
  await page.keyboard.up('KeyW')
  await page.getByRole('button', { name: '카메라 시점 전환' }).click()
  expect(await page.evaluate(() => window.__skybound.camera().cockpitVisible)).toBe(false)
  await page.keyboard.press('KeyC')
  await page.keyboard.press('KeyC')
  await expect(page.locator('.sb-canvas')).toHaveAttribute('data-view', 'cockpit')
  expect(await page.evaluate(() => window.__skybound.state().elapsed)).toBeGreaterThan(pose.state.elapsed)
  await page.keyboard.down('KeyW')
  await page.waitForFunction((altitude) => window.__skybound.state().position.y > altitude + 10, pose.state.position.y)
  await page.keyboard.up('KeyW')
})

test('cockpit rendering stays responsive and calm mode levels the horizon', async ({ page }) => {
  await start(page)
  await expect(page.locator('.sb-canvas')).toHaveAttribute('data-assets', 'ready')
  await page.waitForTimeout(5500)
  const metrics = await page.evaluate(() => window.__skybound.metrics())
  console.log('Skybound cockpit frames:', JSON.stringify(metrics))
  expect(metrics.frameMs.samples).toBeGreaterThan(90)
  expect(metrics.frameMs.p95).toBeLessThan(50)
  await page.getByRole('button', { name: '카메라 움직임 줄이기' }).click()
  await page.keyboard.down('KeyD')
  await page.waitForFunction(() => window.__skybound.state().roll > .6)
  const pose = await page.evaluate(() => ({ state: window.__skybound.state(), camera: window.__skybound.camera() }))
  // Level camera has only a yaw quaternion because pitch is zero here.
  expect(Math.abs(pose.camera.quaternion[2])).toBeLessThan(.0001)
  expect(Math.abs(pose.state.roll)).toBeGreaterThan(.6)
  await page.keyboard.up('KeyD')
})

test('a chase view can be selected before takeoff and cockpit can be entered while paused', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: '추적 시점', exact: true }).click()
  await page.getByRole('button', { name: '비행 시작하기' }).click()
  await expect(page.locator('.sb-canvas')).toHaveAttribute('data-view', 'chase')
  await page.keyboard.press('KeyP')
  const elapsed = await page.evaluate(() => window.__skybound.state().elapsed)
  await page.keyboard.press('KeyC')
  await page.keyboard.press('KeyC')
  await expect(page.locator('.sb-canvas')).toHaveAttribute('data-view', 'cockpit')
  await page.getByRole('button', { name: '비행 계속하기' }).click()
  expect(await page.evaluate(() => window.__skybound.camera().cockpitVisible)).toBe(true)
  expect(await page.evaluate(() => window.__skybound.state().elapsed)).toBeGreaterThanOrEqual(elapsed)
})

test('mobile multitouch can climb and bank together, then release', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  try {
    await open(page)
    await expect(page.locator('.sb-canvas')).toHaveAttribute('data-assets', 'ready')
    await page.screenshot({ path: '/private/tmp/skybound-mobile-intro.png' })
    expect(await page.locator('.skybound').evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    await page.getByRole('button', { name: '비행 시작하기' }).click()
    await expect(page.locator('.sb-canvas')).toHaveAttribute('data-view', 'cockpit')
    const up = await page.getByRole('button', { name: '상승', exact: true }).boundingBox()
    const right = await page.getByRole('button', { name: '오른쪽 선회', exact: true }).boundingBox()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: up.x + up.width / 2, y: up.y + up.height / 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: up.x + up.width / 2, y: up.y + up.height / 2 }, { id: 2, x: right.x + right.width / 2, y: right.y + right.height / 2 }] })
    await page.waitForFunction(() => { const s = window.__skybound.state(); return s.pitch > 0.25 && s.roll > 0.5 })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForFunction(() => { const s = window.__skybound.state(); return Math.abs(s.pitch) < 0.02 && Math.abs(s.roll) < 0.02 })
    await page.screenshot({ path: '/private/tmp/skybound-mobile-flight.png' })
    await cdp.detach()
  } finally { await context.close() }
})

test('slow same-origin assets never block takeoff or held controls', async ({ page }) => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const requests = []
  await page.route('**/skybound/*', async (route) => { requests.push(route.request().url()); await gate; await route.continue() })
  try {
    await start(page)
    await expect(page.locator('.sb-canvas')).toHaveAttribute('data-assets', 'loading')
    await page.keyboard.down('KeyW')
    await page.keyboard.down('KeyD')
    await page.waitForFunction(() => window.__skybound.state().position.y > 155)
    expect(await page.evaluate(() => window.__skybound.state().heading)).toBeGreaterThan(.2)
    release()
    await expect(page.locator('.sb-canvas')).toHaveAttribute('data-assets', 'ready')
    await page.keyboard.up('KeyW')
    await page.keyboard.up('KeyD')
    await page.waitForTimeout(150)
    const metrics = await page.evaluate(() => window.__skybound.metrics())
    console.log('Skybound during delayed asset loading:', JSON.stringify(metrics))
    expect(metrics.loadingFrameMs.samples).toBeGreaterThan(30)
    expect(metrics.loadingFrameMs.p95).toBeLessThan(50)
    expect(new Set(requests.map((url) => new URL(url).origin))).toEqual(new Set(['http://localhost:5173']))
    expect(requests.some((url) => url.endsWith('c172.glb'))).toBe(true)
    await expect(page.locator('.skybound')).toHaveAttribute('data-phase', 'playing')
  } finally { release() }
})

test('asset failures preserve the procedural aircraft and playable cockpit', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/skybound/*', (route) => route.fulfill({ status: 503, body: 'Unavailable' }))
  await open(page)
  await expect(page.locator('.sb-canvas')).toHaveAttribute('data-assets', 'fallback')
  expect(await page.evaluate(() => window.__skybound.assets())).toEqual({ aircraft: 'fallback', lighting: 'fallback', terrain: 'fallback' })
  await page.getByRole('button', { name: '비행 시작하기' }).click()
  await page.keyboard.down('KeyW')
  await page.waitForFunction(() => window.__skybound.state().position.y > 140)
  await page.keyboard.up('KeyW')
  await page.keyboard.press('KeyC')
  await expect(page.locator('.sb-canvas')).toHaveAttribute('data-view', 'chase')
  expect(errors).toEqual([])
})

test('late downloads after leaving the game do not resurrect its renderer', async ({ page }) => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/skybound/*', async (route) => { await gate; await route.continue() })
  try {
    await open(page)
    await page.getByRole('link', { name: '← Lab', exact: true }).click()
    release()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.sb-canvas')).toHaveCount(0)
    expect(await page.evaluate(() => window.__skybound)).toBeUndefined()
    expect(errors).toEqual([])
  } finally { release() }
})

test('reports a graphics failure and keeps the Lab exit available', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type.startsWith('webgl') ? null : original.call(this, type, ...args) }
  })
  await page.goto(url)
  await expect(page.getByRole('button', { name: '다시 연결하기' })).toBeVisible()
  await expect(page.getByRole('button', { name: '비행 시작하기' })).toHaveCount(0)
  await page.getByRole('link', { name: '← Lab', exact: true }).click()
  await expect(page).toHaveURL(/\/gallery$/)
})

test('losing the context stops the flight and route exit removes input listeners', async ({ page }) => {
  await start(page)
  await page.locator('.sb-canvas').evaluate((canvas) => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext())
  await expect(page.getByRole('button', { name: '다시 연결하기' })).toBeVisible()
  const elapsed = await page.evaluate(() => window.__skybound.state().elapsed)
  await page.waitForTimeout(250)
  expect(await page.evaluate(() => window.__skybound.state().elapsed)).toBe(elapsed)
  await page.getByRole('link', { name: '← Lab', exact: true }).click()
  await expect(page.locator('[data-id="skybound"]')).toHaveCount(1)
  expect(await page.evaluate(() => window.__skybound)).toBeUndefined()
})

test('completes the entire course through keyboard events and saves the best time', async ({ page }) => {
  test.setTimeout(90000)
  await start(page)
  // The pilot reads telemetry and presses the same digital controls as a user.
  // No position, checkpoint, score or clock is changed through the debug object.
  const result = await page.evaluate((gates) => new Promise((resolve) => {
    const held = new Set()
    const press = (code, value) => {
      if (held.has(code) === value) return
      window.dispatchEvent(new KeyboardEvent(value ? 'keydown' : 'keyup', { code }))
      if (value) held.add(code); else held.delete(code)
    }
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n))
    const interval = setInterval(() => {
      const state = window.__skybound.state()
      if (state.phase !== 'playing' || state.elapsed > 75) {
        clearInterval(interval)
        for (const code of [...held]) press(code, false)
        resolve({ phase: state.phase, gate: state.gate, score: state.score, elapsed: state.elapsed })
        return
      }
      const gate = gates[state.gate]
      const dx = gate.x - state.position.x, dz = gate.z - state.position.z
      const difference = Math.atan2(dx, -dz) - state.heading
      const error = Math.atan2(Math.sin(difference), Math.cos(difference))
      const bank = clamp(error * 2.8, -1, 1) - state.roll / 0.98
      const pitch = clamp((gate.y - state.position.y) / Math.max(80, Math.hypot(dx, dz)) * 2.5, -1, 1) - state.pitch / 0.5
      press('KeyD', bank > 0.1); press('KeyA', bank < -0.1)
      press('KeyW', pitch > 0.1); press('KeyS', pitch < -0.1)
    }, 83)
  }), GATES)
  expect(result.phase).toBe('won')
  expect(result.gate).toBe(8)
  expect(result.score).toBeGreaterThanOrEqual(800)
  await expect(page.getByText('ROUTE COMPLETE', { exact: true })).toBeVisible()
  const stored = await page.evaluate(() => Number(localStorage.getItem('skybound-best')))
  expect(stored).toBeGreaterThan(0)
  expect(stored).toBeLessThanOrEqual(result.elapsed)
  await page.screenshot({ path: '/private/tmp/skybound-complete.png' })
  await page.reload()
  expect(await page.evaluate(() => Number(localStorage.getItem('skybound-best')))).toBe(stored)
})
