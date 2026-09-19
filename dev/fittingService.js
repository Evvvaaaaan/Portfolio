/* global Buffer */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execute = promisify(execFile)
const MAX_IMAGE = 8 * 1024 * 1024
const MAX_BODY = 23 * 1024 * 1024
const TTL = 60 * 60 * 1000
const API = '/api/fitting'
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

export function isLocalRequest(req) {
  try {
    const url = new URL(`http://${req.headers.host}`)
    if (!LOOPBACK.has(req.socket.remoteAddress) || !HOSTS.has(url.hostname)) return false
    if (req.headers.origin && new URL(req.headers.origin).host !== url.host) return false
    if (req.headers['sec-fetch-site'] === 'cross-site') return false
    return true
  } catch { return false }
}

export function decodeImage(image) {
  if (!image || typeof image.data !== 'string' || image.data.length > MAX_IMAGE * 1.4) throw new Error('INVALID_IMAGE')
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(image.data)
  if (!match) throw new Error('INVALID_IMAGE')
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > MAX_IMAGE || bytes.length < 12) throw new Error('INVALID_IMAGE')
  const format = match[1]
  const valid = format === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : format === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  if (!valid) throw new Error('INVALID_IMAGE')
  return { bytes, extension: format === 'jpeg' ? 'jpg' : format }
}

// Only provider output fields are considered: never select an input reference as the result.
export function resultAsset(result, kind) {
  const candidates = []
  const walk = (value, key = '', depth = 0) => {
    if (depth > 12 || /reference|thumbnail|preview|input|prompt/i.test(key)) return
    if (typeof value === 'string' && /^https:\/\//.test(value)) {
      const url = new URL(value)
      const extension = kind === 'model' ? /\.glb$/i : /\.(png|jpe?g|webp)$/i
      const named = kind === 'model' ? /^(glb|glb_url|model_url)$/i : /^(image_url|output_url|url)$/i
      if (extension.test(url.pathname) || named.test(key)) candidates.push({ url: value, score: extension.test(url.pathname) ? 2 : 1 })
    } else if (Array.isArray(value)) value.forEach((v) => walk(v, key, depth + 1))
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, k, depth + 1))
  }
  walk(result)
  return candidates.sort((a, b) => b.score - a.score)[0]?.url || null
}

export function modelArgs(imagePath) {
  return ['generate', 'create', 'image_to_3d', '--image', imagePath,
    '--should_texture', 'true', '--should_remesh', 'true', '--target_polycount', '20000',
    '--topology', 'triangle', '--pose_mode', 'a-pose', '--enable_pbr', 'false',
    '--enable_safety_checker', 'true', '--wait', '--wait-timeout', '15m', '--json']
}

export function lookArgs(personPath, garmentPath) {
  return ['product-photoshoot', 'create', '--mode', 'virtual_model_tryout',
    '--prompt', 'Dress the person in reference image 1 in the exact garment from reference image 2. Preserve their identity, face, body proportions, garment color, pattern and construction. One fully clothed person, full body including hands and feet, relaxed A-pose with separated arms, clean white studio background, no props, no collage. Keep the rest of the outfit appropriately clothed. This image is a reference for 3D reconstruction.',
    '--image', personPath, '--image', garmentPath, '--count', '1', '--timeout', '15m', '--json']
}

function safeError(error) {
  const message = `${error?.message || ''} ${error?.stderr || ''}`
  if (/credit|balance|payment|insufficient/i.test(message)) return 'CREDITS_REQUIRED'
  if (/auth|session expired|login|unauthorized/i.test(message)) return 'LOGIN_REQUIRED'
  if (/ENOENT/.test(message)) return 'CLI_MISSING'
  if (/INVALID_IMAGE|INVALID_REQUEST|NO_RESULT|BUSY|SOURCE_EXPIRED/.test(message)) return error.message
  if (/timeout|timed out|ABORT_ERR/i.test(message)) return 'GENERATION_TIMEOUT'
  return 'GENERATION_FAILED'
}

async function runCli(args) {
  const { stdout } = await execute('higgsfield', args, { timeout: 16 * 60 * 1000, maxBuffer: 12 * 1024 * 1024, windowsHide: true })
  return JSON.parse(stdout)
}

