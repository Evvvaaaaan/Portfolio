/* global Buffer */
import { describe, expect, it, vi } from 'vitest'
import { access, readFile } from 'node:fs/promises'
import { createFittingService, decodeImage, isLocalRequest, lookArgs, modelArgs, resultAsset } from './fittingService.js'

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
const photo = { data: `data:image/png;base64,${png.toString('base64')}` }
const model = Buffer.from('glTFabcdefghijklmnop')
const waitForJob = async (service, id) => {
  await vi.waitFor(() => expect(service.get(id)?.status).not.toBe('running'))
  return service.get(id)
}

describe('local fitting service', () => {
  it('rejects non-loopback hosts, remote clients, cross-origin and DNS rebinding requests', () => {
    const req = { headers: { host: 'localhost:5174', origin: 'http://localhost:5174' }, socket: { remoteAddress: '127.0.0.1' } }
    expect(isLocalRequest(req)).toBe(true)
    expect(isLocalRequest({ ...req, headers: { ...req.headers, origin: 'https://evil.example' } })).toBe(false)
    expect(isLocalRequest({ ...req, headers: { host: 'evil.example:5174' } })).toBe(false)
    expect(isLocalRequest({ ...req, socket: { remoteAddress: '192.168.1.20' } })).toBe(false)
    expect(isLocalRequest({ ...req, headers: { ...req.headers, 'sec-fetch-site': 'cross-site' } })).toBe(false)
  })

  it('accepts only bounded raster images with matching magic bytes', () => {
    expect(decodeImage(photo).bytes).toEqual(png)
    expect(() => decodeImage({ data: 'data:image/svg+xml;base64,PHN2Zz4=' })).toThrow('INVALID_IMAGE')
    expect(() => decodeImage({ data: 'data:image/jpeg;base64,YWJjZGVmZ2hpamtsbW5vcA==' })).toThrow('INVALID_IMAGE')
    expect(() => decodeImage({ data: 'x'.repeat(12 * 1024 * 1024) })).toThrow('INVALID_IMAGE')
    expect(() => decodeImage({ data: '/Users/evan/private.jpg' })).toThrow('INVALID_IMAGE')
  })

  it('selects output GLB/image URLs without confusing thumbnails and inputs', () => {
    const result = [{ params: { image_references: [{ url: 'https://cdn.test/input.png' }], thumbnail: 'https://cdn.test/thumb.png', output: { glb_url: 'https://cdn.test/person.glb?signature=123', image_url: 'https://cdn.test/look.png' } } }]
    expect(resultAsset(result, 'model')).toContain('person.glb')
    expect(resultAsset(result, 'image')).toBe('https://cdn.test/look.png')
    expect(resultAsset({ glb_url: 'file:///etc/passwd' }, 'model')).toBe(null)
  })

  it('uses the verified native 3D and product-photoshoot commands, without a shell', () => {
    expect(modelArgs('/tmp/person.jpg')).toContain('image_to_3d')
    expect(modelArgs('/tmp/person.jpg')).toContain('20000')
    expect(modelArgs('/tmp/person.jpg')).toContain('a-pose')
    expect(lookArgs('/tmp/person.jpg', '/tmp/coat.jpg').slice(0, 4)).toEqual(['product-photoshoot', 'create', '--mode', 'virtual_model_tryout'])
    expect(lookArgs('x; rm /', 'y')).toContain('x; rm /')
  })

  it('requires consent and valid inputs before starting any paid command', async () => {
    const run = vi.fn()
    const service = createFittingService({ run })
    await expect(service.create({ kind: 'avatar', person: photo })).rejects.toThrow('INVALID_REQUEST')
    await expect(service.create({ kind: 'look', person: photo, consent: true })).rejects.toThrow('INVALID_IMAGE')
    await expect(service.create({ kind: 'avatar', person: { data: 'bad' }, consent: true })).rejects.toThrow('INVALID_IMAGE')
    expect(run).not.toHaveBeenCalled()
  })

  it('completes an avatar job, hides provider secrets and deletes only its temporary inputs', async () => {
    let temporaryFile
    const run = vi.fn(async (args) => {
      temporaryFile = args[args.indexOf('--image') + 1]
      expect(await readFile(temporaryFile)).toEqual(png)
      return [{ output: { glb_url: 'https://cdn.test/person.glb?secret=private' } }]
    })
    const service = createFittingService({ run, fetchAsset: async () => new Response(model) })
    const job = await service.create({ kind: 'avatar', person: photo, consent: true })
    const result = await waitForJob(service, job.id)
    expect(result.status).toBe('complete')
    expect(JSON.stringify(result)).not.toMatch(/private|cdn\.test|person\.png/)
    await vi.waitFor(async () => { await expect(access(temporaryFile)).rejects.toThrow() })
  })

  it('requires a reviewed, completed outfit source for the second paid step', async () => {
    const run = vi.fn(async (args) => args[0] === 'product-photoshoot' ? { image_url: 'https://cdn.test/look.png' } : { glb_url: 'https://cdn.test/model.glb' })
    const service = createFittingService({ run, fetchAsset: async (url) => new Response(url.includes('.png') ? png : model) })
    const look = await service.create({ kind: 'look', person: photo, garment: photo, consent: true })
    expect((await waitForJob(service, look.id)).status).toBe('complete')
    await expect(service.create({ kind: 'mesh', sourceId: look.id, consent: true })).rejects.toThrow('SOURCE_EXPIRED')
    const mesh = await service.create({ kind: 'mesh', sourceId: look.id, consent: true, reviewed: true })
    expect((await waitForJob(service, mesh.id)).status).toBe('complete')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('prevents concurrent paid generations and does not retry failures automatically', async () => {
    let finish
    const run = vi.fn(() => new Promise((resolve, reject) => { finish = reject }))
    const service = createFittingService({ run })
    const job = await service.create({ kind: 'avatar', person: photo, consent: true })
    await expect(service.create({ kind: 'avatar', person: photo, consent: true })).rejects.toThrow('BUSY')
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    finish(new Error('Insufficient credits: secret=hidden'))
    const result = await waitForJob(service, job.id)
    expect(result.error).toBe('CREDITS_REQUIRED')
    expect(JSON.stringify(result)).not.toContain('hidden')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('keeps the generated JPEG format when passing a reviewed look to 3D', async () => {
    const jpeg = Buffer.from([255, 216, 255, 224, 0, 0, 0, 0, 0, 0, 0, 0])
    let meshInput
    const run = async (args) => {
      if (args[0] === 'product-photoshoot') return { image_url: 'https://cdn.test/look.jpg' }
      meshInput = args[args.indexOf('--image') + 1]
      return { glb_url: 'https://cdn.test/model.glb' }
    }
    const service = createFittingService({ run, fetchAsset: async (url) => new Response(url.endsWith('.jpg') ? jpeg : model) })
    const look = await service.create({ kind: 'look', person: photo, garment: photo, consent: true })
    await waitForJob(service, look.id)
    const mesh = await service.create({ kind: 'mesh', sourceId: look.id, consent: true, reviewed: true })
    await waitForJob(service, mesh.id)
    expect(meshInput).toMatch(/look\.jpg$/)
  })

  it('expires old completed results and rejects missing 3D output', async () => {
    let time = 0
    const service = createFittingService({ now: () => time, run: async () => ({ thumbnail_url: 'https://cdn.test/only-preview.png' }) })
    const job = await service.create({ kind: 'avatar', person: photo, consent: true })
    expect((await waitForJob(service, job.id)).error).toBe('NO_RESULT')
    time = 3600001
    expect(service.get(job.id)).toBeNull()
  })
})
