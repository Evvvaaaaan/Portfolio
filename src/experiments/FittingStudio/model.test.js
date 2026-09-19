import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createMannequin, disposeObject, normalizeModel, OUTFITS } from './model.js'
import { validateGlb, validateImageFile } from './files.js'

describe('fitting viewer', () => {
  it('builds three actual, finite 3D garments without any uploaded photo', () => {
    for (const outfit of OUTFITS) {
      const model = createMannequin(outfit.id)
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
      expect(model.userData.demo).toBe(true)
      expect(size.y).toBeGreaterThan(1.8)
      expect(size.x).toBeLessThan(1)
      model.traverse((mesh) => {
        if (mesh.isMesh) expect([...mesh.geometry.attributes.position.array].every(Number.isFinite)).toBe(true)
      })
      disposeObject(model)
    }
  })

  it('normalizes imported models to the display podium without claiming measured size', () => {
    const model = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 3), new THREE.MeshStandardMaterial())
    model.position.set(20, 7, -9)
    const result = normalizeModel(model)
    const bounds = new THREE.Box3().setFromObject(result)
    expect(bounds.min.y).toBeCloseTo(0)
    expect(bounds.max.y).toBeCloseTo(1.8)
    expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(0)
    disposeObject(result)
  })

  it('keeps the trousers inside the coat around the hips', () => {
    const model = createMannequin('coat')
    model.updateMatrixWorld(true)
    for (const angle of [-Math.PI / 2, -Math.PI / 3, -Math.PI / 6, Math.PI / 6, Math.PI / 3, Math.PI / 2]) {
      const origin = new THREE.Vector3(Math.sin(angle) * 2, 0.95, Math.cos(angle) * 2)
      const direction = new THREE.Vector3(0, 0.95, 0).sub(origin).normalize()
      const hit = new THREE.Raycaster(origin, direction).intersectObject(model, true)[0]
      expect(hit.object.material.color.getHexString()).not.toBe('343738')
    }
    disposeObject(model)
  })

  it('rejects empty models, misleading file types and oversized inputs', () => {
    expect(() => normalizeModel(new THREE.Group())).toThrow('INVALID_MODEL')
    expect(() => validateImageFile({ type: 'image/svg+xml', size: 100 })).toThrow('IMAGE_TYPE')
    expect(() => validateImageFile({ type: 'image/jpeg', size: 10 * 1024 * 1024 })).toThrow('IMAGE_SIZE')
    expect(() => validateImageFile({ type: 'image/png', size: 200 })).not.toThrow()
    expect(() => validateGlb(new ArrayBuffer(5))).toThrow('MODEL_SIZE')
    expect(() => validateGlb(new ArrayBuffer(100))).toThrow('INVALID_MODEL')
  })

  it('rejects external GLB resources before a loader can request them', () => {
    const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, images: [{ uri: 'https://tracker.example/person.png' }] }))
    const buffer = new ArrayBuffer(20 + json.length)
    const view = new DataView(buffer)
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true)
    view.setUint32(12, json.length, true); view.setUint32(16, 0x4e4f534a, true)
    new Uint8Array(buffer, 20).set(json)
    expect(() => validateGlb(buffer)).toThrow('EXTERNAL_MODEL_RESOURCE')
  })
})
