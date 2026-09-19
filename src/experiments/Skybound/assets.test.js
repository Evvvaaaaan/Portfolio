import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { loadFlightAssets } from './assets.js'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback) => setTimeout(callback, 0))
  vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function setup() {
  const bitmap = { close: vi.fn() }
  const paint = new THREE.Texture(bitmap)
  const geometry = new THREE.BoxGeometry()
  const material = new THREE.MeshPhysicalMaterial({ map: paint, specularColorMap: paint })
  const model = new THREE.Group()
  model.add(new THREE.Mesh(geometry, material))
  const hdr = new THREE.DataTexture()
  const loadedTextures = []
  vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue({ scene: model })
  vi.spyOn(HDRLoader.prototype, 'loadAsync').mockResolvedValue(hdr)
  vi.spyOn(THREE.TextureLoader.prototype, 'loadAsync').mockImplementation(async () => {
    const map = new THREE.Texture()
    loadedTextures.push(map)
    return map
  })
  let disposed = false
  const resources = new Set()
  const context = {
    scene: new THREE.Scene(), renderer: { initTexture: vi.fn(), capabilities: { getMaxAnisotropy: () => 16 } },
    own: (resource) => { if (disposed) resource.dispose(); else resources.add(resource); return resource },
    isDisposed: () => disposed, invalidate: vi.fn(), aircraft: new THREE.Group(),
    fallback: new THREE.Group(), sky: new THREE.Mesh(), clouds: new THREE.Group(),
    terrainMaterial: new THREE.MeshStandardMaterial({ vertexColors: true }),
    waterMaterial: { uniforms: { uSky: { value: null }, uHasSky: { value: false } } },
  }
  return { context, model, hdr, bitmap, loadedTextures, resources, geometry, material, paint, dispose() { disposed = true; for (const resource of resources) resource.dispose(); resources.clear() } }
}

