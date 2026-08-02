// Evan System 메시 계층 생성 (Phase 1: 표준 머티리얼 — GLSL 표면 셰이더는
// Phase 2 Blueprint 머티리얼과 함께 온다). WebGL 없이 node에서 생성
// 가능하도록 렌더러 참조를 받지 않는다.
import * as THREE from 'three'
import { PLANETS, SUN_RADIUS, planetPosition } from './system.js'

// 태양 글로우: 별 텍스처와 같은 캔버스 라디얼 그라디언트 방식.
// (문서/테스트 환경에는 document가 있고, node vitest는 jsdom 환경.)
function createGlowTexture() {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255, 214, 140, 0.9)')
  g.addColorStop(0.3, 'rgba(255, 180, 90, 0.35)')
  g.addColorStop(1, 'rgba(255, 160, 60, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function circlePoints(radius, segments = 128) {
  const pts = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius))
  }
  return pts
}

export function createEvanSystem({ satelliteColors = [] } = {}) {
  const group = new THREE.Group()
  group.name = 'evan-system'
  const disposables = []

  // --- 조명: 태양이 유일한 주광, 앰비언트는 행성 야간면이 완전히
  // 죽지 않을 만큼만.
  const sunLight = new THREE.PointLight(0xffe2b0, 22000, 0, 1.8)
  group.add(sunLight)
  const ambient = new THREE.AmbientLight(0x1a2438, 1.2)
  group.add(ambient)

  // --- 태양
  const sunGeo = new THREE.SphereGeometry(SUN_RADIUS, 48, 48)
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
  const sun = new THREE.Mesh(sunGeo, sunMat)
  sun.name = 'sun'
  group.add(sun)
  disposables.push(sunGeo, sunMat)

  const glowTex = createGlowTexture()
  let glow
  if (glowTex) {
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    glow = new THREE.Sprite(glowMat)
    glow.scale.setScalar(SUN_RADIUS * 6)
    glow.name = 'sun-glow'
    group.add(glow)
    disposables.push(glowTex, glowMat)
  }

  // --- 궤도 라인: 어두운 청회색 — "검은 우주" 톤을 해치지 않는 밀도.
  const orbitMat = new THREE.LineBasicMaterial({
    color: 0x35507a,
    transparent: true,
    opacity: 0.35,
  })
  disposables.push(orbitMat)
  for (const p of PLANETS) {
    const geo = new THREE.BufferGeometry().setFromPoints(circlePoints(p.orbitRadius))
    const line = new THREE.Line(geo, orbitMat)
    line.name = `orbit-${p.id}`
    group.add(line)
    disposables.push(geo)
  }

  // --- 행성
  const planetMeshes = []
  for (const p of PLANETS) {
    const geo = new THREE.SphereGeometry(p.radius, 40, 40)
    const mat = new THREE.MeshStandardMaterial({
      color: p.color,
      roughness: 0.65,
      metalness: 0.1,
      emissive: p.color,
      emissiveIntensity: 0.06,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = `planet-${p.id}`
    mesh.position.set(...planetPosition(p))
    group.add(mesh)
    planetMeshes.push(mesh)
    disposables.push(geo, mat)

    if (p.ring) {
      const ringGeo = new THREE.RingGeometry(p.radius * 1.5, p.radius * 2.1, 64)
      const ringMat = new THREE.MeshBasicMaterial({
        color: p.color,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = -Math.PI / 2 + 0.25
      ring.name = `ring-${p.id}`
      mesh.add(ring)
      disposables.push(ringGeo, ringMat)
    }
  }

  // --- 프로젝트 위성: projects 행성 주위를 피벗 그룹째 공전.
  const projectsPlanet = group.getObjectByName('planet-projects')
  const pivot = new THREE.Group()
  pivot.name = 'satellites-pivot'
  projectsPlanet.add(pivot)
  satelliteColors.forEach((hex, i) => {
    const geo = new THREE.SphereGeometry(3.5, 20, 20)
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      emissive: new THREE.Color(hex),
      emissiveIntensity: 0.4,
      roughness: 0.5,
    })
    const sat = new THREE.Mesh(geo, mat)
    const a = (i / satelliteColors.length) * Math.PI * 2
    const r = 17 * 1.9
    sat.position.set(Math.cos(a) * r, Math.sin(a * 2) * 4, Math.sin(a) * r)
    pivot.add(sat)
    disposables.push(geo, mat)
  })

  return {
    group,
    update(t) {
      for (const m of planetMeshes) m.rotation.y = t * 0.08
      pivot.rotation.y = t * 0.35
      // 태양 글로우 미세 맥동 — 정지화면처럼 보이지 않게.
      if (glow) glow.scale.setScalar(SUN_RADIUS * (6 + Math.sin(t * 0.8) * 0.25))
    },
    dispose() {
      group.clear()
      for (const d of disposables) d.dispose()
    },
  }
}
