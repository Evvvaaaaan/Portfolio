/* global Buffer, process */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createReadStream, existsSync, openSync, closeSync } from 'node:fs'
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isStableScene } from '../src/experiments/SpatialStudio/navigation.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const DATA = resolve(process.env.SPATIAL_DATA || join(ROOT, '.spatial-data'))
const RUNTIME = resolve(process.env.SPATIAL_RUNTIME || join(ROOT, '.spatial-runtime'))
const API = '/api/spatial'
const TERMINAL = new Set(['ready', 'failed', 'cancelled'])
const ID = /^[a-f0-9]{32}$/
const ASSET = /^(scene\.(glb|blend|json)|preview\.jpg|source-[0-7]\.jpg|view-[0-6]\.jpg)$/
const MAX_BODY = 50 * 1024 * 1024

export function isSpatialLocalRequest(req) {
  try {
    const url = new URL(`http://${req.headers.host}`)
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
    return local && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && (!req.headers.origin || new URL(req.headers.origin).host === url.host)
      && req.headers['sec-fetch-site'] !== 'cross-site'
  } catch { return false }
}

export function imageExtension(bytes) {
  if (bytes.length < 12 || bytes.length > 12 * 1024 * 1024) return null
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg'
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(body))
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return null }
}

export function runtimeStatus() {
  const python = process.env.SPATIAL_PYTHON || join(RUNTIME, 'venv/bin/python')
  const blender = process.env.SPATIAL_BLENDER || join(RUNTIME, process.platform === 'darwin' ? 'Blender.app/Contents/MacOS/Blender' : 'blender/blender')
  const checks = { python: existsSync(python), blender: existsSync(blender),
    model: ['config.json', 'model.safetensors', 'preprocessor_config.json', 'tokenizer_config.json']
      .every(file => existsSync(join(RUNTIME, 'models-layout', file))),
    engine: existsSync(join(ROOT, 'spatial/solid_reconstruct.py')) }
  return { ready: Object.values(checks).every(Boolean), checks, maxImages: 8, maxTotalMB: 48,
    billing: { provider: 'local', apiCost: 0, requiresApiKey: false },
    representation: 'closed-solids-v1', engine: 'Qwen3-VL 2B + Blender', local: true }
}

export function completionMode(value) {
  // Old clients also use the safe generator; depth-sheet output is retired.
  if (value == null || ['solid', 'observed', 'local'].includes(value)) return 'solid'
  throw new Error('지원하지 않는 보완 방식입니다. 무료 로컬 입체 재구성을 선택해 주세요.')
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid < 2) return false
  try { process.kill(pid, 0); return true } catch { return false }
}

async function jobStatus(id) {
  if (!ID.test(id)) return null
  const status = await readJson(join(DATA, id, 'status.json'))
  if (!status) return null
  if (!TERMINAL.has(status.stage)) {
    const execution = await readJson(join(DATA, id, 'process.json'))
    if (execution && !isAlive(execution.pid)) {
      status.stage = 'failed'
      status.error = '변환 프로세스가 종료되었습니다. 사진을 다시 선택해 재시도해 주세요.'
      await writeFile(join(DATA, id, 'status.json'), JSON.stringify(status))
    }
  }
  return status
}

