import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { projectToScreen, occludedBySphere } from './screenProject.js'

// 원점을 바라보며 z=+10에 선 카메라의 뷰프로젝션 행렬.
function viewProjectionAt(z = 10) {
  const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 2000)
  cam.position.set(0, 0, z)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  return new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
}

describe('projectToScreen', () => {
  it('카메라가 보는 원점은 화면 정중앙이다', () => {
    const r = projectToScreen(new THREE.Vector3(0, 0, 0), viewProjectionAt(), 800, 600)
    expect(r.x).toBeCloseTo(400, 6)
    expect(r.y).toBeCloseTo(300, 6)
    expect(r.visible).toBe(true)
  })

  it('오른쪽에 있는 점은 화면 중앙보다 오른쪽에 온다', () => {
    const r = projectToScreen(new THREE.Vector3(2, 0, 0), viewProjectionAt(), 800, 600)
    expect(r.x).toBeGreaterThan(400)
    expect(r.y).toBeCloseTo(300, 6)
  })

  it('위에 있는 점은 화면 중앙보다 위에 온다 — y축이 뒤집혀야 한다', () => {
    // NDC는 위가 +1이지만 CSS 픽셀은 아래가 +y다. 뒤집지 않으면 위성 버튼이
    // 상하 반대로 붙는다.
    const r = projectToScreen(new THREE.Vector3(0, 2, 0), viewProjectionAt(), 800, 600)
    expect(r.y).toBeLessThan(300)
  })

  it('카메라 뒤의 점은 visible=false다', () => {
    // z=+50은 z=+10에 선 카메라의 등 뒤다. 뒤를 걸러내지 않으면 원근 나눗셈이
    // 부호를 뒤집어 화면 반대편에 유령 버튼이 생긴다.
    const r = projectToScreen(new THREE.Vector3(0, 0, 50), viewProjectionAt(), 800, 600)
    expect(r.visible).toBe(false)
  })

  it('뷰포트 밖으로 나간 점은 visible=false다', () => {
    const r = projectToScreen(new THREE.Vector3(60, 0, 0), viewProjectionAt(), 800, 600)
    expect(r.visible).toBe(false)
  })

  it('종횡비가 다른 뷰포트에서도 중앙은 중앙이다', () => {
    const r = projectToScreen(new THREE.Vector3(0, 0, 0), viewProjectionAt(), 1920, 1080)
    expect(r.x).toBeCloseTo(960, 6)
    expect(r.y).toBeCloseTo(540, 6)
  })

  it('입력 벡터를 훼손하지 않는다 — 씬의 실제 위성 좌표를 그대로 넘기게 된다', () => {
    const v = new THREE.Vector3(1, 2, 3)
    projectToScreen(v, viewProjectionAt(), 800, 600)
    expect([v.x, v.y, v.z]).toEqual([1, 2, 3])
  })
})

describe('occludedBySphere', () => {
  const cam = { x: 0, y: 0, z: 0 }

  it('구 바로 뒤(공전상 반대편)에 있으면 가려진다', () => {
    // 카메라-구중심-위성이 일직선이고, 구가 그 사이를 정확히 관통한다.
    const point = { x: 0, y: 0, z: -20 }
    const sphereCenter = { x: 0, y: 0, z: -10 }
    expect(occludedBySphere(cam, point, sphereCenter, 5)).toBe(true)
  })

  it('구보다 카메라에 더 가까이(정면에) 있으면 가려지지 않는다', () => {
    const point = { x: 0, y: 0, z: -5 }
    const sphereCenter = { x: 0, y: 0, z: -10 }
    expect(occludedBySphere(cam, point, sphereCenter, 3)).toBe(false)
  })

  it('구가 시선에서 옆으로 비켜나 있으면 가려지지 않는다', () => {
    const point = { x: 0, y: 0, z: -20 }
    const sphereCenter = { x: 10, y: 0, z: -10 }
    expect(occludedBySphere(cam, point, sphereCenter, 3)).toBe(false)
  })

  it('구가 카메라 등 뒤에 있으면 가려지지 않는다 (tca<=0 가드)', () => {
    const point = { x: 0, y: 0, z: -20 }
    const sphereCenter = { x: 0, y: 0, z: 10 }
    expect(occludedBySphere(cam, point, sphereCenter, 5)).toBe(false)
  })

  it('구가 위성보다 더 멀리 있으면 가려지지 않는다 (tca>=len 가드)', () => {
    const point = { x: 1, y: 0, z: -5 }
    const sphereCenter = { x: 2, y: 0, z: -10 }
    expect(occludedBySphere(cam, point, sphereCenter, 1)).toBe(false)
  })
})
