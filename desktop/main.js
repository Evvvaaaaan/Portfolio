import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = app.isPackaged ? join(process.resourcesPath, 'app') : dirname(here)
const runtime = join(app.getPath('userData'), 'runtime')
const data = join(app.getPath('userData'), 'jobs')
let server, installer, setup = { running: false, output: '', error: '' }

function run(script) {
  return spawn(process.execPath, [script], { cwd: appRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', SPATIAL_RUNTIME: runtime, SPATIAL_DATA: data, SPATIAL_PORT: '5175' }, stdio: ['ignore', 'pipe', 'pipe'] })
}
function broadcast() { BrowserWindow.getAllWindows().forEach((window) => window.webContents.send('spatial:setup-update', setup)) }
function startServer() { if (!server) { server = run(join(appRoot, 'spatial', 'serve.mjs')); server.once('exit', () => { server = null }) } }
function startSetup() {
  if (installer) return setup
  setup = { running: true, output: '로컬 엔진 설치를 준비하고 있습니다…', error: '' }; broadcast()
  installer = run(join(appRoot, 'spatial', 'setup.mjs'))
  const append = (chunk) => { setup.output = `${setup.output}\n${chunk}`.slice(-5000); broadcast() }
  installer.stdout.on('data', append); installer.stderr.on('data', append)
  installer.once('exit', (code) => { installer = null; setup = { ...setup, running: false, error: code === 0 ? '' : `설치가 종료되었습니다. 코드: ${code}` }; if (code === 0) startServer(); broadcast() })
  return setup
}

app.whenReady().then(() => {
  ipcMain.handle('spatial:setup-status', () => setup)
  ipcMain.handle('spatial:setup-start', () => startSetup())
  startServer()
  const window = new BrowserWindow({ width: 1440, height: 940, minWidth: 980, minHeight: 680, backgroundColor: '#f7f6ef', title: 'Spatial Studio', webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } })
  const load = () => window.loadURL('http://127.0.0.1:5175/spatial')
  load(); window.webContents.on('did-fail-load', () => setTimeout(load, 500))
})
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => { server?.kill('SIGTERM'); installer?.kill('SIGTERM') })
