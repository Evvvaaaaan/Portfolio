/* global Buffer */
import { test, expect } from '@playwright/test'

test.use({ channel: 'chrome' })

// A tiny deterministic 3D fixture, not an AI output. These tests never submit paid jobs.
function glbFixture() {
  const positions = new Float32Array([0, 1.8, 0, -0.4, 0, 0.3, 0.4, 0, 0.3, 0, 0, -0.3])
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2])
  const bin = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)])
  const json = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.5, 0.6, 0.4, 1] }, doubleSided: true }], buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }, { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }], accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.4, 0, -0.3], max: [0.4, 1.8, 0.3] }, { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' }] })
  const bytes = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4, ' '))
  const header = Buffer.alloc(20)
  header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + bytes.length + bin.length, 8); header.writeUInt32LE(bytes.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, bytes, binHeader, bin])
}

async function imageFixture(page) {
  const data = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 160; c.height = 240
    const x = c.getContext('2d'); x.fillStyle = '#faf9f4'; x.fillRect(0, 0, 160, 240); x.fillStyle = '#657b54'; x.fillRect(35, 30, 90, 160)
    return c.toDataURL('image/png').split(',')[1]
  })
  return { name: 'synthetic-test-reference.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') }
}

async function mockService(page, { available = true, failure = false, invalidModel = false } = {}) {
  const submissions = []
  let png
  const jobs = new Map()
  await page.route('**/api/fitting/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/status')) return route.fulfill({ json: { available, token: 'test-session', mode: 'local-cli' } })
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      submissions.push(body)
      const job = { id: `job-${submissions.length}`, kind: body.kind, status: 'running' }
      jobs.set(job.id, job)
      return route.fulfill({ status: 202, json: job })
    }
    if (route.request().method() === 'DELETE') return route.fulfill({ json: { deleted: true } })
    const id = url.pathname.split('/')[4]
    const job = jobs.get(id)
    if (!job) return route.fulfill({ status: 404, json: { error: 'SOURCE_EXPIRED' } })
    if (url.pathname.endsWith('/asset')) return route.fulfill({ contentType: job.kind === 'look' ? 'image/png' : 'model/gltf-binary', body: job.kind === 'look' ? png : invalidModel ? Buffer.alloc(30) : glbFixture() })
    return route.fulfill({ json: { ...job, status: failure ? 'failed' : 'complete', error: failure ? 'CREDITS_REQUIRED' : null } })
  })
  return { submissions, setImage: (buffer) => { png = buffer } }
}

async function open(page, serviceOptions) {
  const service = await mockService(page, serviceOptions)
  await page.goto('/gallery/fitting-studio?debug')
  await expect(page.locator('.fitting-canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Side', exact: true })).toBeEnabled()
  return service
}

test('sample clothing, camera, wireframe, lighting and screenshot work without AI', async ({ page }, info) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const service = await open(page)
  await expect(page.locator('.fs-step-heading h2').first()).toHaveCSS('color', 'rgb(51, 59, 53)')
  await page.screenshot({ path: info.outputPath('fitting-desktop.png') })
  await page.getByRole('button', { name: /Studio knit/ }).click()
  await expect(page.locator('.fs-model-caption strong')).toHaveText('Studio knit')
  const before = await page.evaluate(() => window.__fitting.state().camera)
  await page.getByRole('button', { name: 'Side', exact: true }).click()
  expect(await page.evaluate(() => window.__fitting.state().camera)).not.toEqual(before)
  await page.getByRole('checkbox', { name: 'Wireframe' }).check()
  await page.getByRole('button', { name: 'Warm', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Warm', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save this view' }).click()
  expect((await downloaded).suggestedFilename()).toBe('fitting-atelier.png')
  expect(service.submissions).toHaveLength(0)
  expect(errors).toEqual([])
})

