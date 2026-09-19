import { describe, it, expect } from 'vitest'
import { Buffer } from 'node:buffer'
import { imageExtension, isSpatialLocalRequest, completionMode, runtimeStatus } from './spatialService.js'

describe('spatial upload boundary', () => {
  it('allows only local completion and never selects a paid provider', () => {
    expect(completionMode(null)).toBe('solid')
    expect(completionMode('local')).toBe('solid')
    expect(completionMode('observed')).toBe('solid')
    expect(completionMode('solid')).toBe('solid')
    expect(() => completionMode('marble')).toThrow('무료 로컬')
    expect(runtimeStatus().billing).toEqual({ provider: 'local', apiCost: 0, requiresApiKey: false })
  })
  it('validates bytes independently of user supplied names and MIME types', () => {
    expect(imageExtension(Buffer.from('<script>not an image</script>'))).toBeNull()
    const jpg = Buffer.alloc(20)
    jpg.set([255, 216, 255])
    expect(imageExtension(jpg)).toBe('jpg')
    const png = Buffer.alloc(20)
    png.set([137, 80, 78, 71, 13, 10, 26, 10])
    expect(imageExtension(png)).toBe('png')
    expect(imageExtension(Buffer.alloc(13 * 1024 * 1024))).toBeNull()
  })
  it('allows same-origin local use and rejects remote, cross-origin and rebinding requests', () => {
    const request = { headers: { host: '127.0.0.1:5175', origin: 'http://127.0.0.1:5175' }, socket: { remoteAddress: '127.0.0.1' } }
    expect(isSpatialLocalRequest(request)).toBe(true)
    expect(isSpatialLocalRequest({ ...request, headers: { ...request.headers, origin: 'https://evil.example' } })).toBe(false)
    expect(isSpatialLocalRequest({ ...request, headers: { host: 'evil.example' } })).toBe(false)
    expect(isSpatialLocalRequest({ ...request, socket: { remoteAddress: '192.168.0.2' } })).toBe(false)
  })
})
