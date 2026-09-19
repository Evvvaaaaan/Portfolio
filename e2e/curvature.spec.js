import { test, expect } from '@playwright/test'

const url = '/gallery/curvature'
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('hwAccelNoticeDismissed', '1'))
})

async function open(page) {
  await page.goto(url)
  await expect(page.locator('.cv-canvas')).toBeVisible()
  await expect(page.locator('.cv-canvas')).toHaveAttribute('data-time', /\d/)
}

async function pixels(page) {
  return page.locator('.cv-canvas').evaluate((canvas) => new Promise((resolve) => requestAnimationFrame(() => {
    const gl = canvas.getContext('webgl2')
    const values = new Uint8Array(canvas.width * canvas.height * 4)
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, values)
    let lit = 0, hash = 0
    for (let i = 0; i < values.length; i += 16) {
      if (values[i] + values[i + 1] + values[i + 2] > 20) lit++
      hash = (Math.imul(hash, 31) + values[i] + values[i + 1] + values[i + 2]) | 0
    }
    resolve({ lit, hash })
  })))
}

test('renders a real field, changes ray outcomes, and reports no graphics errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await open(page)
  await expect(page.locator('.curvature')).toHaveAttribute('data-outcome', 'escaped')
  const initial = await pixels(page)
  expect(initial.lit).toBeGreaterThan(1000)
  await page.getByRole('button', { name: /빛의 포획/ }).click()
  await expect(page.locator('.curvature')).toHaveAttribute('data-outcome', 'captured')
  await expect(page.getByTestId('cv-deflection')).toHaveText('—')
  expect((await pixels(page)).hash).not.toBe(initial.hash)
  await page.getByRole('button', { name: /임계 궤적/ }).click()
  await expect(page.locator('.curvature')).toHaveAttribute('data-outcome', 'escaped')
  expect(parseFloat(await page.getByTestId('cv-deflection').innerText())).toBeGreaterThan(180)
  await page.screenshot({ path: '/private/tmp/curvature-desktop.png' })
  expect(errors).toEqual([])
})

test('mass, impact and observer controls change the actual model', async ({ page }) => {
  await open(page)
  const mass = page.getByRole('slider', { name: '중심 질량' })
  await mass.focus()
  await page.keyboard.press('Home')
  await expect(page.locator('.cv-canvas')).toHaveAttribute('data-mass', '0')
  await expect(page.getByTestId('cv-deflection')).toHaveText('0.0°')
  await expect(page.getByTestId('cv-clock-rate')).toHaveText('1.000×')
  await page.getByRole('button', { name: /중력 렌즈/ }).click()
  const before = await page.getByTestId('cv-deflection').innerText()
  await page.getByRole('slider', { name: '빛의 입사 거리' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('cv-deflection')).not.toHaveText(before)
  await page.getByRole('slider', { name: '관측 거리' }).focus()
  await page.keyboard.press('Home')
  await expect(page.getByTestId('cv-clock-rate')).toHaveText('0.302×')
  await page.getByRole('button', { name: '실험 초기화', exact: true }).click()
  await expect(mass).toHaveValue('10')
  await expect(page.getByRole('slider', { name: '빛의 입사 거리' })).toHaveValue('110')
})

test('supports orbit, top view, overlays, pause and relaunch', async ({ page }) => {
  await open(page)
  const canvas = page.locator('.cv-canvas')
  const before = await canvas.getAttribute('data-camera')
  await page.getByRole('button', { name: '위에서 보기' }).click()
  await expect(canvas).not.toHaveAttribute('data-camera', before)
  await page.getByRole('button', { name: '3D 공간', exact: true }).click()
  const box = await canvas.boundingBox()
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 12 })
  await page.mouse.up()
  await expect(canvas).not.toHaveAttribute('data-camera', before)
  for (const name of ['공간 격자', '광선 묶음', '직선과 비교']) {
    const button = page.getByRole('button', { name, exact: true })
    const state = await button.getAttribute('aria-pressed')
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', state === 'true' ? 'false' : 'true')
  }
  await page.getByRole('button', { name: '시뮬레이션 일시정지' }).click()
  await page.waitForTimeout(150)
  const paused = await canvas.getAttribute('data-time')
  await page.waitForTimeout(250)
  await expect(canvas).toHaveAttribute('data-time', paused)
  await page.getByRole('combobox', { name: '재생 속도' }).selectOption('2')
  await page.getByRole('button', { name: '광선 다시 발사' }).click()
  await expect(page.getByRole('button', { name: '시뮬레이션 일시정지' })).toBeVisible()
  await expect(page.locator('.cv-shot')).toContainText('002')
  await expect(canvas).not.toHaveAttribute('data-time', paused)
})