async function readBody(req) {
  let length = 0
  const chunks = []
  for await (const chunk of req) {
    length += chunk.length
    if (length > MAX_BODY) throw new Error('INVALID_IMAGE')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function createFittingService({ run = runCli, fetchAsset = fetch, now = Date.now } = {}) {
  const token = randomBytes(24).toString('hex')
  const jobs = new Map()
  let active = false
  const snapshot = (job) => ({ id: job.id, kind: job.kind, status: job.status, error: job.error, createdAt: job.createdAt })
  const prune = () => { for (const [id, job] of jobs) if (job.status !== 'running' && now() - job.createdAt > TTL) jobs.delete(id) }

  async function download(url, maxBytes) {
    // URLs originate only from Higgsfield results, never from a client-supplied URL.
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/.test(parsed.hostname)) throw new Error('NO_RESULT')
    const response = await fetchAsset(url, { signal: AbortSignal.timeout(60_000), redirect: 'error' })
    if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) throw new Error('NO_RESULT')
    const parts = []
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.length
      if (size > maxBytes) throw new Error('NO_RESULT')
      parts.push(chunk)
    }
    return Buffer.concat(parts)
  }

  async function processJob(job, data) {
    let directory
    try {
      directory = await mkdtemp(join(tmpdir(), 'evan-fitting-'))
      let input
      if (job.kind === 'mesh') {
        const source = jobs.get(data.sourceId)
        if (!source || source.kind !== 'look' || source.status !== 'complete') throw new Error('SOURCE_EXPIRED')
        const extension = source.mime === 'image/jpeg' ? 'jpg' : source.mime === 'image/webp' ? 'webp' : 'png'
        input = join(directory, `look.${extension}`)
        await writeFile(input, source.asset)
      } else {
        const person = decodeImage(data.person)
        input = join(directory, `person.${person.extension}`)
        await writeFile(input, person.bytes)
      }
      let args
      if (job.kind === 'look') {
        const garment = decodeImage(data.garment)
        const file = join(directory, `garment.${garment.extension}`)
        await writeFile(file, garment.bytes)
        args = lookArgs(input, file)
      } else args = modelArgs(input)
      const result = await run(args)
      const url = resultAsset(result, job.kind === 'look' ? 'image' : 'model')
      if (!url) throw new Error('NO_RESULT')
      job.asset = await download(url, job.kind === 'look' ? 16 * 1024 * 1024 : 50 * 1024 * 1024)
      if (job.kind !== 'look' && job.asset.toString('ascii', 0, 4) !== 'glTF') throw new Error('NO_RESULT')
      job.mime = job.kind === 'look' ? (/\.webp(?:\?|$)/i.test(url) ? 'image/webp' : /\.jpe?g(?:\?|$)/i.test(url) ? 'image/jpeg' : 'image/png') : 'model/gltf-binary'
      job.status = 'complete'
    } catch (error) {
      job.status = 'failed'
      job.error = safeError(error)
    } finally {
      // Only the unique directory created above is removed; the originals never leave browser memory until consent.
      if (directory) await rm(directory, { recursive: true, force: true })
      active = false
    }
  }

  async function create(data) {
    prune()
    if (data.consent !== true || !['avatar', 'look', 'mesh'].includes(data.kind)) throw new Error('INVALID_REQUEST')
    if (active) throw new Error('BUSY')
    if (data.kind !== 'mesh') decodeImage(data.person)
    if (data.kind === 'look') decodeImage(data.garment)
    if (data.kind === 'mesh' && (!jobs.has(data.sourceId) || data.reviewed !== true)) throw new Error('SOURCE_EXPIRED')
    if (jobs.size >= 8) {
      // Keep at most eight completed results in process memory; never evict an active job.
      const oldest = [...jobs.values()].find((j) => j.status !== 'running' && j.id !== data.sourceId)
      if (oldest) jobs.delete(oldest.id)
    }
    const job = { id: randomUUID(), kind: data.kind, status: 'running', createdAt: now(), error: null, asset: null }
    jobs.set(job.id, job)
    active = true
    void processJob(job, data)
    return snapshot(job)
  }

  const send = (res, code, body) => {
    res.statusCode = code
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }
  async function middleware(req, res, next) {
    const pathname = req.url?.split('?')[0]
    if (!pathname?.startsWith(`${API}/`)) return next()
    if (!isLocalRequest(req)) return send(res, 403, { error: 'LOCAL_ONLY' })
    if (pathname === `${API}/status` && req.method === 'GET') {
      try {
        await execute('higgsfield', ['version'], { timeout: 3000 })
        return send(res, 200, { available: true, token, mode: 'local-cli' })
      } catch { return send(res, 200, { available: false, error: 'CLI_MISSING' }) }
    }
    if (req.headers['x-fitting-token'] !== token) return send(res, 403, { error: 'INVALID_SESSION' })
    try {
      prune()
      if (pathname === `${API}/jobs` && req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, { error: 'INVALID_REQUEST' })
        return send(res, 202, await create(await readBody(req)))
      }
      const match = /^\/api\/fitting\/jobs\/([a-f0-9-]+)(\/asset)?$/.exec(pathname)
      const job = match && jobs.get(match[1])
      if (!job) return send(res, 404, { error: 'SOURCE_EXPIRED' })
      if (req.method === 'DELETE' && job.status !== 'running') { jobs.delete(job.id); return send(res, 200, { deleted: true }) }
      if (req.method !== 'GET') return send(res, 405, { error: 'INVALID_REQUEST' })
      if (match[2]) {
        if (job.status !== 'complete') return send(res, 409, { error: 'NOT_READY' })
        res.setHeader('Content-Type', job.mime)
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        return res.end(job.asset)
      }
      return send(res, 200, snapshot(job))
    } catch (error) { return send(res, error.message === 'BUSY' ? 409 : 400, { error: safeError(error) }) }
  }
  return { middleware, create, get: (id) => { prune(); const job = jobs.get(id); return job ? snapshot(job) : null } }
}

export function fittingStudioPlugin() {
  return { name: 'local-fitting-studio', apply: 'serve', configureServer(server) {
    const service = createFittingService()
    server.middlewares.use(service.middleware)
  } }
}
