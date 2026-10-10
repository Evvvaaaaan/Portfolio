import { spawn } from 'node:child_process'
import { existsSync, createWriteStream } from 'node:fs'
import { mkdir, rename, cp, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const root = fileURLToPath(new URL('../', import.meta.url))
const runtime = resolve(process.env.SPATIAL_RUNTIME || join(root, '.spatial-runtime'))
const platform = `${process.platform}-${process.arch}`
const configurations = {
  'darwin-arm64': { uv: 'aarch64-apple-darwin', blender: 'blender-4.5.3-macos-arm64.dmg' },
  'win32-x64': { uv: 'x86_64-pc-windows-msvc', blender: 'blender-4.5.3-windows-x64.zip' },
  'linux-x64': { uv: 'x86_64-unknown-linux-gnu', blender: 'blender-4.5.3-linux-x64.tar.xz' },
}
const config = configurations[platform]
if (!config) throw new Error(`Unsupported automatic setup platform: ${platform}. See spatial/README.md.`)

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options })
    child.once('error', reject)
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)))
  })
}

async function download(url, path) {
  if (existsSync(path) && (await stat(path)).size > 100) return
  console.log(`Downloading ${url.split('/').at(-1)}…`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`)
  await mkdir(resolve(path, '..'), { recursive: true })
  await pipeline(Readable.fromWeb(response.body), createWriteStream(`${path}.partial`))
  await rename(`${path}.partial`, path)
}

await mkdir(runtime, { recursive: true })
const python = join(runtime, process.platform === 'win32' ? 'venv/Scripts/python.exe' : 'venv/bin/python')
const blender = process.env.SPATIAL_BLENDER || (process.platform === 'darwin'
  ? join(runtime, 'Blender.app/Contents/MacOS/Blender') : join(runtime, process.platform === 'win32' ? 'blender/blender.exe' : 'blender/blender'))
if (!process.argv.includes('--check')) {
  let uv = process.env.UV_BIN || join(runtime, process.platform === 'win32' ? 'uv.exe' : `uv-${config.uv}/uv`)
  if (!existsSync(uv)) {
    const archive = join(runtime, process.platform === 'win32' ? 'uv.zip' : 'uv.tar.gz')
    await download(`https://github.com/astral-sh/uv/releases/download/0.12.16/uv-${config.uv}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`, archive)
    await run('tar', ['-xf', archive, '-C', runtime])
  }
  if (!existsSync(python)) {
    await run(uv, ['python', 'install', '3.12', '--install-dir', join(runtime, 'python'), '--no-bin', '--cache-dir', join(runtime, 'cache')])
    await run(uv, ['venv', join(runtime, 'venv'), '--python', '3.12', '--cache-dir', join(runtime, 'cache')],
      { env: { ...process.env, UV_PYTHON_INSTALL_DIR: join(runtime, 'python') } })
  }
  await run(uv, ['pip', 'install', '--python', python, '--cache-dir', join(runtime, 'cache'), '-r', join(root, 'spatial/requirements-solid.txt')])
  await run(python, [join(root, 'spatial/setup_solid.py')], { env: { ...process.env, SPATIAL_RUNTIME: runtime } })
  if (!existsSync(blender)) {
    const archive = join(runtime, config.blender)
    await download(`https://download.blender.org/release/Blender4.5/${config.blender}`, archive)
    if (process.platform === 'darwin') {
      const mountpoint = join(runtime, 'blender-install')
      await run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mountpoint, archive])
      try { await cp(join(mountpoint, 'Blender.app'), join(runtime, 'Blender.app'), { recursive: true }) }
      finally { await run('hdiutil', ['detach', mountpoint]) }
    } else if (process.platform === 'win32') {
      await run('tar', ['-xf', archive, '-C', runtime])
      await rename(join(runtime, config.blender.slice(0, -4)), join(runtime, 'blender'))
    } else {
      await mkdir(join(runtime, 'blender'), { recursive: true })
      await run('tar', ['-xf', archive, '--strip-components=1', '-C', join(runtime, 'blender')])
    }
  }
}
await run(python, ['-c', 'import torch; from transformers import Qwen3VLForConditionalGeneration, AutoProcessor; print("Solid layout engine ready; GPU:", "MPS" if torch.backends.mps.is_available() else "CUDA" if torch.cuda.is_available() else "CPU")'])
await run(python, ['-m', 'unittest', 'discover', '-s', 'spatial', '-p', 'test_scene_spec.py'])
await run(blender, ['--background', '--factory-startup', '--version'])
for (const file of ['model.safetensors', 'config.json', 'preprocessor_config.json', 'tokenizer_config.json']) {
  if (!existsSync(join(runtime, 'models-layout', file))) throw new Error(`Missing layout model file: ${file}`)
}
console.log('\nSpatial Studio is ready. Run: npm run spatial\nOpen: http://127.0.0.1:5175/spatial')
