// Evan System 메시 계층 생성 (Phase 1: 표준 머티리얼 — GLSL 표면 셰이더는
// Phase 2 Blueprint 머티리얼과 함께 온다). WebGL 없이 node에서 생성
// 가능하도록 렌더러 참조를 받지 않는다.
import * as THREE from 'three'
import { PLANETS, SUN_RADIUS, planetPosition } from './system.js'
import { toBarycentricGeometry } from './barycentric.js'
import { createBlueprintMaterial } from './blueprintMaterial.js'
import { ORBIT_VERT, ORBIT_FRAG } from './introVisuals.glsl.js'
import { staggeredBuild } from './introSequence.js'
import { createPlanetMaterial } from './planetMaterial.js'
import { SUN_VERT, SUN_FRAG } from './sunSurface.glsl.js'
import { NEBULA_VERT, NEBULA_FRAG } from './nebula.glsl.js'

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
  // 행성은 이제 자체 셰이더로 직접 광원 방향을 계산해 three의 조명을 쓰지
  // 않지만, 위성은 여전히 MeshStandardMaterial이라 이 조명이 없으면
  // 새까매진다 — 지우지 말 것.
  const sunLight = new THREE.PointLight(0xffe2b0, 22000, 0, 1.8)
  group.add(sunLight)
  const ambient = new THREE.AmbientLight(0x1a2438, 1.2)
  group.add(ambient)

  // --- 태양
  const sunGeo = new THREE.SphereGeometry(SUN_RADIUS, 48, 48)
  // 항성 표면은 전용 셰이더가 맡는다. 글로우 스프라이트는 그대로 둬서
  // 먼 거리의 헤일로 역할을 계속 시킨다.
  const sunMat = new THREE.ShaderMaterial({
    vertexShader: SUN_VERT,
    fragmentShader: SUN_FRAG,
    uniforms: {
      uCoreColor: { value: new THREE.Color(0xfff1c9) },
      uEdgeColor: { value: new THREE.Color(0xff9d4a) },
      uTime: { value: 0 },
    },
  })
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

  // --- 성운: 항성계 전체를 감싸는 큰 구의 안쪽. 가장 바깥 궤도(425)보다
  // 훨씬 멀리 둬야 카메라가 레일 끝까지 가도 안쪽에 머문다.
  // 원점 고정이면 카메라가 레일을 타고 멀어질수록 구의 먼 쪽 면이
  // (반지름 + |카메라 위치|)까지 밀려나 카메라의 far=2000 평면을 넘는다
  // (footer 레일 station에서 |cam|=635 → 2235로 완전히 클립되어 하늘에 구멍이
  // 뚫린다). NEBULA_VERT도 "방향만으로 정해지는 하늘"을 전제하므로, 매
  // 프레임 update()에서 카메라 위치로 복사해 항상 카메라를 원점으로 감싼다.
  const nebulaGeo = new THREE.SphereGeometry(1600, 32, 24)
  const nebulaMat = new THREE.ShaderMaterial({
    vertexShader: NEBULA_VERT,
    fragmentShader: NEBULA_FRAG,
    uniforms: {
      uColorA: { value: new THREE.Color(0x1b2b52) },
      uColorB: { value: new THREE.Color(0x3a1f4d) },
      // 얕게 — 검은 우주가 주인공이라는 제약. 이 값을 올리면 별이 묻힌다.
      uIntensity: { value: 0.32 },
      uTime: { value: 0 },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    // 카메라에 고정되므로 성운은 항상 씬에서 가장 먼 지오메트리다 — depth
    // 비교를 켜야(depthTest: true) 행성·태양 뒤로 정확히 물러난다. 이전의
    // false는 depthWrite:false와 겹쳐 투명 큐 정렬(그려지는 순서)에만
    // 의존했는데, 성운이 투명 큐의 다른 무엇보다도 나중에(태양 글로우
    // 스프라이트 등) 그려지면 이미 그려진 것 위에 알파 베일을 덮어씌우는
    // 문제가 있었다(우연히 uIntensity=0.32라 육안으로는 안 보였을 뿐).
    depthTest: true,
  })
  const nebula = new THREE.Mesh(nebulaGeo, nebulaMat)
  nebula.name = 'nebula'
  nebula.renderOrder = -10
  group.add(nebula)
  disposables.push(nebulaGeo, nebulaMat)

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
      // Phase 1의 LineBasicMaterial은 depthWrite 기본값(true)이었다 — 궤도
      // 선이 그 뒤의 별·태양 글로우 스프라이트를 가려야 "오늘과 픽셀 동일"
      // 계약이 성립한다. 인트로 중 미그려진 프래그먼트는 discard되므로 depth를
      // 쓰지 않아 리빌 애니메이션에는 영향이 없다.
      depthWrite: true,
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
  const planetFades = [] // 행성은 셰이더 유니폼(uOpacity)으로 페이드하므로 solidMaterials와 별도 관리
  const blueprints = []
  PLANETS.forEach((p, i) => {
    const geo = new THREE.SphereGeometry(p.radius, 40, 40)
    // 행성마다 시드를 달리해 지형이 서로 겹치지 않게 한다.
    const planet = createPlanetMaterial({
      color: p.color,
      // 림은 본색보다 밝고 푸르게 — 대기 산란처럼 읽힌다.
      rimColor: new THREE.Color(p.color).lerp(new THREE.Color(0xbfe0ff), 0.55).getHex(),
      seed: i * 17.3 + 3.1,
    })
    const mat = planet.material
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = `planet-${p.id}`
    mesh.position.set(...planetPosition(p))
    group.add(mesh)
    planetMeshes.push(mesh)
    disposables.push(geo, mat)
    planetFades.push(planet)

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
  })

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
    // t: 항상 흐르는 시계 — 행성 자전·위성 공전·태양 글로우 맥동 등 Phase
    // 1/2의 메시 모션을 그대로 구동한다 (reduced-motion에서도 "형태는 그대로
    // 보여야" 하므로 위치/자세 자체는 멈추지 않는다).
    // shaderTime: uTime 유니폼(항성 난류, 성운 흐름, 행성 표면 셰이더)
    // 전용. 기본값을 t로 둬 update(t) 한 인자 호출도 그대로 지원한다 —
    // reduced-motion일 때 호출부(SpaceBackground.jsx)가 0을 넘겨 셰이더
    // 시간만 얼린다.
    // cameraPosition: 성운을 카메라에 고정하기 위한 참조. 매 프레임 새
    // Vector3를 만들지 않고 카메라가 이미 갖고 있는 Vector3를 그대로 복사한다.
    update(t, shaderTime = t, cameraPosition) {
      for (const m of planetMeshes) m.rotation.y = t * 0.08
      pivot.rotation.y = t * 0.35
      // 태양 글로우 미세 맥동 — 정지화면처럼 보이지 않게.
      if (glow) glow.scale.setScalar(SUN_RADIUS * (6 + Math.sin(t * 0.8) * 0.25))
      for (const pf of planetFades) pf.setTime(shaderTime)
      sunMat.uniforms.uTime.value = shaderTime
      nebulaMat.uniforms.uTime.value = shaderTime
      if (cameraPosition) nebula.position.copy(cameraPosition)
    },
    setBuild(progress) {
      const g = Math.min(Math.max(progress, 0), 1)
      blueprints.forEach((bp, i) => bp.setBuild(staggeredBuild(g, i, blueprints.length)))
      // 실체 표면은 청사진이 물러나는 구간(0.55~1)에서 올라온다.
      // g===1을 별도로 처리하는 이유: (1 - 0.55) / 0.45는 부동소수점 오차로
      // 0.9999999999999999가 되어 "build=1이면 완전히 불투명"이라는 계약이
      // 깨진다.
      const solid = g >= 1 ? 1 : Math.max((g - 0.55) / 0.45, 0)
      for (const pf of planetFades) pf.setOpacity(solid)
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
    // 시간대 라이팅: 방문 시각으로 계산한 등급을 씬 전체에 한 번에 꽂는다.
    // 마운트 시 1회 호출을 전제로 하므로 프레임 예산을 신경 쓰지 않는다.
    // 부르지 않으면 Phase 3 기본값 그대로 동작한다.
    setGrade(grade) {
      sunMat.uniforms.uCoreColor.value.setHex(grade.sunCore)
      sunMat.uniforms.uEdgeColor.value.setHex(grade.sunEdge)
      // 글로우 스프라이트: SpriteMaterial.color가 베이크된 캔버스 텍스처와
      // 곱해지므로 텍스처를 다시 굽지 않고 색만 바꿔도 디스크와 함께
      // 식는다. sunEdge를 그대로 곱하면(기본값이 흰색이라 지금까지는
      // 텍스처 그대로 보였다) 채도 높은 주황이 흰색보다 어두워 헤일로
      // 전체 밝기가 크게 죽는다 — 림 처리와 같은 방식으로, 흰색에서
      // sunEdge 쪽으로 0.5만 섞어 색조만 옮기고 한낮(Phase 3) 밝기에
      // 가깝게 유지한다. glow는 document 없는 노드(vitest) 환경에서는
      // 아예 생성되지 않으므로 없으면 건너뛴다.
      if (glow) {
        glow.material.color.set(0xffffff).lerp(new THREE.Color(grade.sunEdge), 0.5)
      }
      sunLight.color.setHex(grade.sunLight)
      ambient.color.setHex(grade.ambient)
      // 림은 등급 색으로 덮어쓰지 않는다 — 행성 고유색에서 출발해 등급 색
      // 쪽으로 0.55만큼 섞는다(생성 시 0xbfe0ff를 섞던 그 자리). 덮어쓰면
      // 네 행성의 림이 같아져 행성별 정체성이 사라진다.
      const rim = new THREE.Color(grade.rim)
      planetFades.forEach((pf, i) => {
        pf.material.uniforms.uRimColor.value.setHex(PLANETS[i].color).lerp(rim, 0.55)
      })
      nebulaMat.uniforms.uColorA.value.setHex(grade.nebulaA)
      nebulaMat.uniforms.uColorB.value.setHex(grade.nebulaB)
      nebulaMat.uniforms.uIntensity.value = grade.nebulaIntensity
    },
    dispose() {
      group.clear()
      for (const d of disposables) d.dispose()
    },
  }
}
