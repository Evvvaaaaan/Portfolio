import { _electron as electron, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

if (process.platform !== 'win32') throw new Error('Run this check on Windows.')
const executablePath = process.env.SPATIAL_TEST_EXE
if (!executablePath) throw new Error('Set SPATIAL_TEST_EXE to the installed application.')
await mkdir('test-results', { recursive: true })
const app = await electron.launch({ executablePath, acceptDownloads: true, timeout: 60_000 })
try {
  const page = await app.firstWindow()
  await expect(page.getByRole('heading', { name: /사진 속 공간을/ })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('spatial-viewer')).toHaveAttribute('data-renderer', 'closed-solids', { timeout: 60_000 })
  await expect(page.getByRole('button', { name: '엔진 설치 시작' })).toBeVisible()
  if (process.argv.includes('--install-engine')) {
    await page.getByRole('button', { name: '엔진 설치 시작' }).click()
    await expect(page.getByRole('button', { name: '엔진 설치 중…' })).toBeDisabled()
    const deadline = Date.now() + 25 * 60_000
    let complete = false
    let previousOutput = ''
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => window.spatialDesktop.setupStatus())
      if (state.output !== previousOutput) {
        console.log(state.output.slice(-1000))
        previousOutput = state.output
      }
      if (!state.running) {
        expect(state.error, state.output).toBe('')
        complete = true
        break
      }
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
    expect(complete, 'Engine installation timed out').toBe(true)
    const health = await page.evaluate(async () => (await fetch('/api/spatial/health')).json())
    expect(health.ready, JSON.stringify(health)).toBe(true)
  }
  await page.reload()
  await page.locator('.sp-download summary').click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('link', { name: '3D 모델' }).click()
  const download = await downloadEvent
  await download.saveAs(join('test-results', download.suggestedFilename()))
  expect(await download.failure()).toBeNull()
  await page.screenshot({ path: 'test-results/windows-installed.png' })
  console.log(process.argv.includes('--install-engine') ? 'WINDOWS_ENGINE_VERIFIED: Python, model and Blender installed through the application.' : 'WINDOWS_APP_VERIFIED: NSIS installation, app launch and GLB download.')
} catch (error) {
  const page = app.windows()[0]
  if (page) {
    console.error(await page.locator('body').innerText())
    await page.screenshot({ path: 'test-results/windows-failure.png' })
  }
  throw error
} finally {
  await app.close()
}
