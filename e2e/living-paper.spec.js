import { test, expect } from '@playwright/test'

const path = '/gallery/living-paper'

async function openNative(page) {
  await page.goto(path)
  await expect(page.locator('.living-paper')).toHaveAttribute('data-support', 'native')
  const notice = page.locator('.hw-accel-notice')
  if (await notice.isVisible()) await notice.getByRole('button').click()
}

async function canvasPixels(page) {
  return page.locator('.lp-canvas').evaluate(canvas => new Promise(resolve => requestAnimationFrame(() => {
    const gl = canvas.getContext('webgl2')
    const pixels = new Uint8Array(canvas.width * canvas.height * 4)
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let opaque = 0, hash = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 128) opaque++
      hash = (Math.imul(hash, 31) + pixels[i] + pixels[i + 1] + pixels[i + 2]) | 0
    }
    resolve({ opaque, hash })
  })))
}

async function decoratePaper(page) {
  const body = page.getByRole('textbox', { name: '문서 본문' })
  await body.fill('재질과 도장이 바뀌어도 남는 문장.')
  for (const name of ['블루프린트', '로즈', '코튼']) {
    const stock = page.getByRole('button', { name: `${name} 종이`, exact: true })
    await stock.click()
    await expect(stock).toHaveAttribute('aria-pressed', 'true')
    await expect(body).toHaveValue('재질과 도장이 바뀌어도 남는 문장.')
  }
  const stamp = page.getByRole('button', { name: '도장 찍기', exact: true })
  await expect(page.getByRole('button', { name: '마지막 도장 지우기' })).toBeDisabled()
  for (let i = 0; i < 3; i++) await stamp.click()
  await expect(page.locator('.lp-paper .lp-stamp')).toHaveCount(3)
  await expect(stamp).toBeDisabled()
  await page.getByRole('button', { name: '마지막 도장 지우기' }).click()
  await expect(page.locator('.lp-paper .lp-stamp')).toHaveCount(2)
  await expect(stamp).toBeEnabled()
}

// Read the actual GPU mesh near its center; lighting cannot produce a false positive.
async function centerDisplacement(page) {
  return page.locator('.lp-canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2')
    const location = gl.getAttribLocation(gl.getParameter(gl.CURRENT_PROGRAM), 'position')
    const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING))
    const points = new Float32Array(gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) / 4)
    gl.getBufferSubData(gl.ARRAY_BUFFER, 0, points)
    gl.bindBuffer(gl.ARRAY_BUFFER, previous)
    let displacement = 0
    for (let i = 0; i < points.length; i += 3) {
      if (Math.abs(points[i] - canvas.clientWidth / 2) < 30 && Math.abs(points[i + 1] - canvas.clientHeight / 2) < 30) displacement = Math.max(displacement, Math.abs(points[i + 2]))
    }
    return displacement
  })
}

