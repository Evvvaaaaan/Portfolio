import { test, expect } from '@playwright/test'
import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import process from 'node:process'

async function loaded(page) {
  await expect(page.getByTestId('spatial-viewer').locator('canvas')).toBeVisible({ timeout: 45_000 })
  await expect(page.locator('.sp-loading-tag')).toHaveCount(0, { timeout: 45_000 })
  await expect(page.locator('.sp-viewer-error')).toHaveCount(0)
  await expect(page.locator('.sp-source-overlay')).toHaveCount(0)
  await expect(page.getByTestId('spatial-viewer')).toHaveAttribute('data-renderer', 'closed-solids')
  await expect(page.getByTestId('spatial-viewer')).toHaveAttribute('data-range', '180')
}

test('desktop and mobile show real closed geometry, comparison and guide', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/spatial')
  await expect(page.getByRole('heading', { name: /사진 속 공간을/ })).toBeVisible()
  await loaded(page)
  await page.screenshot({ path: '/private/tmp/spatial-solid-desktop.png', fullPage: true })
  const viewer = page.getByTestId('spatial-viewer')
  const before = await viewer.getAttribute('data-camera')
  const box = await viewer.boundingBox()
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * .58, box.y + box.height * .53, { steps: 20 })
  await page.mouse.up()
  await expect(viewer).not.toHaveAttribute('data-camera', before)
  await page.getByRole('button', { name: '원본', exact: true }).click()
  await expect(page.locator('.sp-source-overlay')).toHaveAttribute('src', '/spatial-demo/source-0.jpg')
  await page.getByRole('button', { name: '구조', exact: true }).click()
  await expect(page.locator('.sp-source-overlay')).toHaveCount(0)
  await page.getByRole('button', { name: '촬영 가이드', exact: true }).click()
  await expect(page.locator('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '공간', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/private/tmp/spatial-solid-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await expect(page.getByRole('button', { name: '공간 만들기' })).toBeDisabled()
  expect(errors).toEqual([])
})