async function jobs() {
  await mkdir(DATA, { recursive: true })
  const ids = (await readdir(DATA)).filter(id => ID.test(id))
  const results = await Promise.all(ids.map(jobStatus))
  return results.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

async function parseUpload(req) {
  if (!/^multipart\/form-data; boundary=/i.test(req.headers['content-type'] || '')) {
    throw new Error('사진 파일을 선택해 주세요.')
  }
  let length = 0
  const chunks = []
  for await (const chunk of req) {
    length += chunk.length
    if (length > MAX_BODY) throw new Error('사진의 총 용량은 48MB 이하여야 합니다.')
    chunks.push(chunk)
  }
  const request = new Request('http://localhost/upload', { method: 'POST',
    headers: { 'content-type': req.headers['content-type'] }, body: Buffer.concat(chunks) })
  const form = await request.formData()
  const files = form.getAll('images')
  if (!files.length || files.length > 8) throw new Error('사진을 1~8장 선택해 주세요.')
  const decoded = []
  for (const file of files) {
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('올바른 사진 파일이 아닙니다.')
    const bytes = Buffer.from(await file.arrayBuffer())
    const extension = imageExtension(bytes)
    if (!extension) throw new Error('12MB 이하의 JPG, PNG, WebP 사진을 사용해 주세요.')
    decoded.push({ bytes, extension })
  }
  return { decoded, name: String(form.get('name') || 'Untitled space').trim().slice(0, 80) || 'Untitled space',
    quality: form.get('quality') === 'detail' ? 'detail' : 'balanced', completion: completionMode(form.get('completion')) }
}

export function createSpatialService() {
  let submitting = false
  return async function spatialService(req, res, next = () => json(res, 404, { error: 'Not found' })) {
    let url
    try { url = new URL(req.url, 'http://localhost') } catch { return next() }
    if (!url.pathname.startsWith(`${API}/`)) return next()
    if (!isSpatialLocalRequest(req)) return json(res, 403, { error: '이 복원 서버는 같은 컴퓨터의 브라우저에서만 사용할 수 있습니다.' })
    try {
      if (req.method === 'GET' && url.pathname === `${API}/health`) return json(res, 200, runtimeStatus())
      if (req.method === 'GET' && url.pathname === `${API}/jobs`) return json(res, 200, { jobs: await jobs() })
      if (req.method === 'POST' && url.pathname === `${API}/jobs`) {
        if (submitting) return json(res, 409, { error: '다른 공간을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.' })
        submitting = true
        try {
          if (!runtimeStatus().ready) return json(res, 503, { error: '복원 엔진 설치가 필요합니다. Spatial Studio 실행 안내를 확인해 주세요.' })
          if ((await jobs()).some(job => !TERMINAL.has(job.stage))) return json(res, 409, { error: '다른 공간을 변환하고 있습니다. 완료 후 다시 시작해 주세요.' })
          const input = await parseUpload(req)
          const id = randomBytes(16).toString('hex')
          const folder = join(DATA, id)
          await mkdir(folder, { recursive: true })
          const files = []
          for (const [index, image] of input.decoded.entries()) {
            const filename = `input-${index}.${image.extension}`
            await writeFile(join(folder, filename), image.bytes)
            files.push(filename)
          }
          const createdAt = new Date().toISOString()
          await writeFile(join(folder, 'request.json'), JSON.stringify({ name: input.name, quality: input.quality, completion: input.completion, files, createdAt }))
          const status = { id, name: input.name, createdAt, quality: input.quality, completion: input.completion,
            imageCount: files.length, stage: 'queued', progress: 0 }
          await writeFile(join(folder, 'status.json'), JSON.stringify(status))
          const log = openSync(join(folder, 'worker.log'), 'a')
          const child = spawn(process.env.SPATIAL_PYTHON || join(RUNTIME, 'venv/bin/python'),
            [join(ROOT, 'spatial/solid_reconstruct.py'), folder], { cwd: ROOT, detached: true,
              stdio: ['ignore', log, log], env: { ...process.env, SPATIAL_RUNTIME: RUNTIME,
                XDG_CACHE_HOME: join(RUNTIME, 'cache'), PYTHONUNBUFFERED: '1' } })
          closeSync(log)
          child.on('error', async () => {
            await writeFile(join(folder, 'status.json'), JSON.stringify({ ...status, stage: 'failed', error: '복원 엔진을 시작할 수 없습니다.' }))
          })
          await writeFile(join(folder, 'process.json'), JSON.stringify({ pid: child.pid }))
          child.unref()
          return json(res, 202, status)
        } finally { submitting = false }
      }
      const match = url.pathname.match(/^\/api\/spatial\/jobs\/([a-f0-9]{32})(?:\/([^/]+))?$/)
      if (!match) return json(res, 404, { error: '공간을 찾을 수 없습니다.' })
      const [, id, asset] = match
      const status = await jobStatus(id)
      if (!status) return json(res, 404, { error: '공간을 찾을 수 없습니다.' })
      if (req.method === 'GET' && !asset) return json(res, 200, status)
      if (req.method === 'POST' && asset === 'cancel') {
        if (!TERMINAL.has(status.stage)) {
          const execution = await readJson(join(DATA, id, 'process.json'))
          if (execution && isAlive(execution.pid)) {
            try { process.kill(-execution.pid, 'SIGTERM') } catch { /* Already exited. */ }
          }
          const cancelled = { ...status, stage: 'cancelled', error: '변환을 취소했습니다.' }
          await writeFile(join(DATA, id, 'status.json'), JSON.stringify(cancelled))
          return json(res, 200, cancelled)
        }
        return json(res, 200, status)
      }
      if (req.method === 'GET' && asset && ASSET.test(asset)) {
        if (!asset.startsWith('source-') && asset !== 'scene.json' && (status.stage !== 'ready' || !isStableScene(status.result))) {
          return json(res, 409, { error: '안정성 검사를 통과한 새 3D 결과만 제공됩니다. 기존 사진으로 다시 생성해 주세요.' })
        }
        const path = join(DATA, id, asset)
        const info = await stat(path).catch(() => null)
        if (!info?.isFile()) return json(res, 404, { error: '파일이 아직 생성되지 않았습니다.' })
        const type = asset.endsWith('.jpg') ? 'image/jpeg' : asset.endsWith('.json') ? 'application/json' : 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff', ...(url.searchParams.has('download')
            ? { 'Content-Disposition': `attachment; filename="spatial-${asset}"` } : {}) })
        createReadStream(path).pipe(res)
        return
      }
      return json(res, 405, { error: '지원하지 않는 요청입니다.' })
    } catch (error) {
      return json(res, 400, { error: error.message || '요청을 처리할 수 없습니다.' })
    }
  }
}

export function spatialStudioPlugin() {
  const service = createSpatialService()
  return { name: 'spatial-studio', configureServer(server) { server.middlewares.use(service) },
    configurePreviewServer(server) { server.middlewares.use(service) } }
}