test.describe('Living Paper without experimental APIs', () => {
  test.beforeEach(({ browserName }, testInfo) => { test.skip(browserName !== 'chromium' || testInfo.project.name.startsWith('native-')) })

  test('offers one editable document and returns to the gallery', async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(path)
    await expect(page.locator('.living-paper')).toHaveAttribute('data-support', 'fallback')
    await expect(page.getByRole('article', { name: '나의 문서' })).toHaveCount(1)
    await expect(page.getByRole('button', { name: '종이 만지기' })).toBeDisabled()
    await page.getByRole('textbox', { name: '문서 본문' }).fill('일반 브라우저에서도 문장을 쓸 수 있습니다.')
    await page.getByRole('button', { name: '종이 펴기' }).click()
    await expect(page.getByRole('textbox', { name: '문서 본문' })).toHaveValue('일반 브라우저에서도 문장을 쓸 수 있습니다.')
    await page.getByRole('link', { name: '← Lab', exact: true }).click()
    await expect(page).toHaveURL(/\/gallery$/)
    await expect(page.locator('[data-id="living-paper"]')).toHaveCount(1)
    expect(errors).toEqual([])
  })

  test('keeps the document and controls within a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(path)
    await expect(page.getByRole('textbox', { name: '문서 본문' })).toBeVisible()
    await page.getByRole('textbox', { name: '문서 본문' }).fill('작은 화면의 기록')
    const overflow = await page.locator('.living-paper').evaluate(el => el.scrollWidth > el.clientWidth)
    expect(overflow).toBe(false)
    const paper = await page.locator('.lp-paper').boundingBox()
    expect(paper.x).toBeGreaterThanOrEqual(0)
    expect(paper.x + paper.width).toBeLessThanOrEqual(390)
  })

  test('changes paper stocks and stamps in the ordinary HTML document', async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('.living-paper')).toHaveAttribute('data-support', 'fallback')
    await decoratePaper(page)
    await expect(page.getByRole('button', { name: '바람 불기', exact: true })).toBeDisabled()
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 })
      await expect.poll(() => page.locator('.living-paper').evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0)
    }
  })
})

  test.describe('Living Paper native HTML', () => {

    test.beforeEach(async ({ page }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('native-'))
      // Count successful native calls, without replacing the browser implementation.
      await page.addInitScript(() => {
        window.paperUploads = 0
        for (const key of ['texElementImage2D', 'texElementSubImage2D']) {
          const original = WebGL2RenderingContext.prototype[key]
          if (original) WebGL2RenderingContext.prototype[key] = function (...args) {
            const result = original.apply(this, args)
            window.paperUploads++
            return result
          }
        }
      })
    })

    test('writes Korean through canvas hit testing, curls the paper, and edits again', async ({ page }) => {
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await openNative(page)
      const accessibility = await page.context().newCDPSession(page)
      const fields = (await accessibility.send('Accessibility.getFullAXTree')).nodes.filter(node => !node.ignored && node.role?.value === 'textbox')
      expect(fields).toHaveLength(0)
      await accessibility.detach()
      await page.getByRole('button', { name: '글 쓰기' }).click()
      await expect(page.locator('.lp-canvas')).toHaveAttribute('data-settled', 'true')
      const body = page.getByRole('textbox', { name: '문서 본문' })
      await body.click()
      await expect(body).toBeFocused()
      const initialPixels = await canvasPixels(page)
      expect(initialPixels.opaque).toBeGreaterThan(10000)
      const before = await page.evaluate(() => window.paperUploads)
      await page.keyboard.press('Meta+A')
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.imeSetComposition', { text: '살', selectionStart: 1, selectionEnd: 1 })
      await cdp.send('Input.imeSetComposition', { text: '살아', selectionStart: 2, selectionEnd: 2 })
      await cdp.send('Input.insertText', { text: '살아 있는 종이 위에 쓰는 나의 문장.' })
      await cdp.detach()
      await expect(body).toHaveValue('살아 있는 종이 위에 쓰는 나의 문장.')
      await expect.poll(() => page.evaluate(() => window.paperUploads)).toBeGreaterThan(before)
      expect((await canvasPixels(page)).hash).not.toBe(initialPixels.hash)
      await page.keyboard.press('Meta+A')
      expect(await body.evaluate(el => el.selectionEnd - el.selectionStart)).toBeGreaterThan(0)
      await page.getByRole('button', { name: '종이 만지기' }).click()
      await expect(page.locator('.lp-paper')).toHaveAttribute('inert', '')
      await expect(page.getByRole('textbox')).toHaveCount(0)
      const handle = page.getByRole('button', { name: '종이 모서리 당기기' })
      await expect(handle).toBeVisible()
      await page.waitForTimeout(650)
      const start = await handle.boundingBox()
      await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
      await page.mouse.down()
      await page.mouse.move(start.x - 85, start.y - 85, { steps: 12 })
      await page.waitForTimeout(250)
      const curled = await handle.boundingBox()
      expect(curled.y).toBeLessThan(start.y - 30)
      await page.mouse.up()
      await page.getByRole('button', { name: '종이 펴기' }).click()
      await expect(page.locator('.lp-canvas')).toHaveAttribute('data-settled', 'true')
      await expect(body).toHaveValue('살아 있는 종이 위에 쓰는 나의 문장.')
      await body.click()
      await expect(body).toBeFocused()
      expect(errors).toEqual([])
    })

    test('preserves the written document if the graphics context is lost', async ({ page }) => {
      await openNative(page)
      await page.getByRole('button', { name: '글 쓰기' }).click()
      await expect(page.locator('.lp-canvas')).toHaveAttribute('data-settled', 'true')
      await page.getByRole('textbox', { name: '문서 본문' }).fill('이 문장은 렌더러가 바뀌어도 남아야 합니다.')
      await page.getByRole('button', { name: '블루프린트 종이' }).click()
      await page.getByRole('button', { name: '도장 찍기', exact: true }).click()
      await page.locator('.lp-canvas').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext())
      await expect(page.locator('.living-paper')).toHaveAttribute('data-support', 'fallback')
      await expect(page.getByRole('textbox', { name: '문서 본문' })).toHaveValue('이 문장은 렌더러가 바뀌어도 남아야 합니다.')
      await expect(page.locator('.lp-paper')).toHaveCount(1)
      await expect(page.locator('.lp-canvas')).toHaveCount(0)
      await expect(page.locator('.living-paper')).toHaveAttribute('data-material', 'blueprint')
      await expect(page.locator('.lp-stamp')).toHaveCount(1)
      await page.getByRole('textbox', { name: '문서 본문' }).click()
      await expect(page.getByRole('textbox', { name: '문서 본문' })).toBeFocused()
    })

    test('resynchronizes input after resizing and honors reduced motion', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await openNative(page)
      await expect(page.locator('.lp-canvas')).toHaveAttribute('data-settled', 'true')
      await expect(page.getByRole('slider', { name: '바람 세기' })).toBeDisabled()
      await page.setViewportSize({ width: 390, height: 844 })
      const title = page.getByRole('textbox', { name: '문서 제목' })
      await title.click()
      await expect(title).toBeFocused()
      await page.keyboard.press('Meta+A')
      await page.keyboard.insertText('작은 종이')
      await expect(title).toHaveValue('작은 종이')
      await page.getByRole('button', { name: '종이 만지기' }).click()
      await expect(page.getByRole('button', { name: '바람 불기', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: '톡 건드리기', exact: true })).toBeDisabled()
      const handle = page.getByRole('button', { name: '종이 모서리 당기기' })
      await handle.focus()
      await handle.press('ArrowUp')
      await page.getByRole('button', { name: '종이 펴기' }).click()
      await expect(page.locator('.lp-canvas')).toHaveAttribute('data-settled', 'true')
      await expect(title).toHaveValue('작은 종이')
    })

    test('uploads new paper stocks and stamps without losing the writing', async ({ page }) => {
      await openNative(page)
      await page.getByRole('button', { name: '글 쓰기' }).click()
      await expect(page.locator('.lp-canvas')).toHaveAttribute('data-settled', 'true')
      const before = await canvasPixels(page)
      await decoratePaper(page)
      const uploads = await page.evaluate(() => window.paperUploads)
      await page.getByRole('button', { name: '블루프린트 종이' }).click()
      await expect.poll(() => page.evaluate(() => window.paperUploads)).toBeGreaterThan(uploads)
      expect((await canvasPixels(page)).hash).not.toBe(before.hash)
      const stamped = await canvasPixels(page)
      await page.getByRole('button', { name: '마지막 도장 지우기' }).click()
      await expect.poll(async () => (await canvasPixels(page)).hash).not.toBe(stamped.hash)
      await page.getByRole('textbox', { name: '문서 본문' }).click()
      await expect(page.getByRole('textbox', { name: '문서 본문' })).toBeFocused()
    })

    test('drags each of the four corners inward and restores editing', async ({ page }) => {
      await openNative(page)
      await page.getByRole('slider', { name: '바람 세기' }).fill('0')
      const directions = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
      for (let i = 0; i < directions.length; i++) {
        const handle = page.locator(`.lp-corner[data-corner="${i}"]`)
        await page.waitForTimeout(650)
        const start = await handle.boundingBox()
        const [dx, dy] = directions[i]
        await page.mouse.move(start.x + 19, start.y + 19)
        await page.mouse.down()
        await page.mouse.move(start.x + 19 + dx * 90, start.y + 19 + dy * 90, { steps: 12 })
        await expect.poll(async () => {
          const bent = await handle.boundingBox()
          return (bent.x - start.x) * dx
        }).toBeGreaterThan(20)
        await page.mouse.up()
      }
      await page.getByRole('button', { name: '종이 펴기' }).click()
      await expect(page.locator('.lp-canvas')).toHaveAttribute('data-settled', 'true')
      await page.getByRole('textbox', { name: '문서 본문' }).click()
      await expect(page.getByRole('textbox', { name: '문서 본문' })).toBeFocused()
    })

    test('deforms the actual mesh with a tap and a gust then flattens completely', async ({ page }) => {
      await openNative(page)
      await page.getByRole('slider', { name: '바람 세기' }).fill('0')
      await expect.poll(() => centerDisplacement(page)).toBeLessThan(0.01)
      const canvas = await page.locator('.lp-canvas').boundingBox()
      await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)
      await expect.poll(() => centerDisplacement(page)).toBeGreaterThan(1)
      await expect.poll(() => centerDisplacement(page)).toBeLessThan(0.05)
      await page.getByRole('button', { name: '톡 건드리기', exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect.poll(() => centerDisplacement(page)).toBeGreaterThan(1)
      await page.getByRole('button', { name: '바람 불기', exact: true }).click()
      await expect.poll(() => centerDisplacement(page)).toBeGreaterThan(8)
      await page.getByRole('button', { name: '종이 펴기' }).click()
      await expect(page.locator('.lp-canvas')).toHaveAttribute('data-settled', 'true')
      expect(await centerDisplacement(page)).toBe(0)
    })

    test('keeps phone handles on screen and responds to a touch drag', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 740 })
      await openNative(page)
      await expect.poll(() => page.locator('.living-paper').evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0)
      for (const handle of await page.locator('.lp-corner').all()) {
        const bounds = await handle.boundingBox()
        expect(bounds.x).toBeGreaterThanOrEqual(0)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(320)
      }
      const handle = page.locator('.lp-corner[data-corner="2"]')
      await handle.scrollIntoViewIfNeeded()
      const start = await handle.boundingBox()
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x + 19, y: start.y + 19 }] })
      for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 19 + i * 6, y: start.y + 19 + i * 6 }] })
      await expect.poll(async () => (await handle.boundingBox()).x - start.x).toBeGreaterThan(15)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await cdp.detach()
      await page.getByRole('button', { name: '바람 불기', exact: true }).click()
      const gestures = await page.locator('.lp-gestures').boundingBox()
      const footer = await page.locator('.lp-colophon').boundingBox()
      expect(gestures.y + gestures.height).toBeLessThan(footer.y)
      await page.getByRole('button', { name: '종이 펴기' }).click()
      await expect(page.locator('.lp-canvas')).toHaveAttribute('data-settled', 'true')
      await page.getByRole('textbox', { name: '문서 본문' }).fill('손끝에서 다시 문장으로.')
      await expect(page.getByRole('textbox', { name: '문서 본문' })).toHaveValue('손끝에서 다시 문장으로.')
    })
  })