test('continuous 180-degree orbit, intermediate views, inertia reset and safe camera bounds', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/spatial')
  await loaded(page)
  const viewer = page.getByTestId('spatial-viewer')
  const box = await viewer.boundingBox()
  for (const [from, to, yaw] of [[.9, .1, 90], [.1, .9, -90]]) {
    for (let step = 0; step < 2; step++) {
      await page.mouse.move(box.x + box.width * from, box.y + box.height * .5)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * to, box.y + box.height * .5, { steps: 25 })
      await page.mouse.up()
    }
    await expect.poll(async () => Math.round(Number(await viewer.getAttribute('data-yaw')))).toBe(yaw)
    await page.screenshot({ path: `/private/tmp/spatial-solid-${yaw}.png`, fullPage: true })
  }
  for (const yaw of [-60, -30, 0, 30, 60, 90]) {
    await page.getByRole('button', { name: `3D 시점 ${yaw}도`, exact: true }).click()
    await expect.poll(async () => Number(await viewer.getAttribute('data-yaw'))).toBeCloseTo(yaw, 1)
    await page.screenshot({ path: `/private/tmp/spatial-solid-view-${yaw}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: '시점 초기화' }).click()
  await expect.poll(async () => Number(await viewer.getAttribute('data-yaw'))).toBeCloseTo(90, 1)
  await page.getByRole('button', { name: '3D 시점 0도', exact: true }).click()
  const distance = Number(await viewer.getAttribute('data-distance'))
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5)
  await page.mouse.wheel(0, -10000)
  await expect.poll(async () => Number(await viewer.getAttribute('data-distance'))).toBeCloseTo(distance * .85, 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .95, { steps: 20 })
  await page.mouse.up()
  await expect.poll(async () => Number(await viewer.getAttribute('data-elevation'))).toBeLessThanOrEqual(42)
  expect(Number(await viewer.getAttribute('data-elevation'))).toBeGreaterThanOrEqual(18)
})

test('real upload runs local inference, closed Blender assembly, export validation and persists', async ({ page, request }) => {
  test.setTimeout(600_000)
  const health = await (await request.get('/api/spatial/health')).json()
  expect(health.ready).toBe(true)
  expect(health.billing).toEqual({ provider: 'local', apiCost: 0, requiresApiKey: false })
  await page.goto('/spatial')
  await page.getByLabel('공간 사진 업로드').setInputFiles(path.resolve('public/spatial-demo/source-0.jpg'))
  await page.getByLabel('공간 이름').fill('검증 · 안정형 거실')
  const submitted = page.waitForResponse(r => r.url().endsWith('/api/spatial/jobs') && r.request().method() === 'POST')
  await page.getByRole('button', { name: '공간 만들기' }).click()
  const response = await submitted
  expect(response.status()).toBe(202)
  const job = await response.json()
  expect(job.completion).toBe('solid')
  await page.reload()
  await expect(page.locator('.sp-processing')).toBeVisible({ timeout: 10_000 })
  await expect.poll(async () => (await (await request.get(`/api/spatial/jobs/${job.id}`)).json()).stage,
    { timeout: 480_000, intervals: [1500] }).toMatch(/ready|failed|cancelled/)
  const terminal = await (await request.get(`/api/spatial/jobs/${job.id}`)).json()
  expect(terminal.stage, terminal.error).toBe('ready')
  await expect(page.getByRole('heading', { name: '검증 · 안정형 거실' })).toBeVisible({ timeout: 15_000 })
  await loaded(page)
  const status = await (await request.get(`/api/spatial/jobs/${job.id}`)).json()
  expect(status.stage).toBe('ready')
  expect(status.result.representation).toBe('closed-solids-v1')
  expect(status.result.sourceCount).toBe(1)
  expect(status.result.qualityGate).toMatchObject({ status: 'passed', nonManifoldEdges: 0,
    degenerateFaces: 0, furnitureOverlaps: 0, photoProjectedSurfaces: 0, inspectedViews: 39,
    cameraOutsideGeometry: true, exportRoundTrip: true })
  expect(status.result.triangles).toBeGreaterThan(1000)
  for (const file of ['scene.glb', 'scene.blend']) {
    const download = await request.get(`/api/spatial/jobs/${job.id}/${file}?download=1`)
    expect(download.ok()).toBeTruthy()
    expect(download.headers()['content-disposition']).toContain('attachment')
    const bytes = await download.body()
    expect(bytes.byteLength).toBeGreaterThan(10000)
    if (file.endsWith('.glb')) expect(bytes.subarray(0, 4).toString()).toBe('glTF')
  }
  expect((await request.get(`/api/spatial/jobs/${job.id}/completed.glb`)).status()).toBe(405)
  await page.getByRole('button', { name: '3D 시점 90도', exact: true }).click()
  await page.getByRole('button', { name: '원본', exact: true }).click()
  await expect(page.locator('.sp-source-overlay')).toHaveAttribute('src', `/api/spatial/jobs/${job.id}/source-0.jpg`)
  await page.reload()
  await expect(page.getByRole('heading', { name: '검증 · 안정형 거실' })).toBeVisible()
  await loaded(page)
  await page.screenshot({ path: '/private/tmp/spatial-solid-upload.png', fullPage: true })
  console.log(`SOLID_UPLOAD_VERIFIED ${job.id} ${status.elapsed}s ${status.result.triangles} triangles`)
})

test('mobile touch, cancellation, invalid input and private-file isolation', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/spatial')
  await loaded(page)
  const viewer = page.getByTestId('spatial-viewer')
  const before = await viewer.getAttribute('data-camera')
  const box = await viewer.boundingBox()
  const touch = await page.context().newCDPSession(page)
  const x = box.x + box.width * .45, y = box.y + box.height * .5
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 30, y: y + 10 }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(viewer).not.toHaveAttribute('data-camera', before)
  await touch.detach()
  await page.getByLabel('공간 사진 업로드').setInputFiles(path.resolve('public/spatial-demo/source-0.jpg'))
  const submitted = page.waitForResponse(r => r.url().endsWith('/api/spatial/jobs') && r.request().method() === 'POST')
  await page.getByRole('button', { name: '공간 만들기' }).click()
  const job = await (await submitted).json()
  await page.getByRole('button', { name: '취소', exact: true }).click()
  await expect(page.getByRole('button', { name: '공간 만들기' })).toBeEnabled()
  expect((await (await request.get(`/api/spatial/jobs/${job.id}`)).json()).stage).toBe('cancelled')
  const execution = JSON.parse(readFileSync(path.resolve(`.spatial-data/${job.id}/process.json`), 'utf8'))
  await expect.poll(() => { try { process.kill(execution.pid, 0); return true } catch { return false } }).toBe(false)
  const rejected = await request.post('/api/spatial/jobs', { multipart: {
    images: { name: 'not-an-image.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('This is not a photograph.') },
  } })
  expect(rejected.status()).toBe(400)
  expect((await request.get('/api/spatial/health', { headers: { origin: 'https://untrusted.example' } })).status()).toBe(403)
  expect([403, 404]).toContain((await request.get(`/.spatial-data/${job.id}/request.json`)).status())
  expect((await request.get(`/api/spatial/jobs/${job.id}/request.json`)).status()).toBe(405)
  expect((await request.get(`/api/spatial/jobs/${job.id}/layout-raw.txt`)).status()).toBe(405)
})

test('damaged JPEG fails clearly and never displays partial geometry', async ({ page }) => {
  await page.goto('/spatial')
  const damaged = Buffer.alloc(20)
  damaged.set([255, 216, 255])
  await page.getByLabel('공간 사진 업로드').setInputFiles({ name: 'damaged.jpg', mimeType: 'image/jpeg', buffer: damaged })
  await page.getByRole('button', { name: '공간 만들기' }).click()
  await expect(page.getByRole('alert')).toContainText('사진을 읽을 수 없습니다', { timeout: 30_000 })
  await expect(page.getByRole('button', { name: '공간 만들기' })).toBeEnabled()
})

test('a different space with three photos produces its own validated model', async ({ page, request }) => {
  test.setTimeout(600_000)
  const fixture = path.resolve('.spatial-runtime/test-data/extract/SampleRedwoodRGBDImages/color')
  test.skip(!existsSync(path.join(fixture, '00004.jpg')), 'Optional Redwood color fixture is not installed.')
  await page.goto('/spatial')
  await page.getByLabel('공간 사진 업로드').setInputFiles([0, 2, 4].map(i => path.join(fixture, `0000${i}.jpg`)))
  await page.getByLabel('공간 이름').fill('검증 · 다른 공간 세 장')
  const submitted = page.waitForResponse(r => r.url().endsWith('/api/spatial/jobs') && r.request().method() === 'POST')
  await page.getByRole('button', { name: '공간 만들기' }).click()
  const job = await (await submitted).json()
  await expect.poll(async () => (await (await request.get(`/api/spatial/jobs/${job.id}`)).json()).stage,
    { timeout: 480_000, intervals: [1500] }).toMatch(/ready|failed|cancelled/)
  const terminal = await (await request.get(`/api/spatial/jobs/${job.id}`)).json()
  expect(terminal.stage, terminal.error).toBe('ready')
  await expect(page.getByRole('heading', { name: '검증 · 다른 공간 세 장' })).toBeVisible({ timeout: 15_000 })
  await loaded(page)
  const status = await (await request.get(`/api/spatial/jobs/${job.id}`)).json()
  expect(status.stage).toBe('ready')
  expect(status.result.sourceCount).toBe(3)
  expect(status.result.cameras).toHaveLength(7)
  expect(status.result.qualityGate.exportRoundTrip).toBe(true)
  const output = await (await request.get(`/api/spatial/jobs/${job.id}/scene.glb`)).body()
  expect(output.equals(readFileSync('public/spatial-demo/scene.glb'))).toBe(false)
  await page.getByRole('button', { name: '원본', exact: true }).click()
  await page.getByRole('button', { name: '원본 사진 3', exact: true }).click()
  await expect(page.locator('.sp-source-overlay')).toHaveAttribute('src', `/api/spatial/jobs/${job.id}/source-2.jpg`)
  await page.getByRole('button', { name: '공간', exact: true }).click()
  await page.screenshot({ path: '/private/tmp/spatial-solid-multiview.png', fullPage: true })
  console.log(`SOLID_MULTIVIEW_VERIFIED ${job.id} ${status.elapsed}s ${status.result.triangles} triangles`)
})

test('legacy and failed-gate jobs preserve photos without requesting unsafe GLBs', async ({ page }) => {
  const id = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  const requested = []
  page.on('request', req => { if (req.url().endsWith('.glb')) requested.push(req.url()) })
  await page.addInitScript(id => localStorage.setItem('spatial-last-job', id), id)
  const sample = JSON.parse(readFileSync('public/spatial-demo/scene.json', 'utf8'))
  for (const result of [{ sourceCount: 1, completion: { status: 'ready' } },
    { ...sample, qualityGate: { ...sample.qualityGate, nonManifoldEdges: 1 } }]) {
    await page.route('**/api/spatial/jobs', route => route.fulfill({ json: { jobs: [{ id,
      stage: 'ready', name: '이전 결과', imageCount: 1, result }] } }))
    await page.route(`**/api/spatial/jobs/${id}/source-0.jpg`, route => route.fulfill({
      contentType: 'image/jpeg', body: readFileSync('public/spatial-demo/source-0.jpg'),
    }))
    await page.goto('/spatial')
    await expect(page.getByRole('status')).toContainText('형태 안정성이 확인되지 않아 표시하지 않습니다')
    await expect(page.getByTestId('spatial-viewer')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '공간', exact: true })).toBeDisabled()
    await expect(page.locator('.sp-source-overlay')).toBeVisible()
    await expect(page.locator('.sp-download')).toHaveCount(0)
    await page.unrouteAll({ behavior: 'wait' })
  }
  expect(requested).toEqual([])
})
