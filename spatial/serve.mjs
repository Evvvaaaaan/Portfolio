import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSpatialService } from '../dev/spatialService.js'

const root = resolve(fileURLToPath(new URL('../build', import.meta.url)))
const service = createSpatialService()
const port = Number(process.env.SPATIAL_PORT || 5175)
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' }
if (!(await stat(resolve(root, 'index.html')).catch(() => null))) throw new Error('Run npm run build first.')

createServer((req, res) => {
  service(req, res, async () => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
      const appRoute = ['/', '/spatial', '/gallery'].includes(pathname) || /^\/gallery\/[a-z0-9-]+$/.test(pathname)
      const path = resolve(root, `.${appRoute ? '/index.html' : pathname}`)
      if (!path.startsWith(`${root}${sep}`)) { res.writeHead(403); res.end(); return }
      const info = await stat(path).catch(() => null)
      if (!info?.isFile()) { res.writeHead(404); res.end('Not found'); return }
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream',
        'Content-Length': info.size, 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' })
      if (req.method === 'HEAD') res.end()
      else createReadStream(path).pipe(res)
    } catch { res.writeHead(400); res.end('Invalid request') }
  })
}).listen(port, '127.0.0.1', () => console.log(`Spatial Studio: http://127.0.0.1:${port}/spatial`))