describe('Skybound progressive free assets', () => {
  it('returns immediately and upgrades the scene without hiding the fallback early', async () => {
    const { context, model, hdr, resources, loadedTextures } = setup()
    const status = loadFlightAssets(context)
    expect(status).toEqual({ aircraft: 'loading', lighting: 'loading', terrain: 'loading' })
    expect(context.fallback.visible).toBe(true)
    await vi.waitFor(() => expect(Object.values(status)).toEqual(['ready', 'ready', 'ready']))
    expect(context.fallback.visible).toBe(false)
    expect(context.aircraft.children).toContain(model)
    expect(model.rotation.y).toBe(-Math.PI / 2)
    expect(context.scene.environment).toBe(hdr)
    expect(context.waterMaterial.uniforms.uSky.value).toBe(hdr)
    expect(context.clouds.visible).toBe(false)
    expect(context.invalidate).toHaveBeenCalledTimes(3)
    expect(loadedTextures).toHaveLength(6)
    expect(loadedTextures.every((map) => resources.has(map) && map.anisotropy === 4)).toBe(true)
    expect(context.terrainMaterial.map.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(context.terrainMaterial.normalMap.colorSpace).toBe(THREE.NoColorSpace)
    expect(context.renderer.initTexture).toHaveBeenCalledTimes(8)
  })

  it('blends both tangent-space normal maps, color and roughness', async () => {
    const { context } = setup()
    const status = loadFlightAssets(context)
    await vi.waitFor(() => expect(status.terrain).toBe('ready'))
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader }
    context.terrainMaterial.onBeforeCompile(shader)
    expect(shader.fragmentShader).toContain('vec3 mapN = mix(texture2D(normalMap')
    expect(shader.fragmentShader).toContain('float roughnessFactor = roughness * mix(')
    expect(shader.fragmentShader).toContain('smoothstep(5.0, 24.0, vSbHeight)')
    expect(Object.keys(shader.uniforms)).toEqual(['sbGrass', 'sbGrassNormal', 'sbGrassRough'])
    expect(context.terrainMaterial.vertexColors).toBe(false)
  })

  it('keeps upgrades independent when the model or a terrain map fails', async () => {
    const { context } = setup()
    GLTFLoader.prototype.loadAsync.mockRejectedValue(new Error('Offline'))
    THREE.TextureLoader.prototype.loadAsync.mockRejectedValueOnce(new Error('Missing map'))
    const status = loadFlightAssets(context)
    await vi.waitFor(() => expect(status).toEqual({ aircraft: 'fallback', lighting: 'ready', terrain: 'fallback' }))
    expect(context.fallback.visible).toBe(true)
    expect(context.terrainMaterial.map).toBeNull()
    expect(context.terrainMaterial.vertexColors).toBe(true)
  })

  it('disposes late downloads, including decoded model bitmaps, after unmount', async () => {
    const fixture = setup()
    const disposals = [fixture.geometry, fixture.material, fixture.paint, fixture.hdr].map((resource) => vi.spyOn(resource, 'dispose'))
    const status = loadFlightAssets(fixture.context)
    fixture.dispose()
    await vi.waitFor(() => expect(fixture.loadedTextures).toHaveLength(6))
    expect(disposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true)
    expect(fixture.bitmap.close).toHaveBeenCalledTimes(1)
    expect(fixture.context.invalidate).not.toHaveBeenCalled()
    expect(fixture.context.aircraft.children).toHaveLength(0)
    expect(fixture.context.scene.environment).toBeNull()
    expect(fixture.context.terrainMaterial.map).toBeNull()
    expect(Object.values(status)).toEqual(['loading', 'loading', 'loading'])
    expect(fixture.resources.size).toBe(0)
  })

  it('owns shared model textures once and releases them on normal teardown', async () => {
    const fixture = setup()
    const dispose = vi.spyOn(fixture.paint, 'dispose')
    const status = loadFlightAssets(fixture.context)
    await vi.waitFor(() => expect(status.aircraft).toBe('ready'))
    fixture.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(fixture.bitmap.close).toHaveBeenCalledTimes(1)
  })

  it('uploads one texture per animation frame and cancels queued work on teardown', async () => {
    let callback
    const cancel = vi.fn()
    vi.stubGlobal('requestAnimationFrame', (next) => { callback = next; return 1 })
    vi.stubGlobal('cancelAnimationFrame', cancel)
    const fixture = setup()
    loadFlightAssets(fixture.context)
    await vi.waitFor(() => expect(callback).toBeTypeOf('function'))
    expect(fixture.context.renderer.initTexture).not.toHaveBeenCalled()
    callback()
    expect(fixture.context.renderer.initTexture).toHaveBeenCalledTimes(1)
    fixture.dispose()
    expect(cancel).toHaveBeenCalledWith(1)
    await Promise.resolve()
    expect(fixture.context.renderer.initTexture).toHaveBeenCalledTimes(1)
  })

  it('ships complete licensed binaries locally within a 7 MB download budget', () => {
    const read = (name) => readFileSync(new URL(`../../../public/skybound/${name}`, import.meta.url))
    const glb = read('c172.glb'), hdr = read('sky.hdr')
    expect(glb.subarray(0, 4).toString()).toBe('glTF')
    expect(glb.readUInt32LE(8)).toBe(glb.length)
    const metadata = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12))).asset.extras
    expect(metadata.license).toContain('CC-BY-4.0')
    expect(metadata.source).toContain('64cddaee5aff470682659a8c08525046')
    expect(hdr.subarray(0, 11).toString()).toBe('#?RADIANCE\n')
    let bytes = glb.length + hdr.length
    for (const terrain of ['sand', 'grass']) for (const map of ['color', 'normal', 'rough']) {
      const jpg = read(`${terrain}-${map}.jpg`)
      expect(jpg.readUInt16BE(0)).toBe(0xffd8)
      expect(jpg.readUInt16BE(jpg.length - 2)).toBe(0xffd9)
      bytes += jpg.length
    }
    expect(bytes).toBeLessThan(7_000_000)
    const credits = read('ATTRIBUTION.md').toString()
    expect(credits).toContain('e737')
    expect(credits).toContain('CC BY 4.0')
    expect(credits).toContain('CC0 1.0')
  })
})