test('fits narrow screens and keeps controls usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  expect(await page.locator('.curvature').evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: '/private/tmp/curvature-mobile.png' })
  await page.getByRole('button', { name: /빛의 포획/ }).click()
  await expect(page.locator('.curvature')).toHaveAttribute('data-outcome', 'captured')
  await page.getByRole('button', { name: '광선 다시 발사' }).click()
  await expect(page.locator('.cv-shot')).toContainText('002')
})

test('starts paused with reduced motion and still accepts deliberate playback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  await expect(page.getByRole('button', { name: '시뮬레이션 재생' })).toBeVisible()
  await expect(page.locator('.cv-canvas')).toHaveAttribute('data-time', '0.000')
  await page.waitForTimeout(250)
  await expect(page.locator('.cv-canvas')).toHaveAttribute('data-time', '0.000')
  await page.getByRole('button', { name: '시뮬레이션 재생' }).click()
  await expect(page.locator('.cv-canvas')).not.toHaveAttribute('data-time', '0.000')
})

test('falls back to a usable diagram without WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith('webgl') ? null : getContext.call(this, type, ...args)
    }
  })
  await page.goto(url)
  await expect(page.locator('.curvature')).toHaveAttribute('data-renderer', '2d')
  await expect(page.locator('.cv-fallback-diagram')).toBeVisible()
  await expect(page.locator('.cv-fallback-ray')).toHaveCount(9)
  await page.getByRole('button', { name: '광선 묶음', exact: true }).click()
  await expect(page.locator('.cv-fallback-ray')).toHaveCount(1)
  await page.getByRole('button', { name: '공간 격자', exact: true }).click()
  await expect(page.locator('.cv-fallback-diagram rect')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '광선 다시 발사' })).toBeDisabled()
  await page.getByRole('button', { name: /빛의 포획/ }).click()
  await expect(page.locator('.curvature')).toHaveAttribute('data-outcome', 'captured')
  await expect(page.getByRole('button', { name: '3D 공간', exact: true })).toBeDisabled()
})

test('retains the experiment when the graphics context is lost', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: /빛의 포획/ }).click()
  await page.locator('.cv-canvas').evaluate((canvas) => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext())
  await expect(page.locator('.curvature')).toHaveAttribute('data-renderer', '2d')
  await expect(page.getByRole('slider', { name: '중심 질량' })).toHaveValue('20')
  await expect(page.locator('.curvature')).toHaveAttribute('data-outcome', 'captured')
})

test('returns to its registered Lab card and can reopen cleanly', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await open(page)
  await page.getByRole('link', { name: '← Lab', exact: true }).click()
  await expect(page).toHaveURL(/\/gallery$/)
  await expect(page.locator('.carousel-card')).toHaveCount(25)
  await expect(page.locator('[data-id="curvature"]')).toHaveCount(1)
  await page.goBack()
  await expect(page.locator('.cv-canvas')).toBeVisible()
  await expect(page.locator('.cv-canvas')).toHaveCount(1)
  expect(errors).toEqual([])
})
