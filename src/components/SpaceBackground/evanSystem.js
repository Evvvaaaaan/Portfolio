// Evan System 메시 계층 생성 (Phase 1: 표준 머티리얼 — GLSL 표면 셰이더는
// Phase 2 Blueprint 머티리얼과 함께 온다). WebGL 없이 node에서 생성
// 가능하도록 렌더러 참조를 받지 않는다.
import * as THREE from 'three'
import { PLANETS, SUN_RADIUS, planetPosition } from './system.js'
import { toBarycentricGeometry } from './barycentric.js'
import { createBlueprintMaterial } from './blueprintMaterial.js'
import { ORBIT_VERT, ORBIT_FRAG } from './introVisuals.glsl.js'
import { staggeredBuild } from './introSequence.js'

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

// 궤도 링의 정점과, 각 정점이 한 바퀴 중 어디쯤인지(0~1)를 함께 만든다.
// 리빌 셰이더가 이 aArc로 "어디까지 그려졌는지"를 판정한다.
function circleGeometry(radius, segments = 128) {
  const pts = []
  const arc = new Float32Array(segments + 1)
  for (let i = 0; i <= segments; i++) {
    const k = i / segments
    const a = k * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius))
    arc[i] = k
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  geo.setAttribute('aArc', new THREE.BufferAttribute(arc, 1))
  return geo
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
  // 인트로 리빌을 위해 궤도마다 유니폼을 갖는다 (공유 머티리얼이면 uDraw를
  // 궤도별로 줄 수 없다). 색·불투명도는 Phase 1 값을 그대로 유지한다.
  const orbitMaterials = []
  for (const p of PLANETS) {
    const geo = circleGeometry(p.orbitRadius)
    const mat = new THREE.ShaderMaterial({
      vertexShader: ORBIT_VERT,
      fragmentShader: ORBIT_FRAG,
      uniforms: {
        uDraw: { value: 1 },
        uLineColor: { value: new THREE.Color(0x35507a) },
        uBaseOpacity: { value: 0.35 },
      },
      transparent: true,
      depthWrite: false,
    })
    const line = new THREE.Line(geo, mat)
    line.name = `orbit-${p.id}`
    group.add(line)
    orbitMaterials.push(mat)
    disposables.push(geo, mat)
  }

  // --- 행성
  const planetMeshes = []
  const solidMaterials = []
  const blueprints = []
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
    solidMaterials.push({ mat, baseOpacity: mat.opacity })

    // 청사진 쌍둥이: 같은 지오메트리를 바리센트릭으로 펼쳐 겹쳐 그린다.
    const bpGeo = toBarycentricGeometry(geo)
    const bp = createBlueprintMaterial({ color: p.color, extent: p.radius })
    const bpMesh = new THREE.Mesh(bpGeo, bp.material)
    bpMesh.name = `blueprint-${p.id}`
    bpMesh.position.copy(mesh.position)
    group.add(bpMesh)
    blueprints.push(bp)
    disposables.push(bpGeo, bp.material)

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
      // 링은 작아서 청사진 쌍둥이 없이 실체 페이드만 태운다. Phase 1의 링은
      // 원래도 반투명(0.3)이므로 baseOpacity를 보존해 build=1에서도 그
      // 반투명함을 그대로 유지한다 — 여기서 opacity를 1로 밀어버리면
      // "오늘과 픽셀 동일" 계약이 링에서 깨진다.
      solidMaterials.push({ mat: ringMat, baseOpacity: ringMat.opacity })
    }
  }

  // --- 프로젝트 위성: projects 행성 주위를 피벗 그룹째 공전.
  const projectsPlanetData = PLANETS.find((p) => p.id === 'projects')
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
    // projects 행성 반지름의 1.9배 — PLANETS에서 파생시켜 값 편집 시 desync 방지.
    const r = projectsPlanetData.radius * 1.9
    sat.position.set(Math.cos(a) * r, Math.sin(a * 2) * 4, Math.sin(a) * r)
    pivot.add(sat)
    disposables.push(geo, mat)
    // 위성도 링과 마찬가지로 작아서 청사진 쌍둥이 없이 실체 페이드만 태운다.
    solidMaterials.push({ mat, baseOpacity: mat.opacity })
  })

  return {
    group,
    update(t) {
      for (const m of planetMeshes) m.rotation.y = t * 0.08
      pivot.rotation.y = t * 0.35
      // 태양 글로우 미세 맥동 — 정지화면처럼 보이지 않게.
      if (glow) glow.scale.setScalar(SUN_RADIUS * (6 + Math.sin(t * 0.8) * 0.25))
    },
    setBuild(progress) {
      const g = Math.min(Math.max(progress, 0), 1)
      blueprints.forEach((bp, i) => bp.setBuild(staggeredBuild(g, i, blueprints.length)))
      // 실체 표면은 청사진이 물러나는 구간(0.55~1)에서 올라온다.
      // g===1을 별도로 처리하는 이유: (1 - 0.55) / 0.45는 부동소수점 오차로
      // 0.9999999999999999가 되어 "build=1이면 완전히 불투명"이라는 계약이
      // 깨진다.
      const solid = g >= 1 ? 1 : Math.max((g - 0.55) / 0.45, 0)
      for (const { mat, baseOpacity } of solidMaterials) {
        mat.opacity = baseOpacity * solid
        // 완전히 실체화되면 불투명 큐로 되돌린다 — 단, 링처럼 Phase 1에서도
        // 원래 반투명(baseOpacity < 1)이던 머티리얼은 build=1에서도 계속
        // 투명 큐에 남아야 "오늘과 픽셀 동일" 계약이 지켜진다.
        const wantTransparent = solid < 1 || baseOpacity < 1
        // transparent 변경은 셰이더 재컴파일을 유발할 수 있다 — 값이 실제로
        // 바뀔 때만 needsUpdate를 세워 매 프레임 무의미한 재컴파일을 막는다.
        if (mat.transparent !== wantTransparent) {
          mat.transparent = wantTransparent
          mat.needsUpdate = true
        }
      }
    },
    setOrbitDraw(progress) {
      const d = Math.min(Math.max(progress, 0), 1)
      for (const m of orbitMaterials) m.uniforms.uDraw.value = d
    },
    dispose() {
      group.clear()
      for (const d of disposables) d.dispose()
    },
  }
}