test('photos stay local until consent and each generation step needs an explicit action', async ({ page }) => {
  const service = await open(page)
  const image = await imageFixture(page)
  service.setImage(image.buffer)
  await page.getByLabel('Upload full-body photo', { exact: true }).setInputFiles(image)
  await page.getByLabel('Upload garment image', { exact: true }).setInputFiles(image)
  await expect(page.getByRole('button', { name: 'Create person in 3D' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Generate outfit preview' })).toBeDisabled()
  expect(service.submissions).toHaveLength(0)
  await page.getByRole('checkbox', { name: /I have permission/ }).check()
  await page.getByRole('button', { name: 'Create person in 3D' }).click()
  await expect(page.locator('.fitting-studio')).toHaveAttribute('data-source', 'generated')
  expect(service.submissions).toHaveLength(1)
  await page.getByRole('button', { name: 'Generate outfit preview' }).click()
  await expect(page.getByAltText('AI-generated outfit preview')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create this look in 3D' })).toBeDisabled()
  expect(service.submissions).toHaveLength(2)
  await page.getByRole('checkbox', { name: /I confirm one complete person/ }).check()
  await page.getByRole('button', { name: 'Create this look in 3D' }).click()
  await expect(page.locator('.fs-history > button')).toHaveCount(2)
  expect(service.submissions[2]).toMatchObject({ kind: 'mesh', sourceId: 'job-2', reviewed: true, consent: true })
  await page.getByRole('button', { name: /Original person/ }).click()
  await expect(page.locator('.fs-model-caption strong')).toHaveText('Your 3D portrait')
  await page.getByRole('button', { name: 'Clear photos & local results' }).click()
  await expect(page.locator('.fitting-studio')).toHaveAttribute('data-source', 'demo')
  await expect(page.locator('.fs-upload img')).toHaveCount(0)
})

test('bad uploads and provider failures do not replace the sample with fake success', async ({ page }) => {
  const service = await open(page, { failure: true })
  await page.getByLabel('Upload full-body photo', { exact: true }).setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
  await expect(page.getByRole('alert')).toContainText('Choose a JPG')
  const image = await imageFixture(page)
  await page.getByLabel('Upload full-body photo', { exact: true }).setInputFiles(image)
  await page.getByRole('checkbox', { name: /I have permission/ }).check()
  await page.getByRole('button', { name: 'Create person in 3D' }).click()
  await expect(page.getByRole('alert')).toContainText('credits')
  await expect(page.locator('.fitting-studio')).toHaveAttribute('data-source', 'demo')
  expect(service.submissions).toHaveLength(1)
})

test('an existing GLB can be imported and downloaded with the AI backend unavailable', async ({ page }) => {
  await open(page, { available: false })
  await page.getByLabel('Import a GLB model', { exact: true }).setInputFiles({ name: 'fixture.glb', mimeType: 'model/gltf-binary', buffer: glbFixture() })
  await expect(page.locator('.fitting-studio')).toHaveAttribute('data-source', 'import')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download 3D model' }).click()
  expect((await download).suggestedFilename()).toBe('fitting-atelier.glb')
})

test('invalid generated models release the pending state without an automatic paid retry', async ({ page }) => {
  const service = await open(page, { invalidModel: true })
  await page.getByLabel('Upload full-body photo', { exact: true }).setInputFiles(await imageFixture(page))
  await page.getByRole('checkbox', { name: /I have permission/ }).check()
  await page.getByRole('button', { name: 'Create person in 3D' }).click()
  await expect(page.getByRole('alert')).toContainText('not a valid GLB')
  await expect(page.locator('.fs-progress')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Clear photos & local results' })).toBeEnabled()
  await expect(page.locator('.fitting-studio')).toHaveAttribute('data-source', 'demo')
  expect(service.submissions).toHaveLength(1)
})

test('mobile viewer, Korean copy, touch rotation and panel switching remain usable', async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await open(page, { available: false })
  await page.getByRole('button', { name: 'KO', exact: true }).click()
  await expect(page.locator('.fs-source')).toContainText('샘플 마네킹')
  await page.getByRole('button', { name: '샘플 · 설정' }).click()
  await page.getByRole('button', { name: /롱라인 코트/ }).click()
  await expect(page.locator('.fs-model-caption strong')).toHaveText('롱라인 코트')
  const canvas = page.locator('.fitting-canvas')
  const box = await canvas.boundingBox()
  const before = await page.evaluate(() => window.__fitting.state().camera)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * .6, y: box.y + box.height * .5, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * .2, y: box.y + box.height * .5, id: 1 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  expect(await page.evaluate(() => window.__fitting.state().camera)).not.toEqual(before)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath('fitting-mobile.png') })
  await context.close()
})

test('leaving the experiment releases the scene and preserves Lab navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  await page.getByRole('link', { name: '← Lab', exact: true }).click()
  await expect(page.locator('.fitting-studio')).toHaveCount(0)
  expect(await page.evaluate(() => window.__fitting)).toBeUndefined()
  await expect(page.locator('.carousel-card')).toHaveCount(21)
})
