import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import '../shared/exp.css'

// 병 속의 범선 — 에셋 파일 없이 전부 런타임에 코드로 짓는다.
//
// 이 씬의 뼈대는 병 프로파일 함수 하나다. 유리(회전체), 수면의 폭, 바닥 모래가
// 모두 같은 bottleRadius(s)를 읽기 때문에 물이 유리를 뚫고 나가거나 모래가
// 공중에 뜨는 일이 생기지 않는다. 배는 치수(길이·폭·흘수·현호)에서 늑골 단면을
// 만들고 그 단면들을 이어 붙여(lofting) 선체를 얻는다 — 모델 파일이 아니라
// 도면에서 나오는 방식이다.

const BODY_R = 1.0          // 몸통 반지름
const AXIS_MIN = -2.15      // 병 바닥
const AXIS_MAX = 2.15       // 병 입구
const WATER_Y = -0.22       // 수면 높이 (병 축에서의 거리)
const WAVE_BASE = 0.075     // 파고 기준값 — 슬라이더가 이 값을 배로 키운다

// 축 방향 좌표 s → 그 지점의 병 안쪽 반지름.
function bottleRadius(s) {
  if (s <= AXIS_MIN) return 0
  // 바닥 라운드
  if (s < AXIS_MIN + 0.18) {
    const k = (s - AXIS_MIN) / 0.18
    return BODY_R * Math.sqrt(Math.max(k, 0))
  }
  if (s < 0.55) return BODY_R                 // 몸통
  if (s < 1.35) {                             // 어깨 — 부드럽게 좁아진다
    const k = (s - 0.55) / 0.8
    const e = k * k * (3 - 2 * k)
    return BODY_R + (0.3 - BODY_R) * e
  }
  if (s < 1.95) return 0.3                    // 목
  return 0.34                                 // 입구 립
}

// 수면 y에서 축 위치 s의 물 반폭. 단면이 반지름 r인 원이므로 정확히 구할 수 있다.
function waterHalfWidth(s) {
  const r = bottleRadius(s)
  const d = r * r - WATER_Y * WATER_Y
  return d > 0 ? Math.sqrt(d) : 0
}

const mulberry32 = (seed) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 파도. GLSL(WATER_VERT)과 같은 식을 쓴다 — 배가 실제 수면을 타야 하므로
// CPU 쪽에서도 같은 높이를 샘플링할 수 있어야 한다. 한쪽만 고치면 배가
// 물에 잠기거나 공중에 뜬다.
function waveHeight(x, z, t, amp) {
  return amp * (
    Math.sin(x * 1.6 + t * 1.1) * 0.5 +
    Math.sin(z * 2.1 - t * 0.9) * 0.3 +
    Math.sin((x + z) * 2.7 + t * 1.7) * 0.2
  )
}

const WATER_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  varying float vHeight;
  varying vec3 vNrm;
  varying vec2 vUvW;

  float wave(vec2 p, float t) {
    return uAmp * (
      sin(p.x * 1.6 + t * 1.1) * 0.5 +
      sin(p.y * 2.1 - t * 0.9) * 0.3 +
      sin((p.x + p.y) * 2.7 + t * 1.7) * 0.2
    );
  }

  void main() {
    vec3 p = position;
    float h = wave(p.xz, uTime);
    p.y += h;
    // 법선은 유한차분으로 — 파형이 바뀌어도 따로 손볼 곳이 없다.
    float e = 0.06;
    float hx = wave(p.xz + vec2(e, 0.0), uTime);
    float hz = wave(p.xz + vec2(0.0, e), uTime);
    vNrm = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
    vHeight = h;
    vUvW = p.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const WATER_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSun;
  uniform float uAmp;
  varying float vHeight;
  varying vec3 vNrm;
  varying vec2 vUvW;

  void main() {
    vec3 n = normalize(vNrm);
    float crest = clamp(vHeight / max(uAmp, 0.0001) * 0.5 + 0.5, 0.0, 1.0);
    vec3 color = mix(uDeep, uShallow, crest);
    // 마루에만 얇게 흰 거품 — 전체에 뿌리면 바다가 우유가 된다.
    color = mix(color, uFoam, smoothstep(0.82, 1.0, crest) * 0.5);
    float ndl = max(dot(n, normalize(uSun)), 0.0);
    color *= 0.55 + 0.65 * ndl;
    // 스펙큘러 한 점 — 유리 안의 물이라는 느낌은 이 하이라이트가 만든다.
    float spec = pow(max(dot(reflect(-normalize(uSun), n), vec3(0.0, 0.35, 1.0)), 0.0), 24.0);
    color += vec3(1.0, 0.96, 0.88) * spec * 0.5;
    gl_FragColor = vec4(color, 0.94);
  }
`

const GLASS_VERT = /* glsl */ `
  varying vec3 vNrm;
  varying vec3 vView;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNrm = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const GLASS_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uTint;
  uniform vec3 uRim;
  uniform float uOpacity;
  varying vec3 vNrm;
  varying vec3 vView;

  void main() {
    vec3 n = normalize(vNrm);
    // 프레넬: 시선에 비스듬한 면일수록 밝아진다. 굴절 없이도 이 한 항이
    // "유리"라는 신호의 대부분을 만든다.
    float f = pow(1.0 - abs(dot(n, normalize(vView))), 2.6);
    vec3 color = uTint + uRim * f * 1.6;
    gl_FragColor = vec4(color, clamp(uOpacity + f * 0.5, 0.0, 1.0));
  }
`

// ── 병(회전체) + 코르크 ───────────────────────────────────────────────
function makeBottleGeometry() {
  const pts = []
  const STEPS = 96
  for (let i = 0; i <= STEPS; i++) {
    const s = AXIS_MIN + ((AXIS_MAX - AXIS_MIN) * i) / STEPS
    pts.push(new THREE.Vector2(Math.max(bottleRadius(s), 0.001), s))
  }
  const geo = new THREE.LatheGeometry(pts, 72)
  // 프로파일은 Y축 회전체로 만들고, 눕혀서 축을 X로 돌린다 (누워 있는 병).
  geo.rotateZ(-Math.PI / 2)
  return geo
}

// ── 선체: 치수 → 늑골 단면 → 로프팅 ─────────────────────────────────
function buildHull(dims) {
  const { length: L, beam: B, draft: D, sheer: S } = dims
  const RIBS = 34
  const HALF = 9 // 용골에서 현측까지의 분할 수

  const rib = (u) => {
    // 선수(u=1)로 갈수록 좁고, 선미(u=0)는 각진 트랜섬을 남긴다.
    const taper = Math.pow(Math.sin(Math.PI * (0.12 + u * 0.82)), 0.75)
    const beam = B * taper
    const draft = D * Math.pow(Math.sin(Math.PI * (0.1 + u * 0.85)), 0.55)
    // 현호(sheer): 뱃머리와 선미가 들리는 곡선 — 이게 없으면 상자처럼 보인다.
    let sheer = S * (0.78 + 0.22 * Math.pow(Math.abs(u * 2 - 1), 1.7))
    // 선미루와 선수루. 17세기 범선을 범선으로 읽히게 하는 건 이 두 층이다 —
    // 매끈한 현호만 있으면 아무리 늑골을 잘 깎아도 카누로 보인다.
    const castle = (edge, span, gain) => {
      const k = Math.max(0, 1 - Math.abs(u - edge) / span)
      return gain * k * k * (3 - 2 * k)
    }
    sheer += S * castle(0.03, 0.26, 0.5)
    sheer += S * castle(1.0, 0.14, 0.26)
    const x = -L / 2 + L * u
    const pts = []
    for (let j = -HALF; j <= HALF; j++) {
      const v = Math.abs(j) / HALF
      const z = Math.sign(j) * beam * Math.pow(Math.sin((v * Math.PI) / 2), 0.9)
      const y = -draft + (draft + sheer) * Math.pow(v, 1.35)
      pts.push(new THREE.Vector3(x, y, z))
    }
    return pts
  }

  const ribs = []
  for (let i = 0; i < RIBS; i++) ribs.push(rib(i / (RIBS - 1)))

  const pos = []
  const col = []
  const wood = new THREE.Color('#7a4f2c')
  const strake = new THREE.Color('#c8a06a') // 현측 가까이의 밝은 띠
  const push = (p, v) => {
    pos.push(p.x, p.y, p.z)
    const c = wood.clone().lerp(strake, Math.pow(v, 6) * 0.9)
    col.push(c.r, c.g, c.b)
  }

  for (let i = 0; i < RIBS - 1; i++) {
    const a = ribs[i]
    const b = ribs[i + 1]
    for (let j = 0; j < a.length - 1; j++) {
      const va = Math.abs(j - HALF) / HALF
      const vb = Math.abs(j + 1 - HALF) / HALF
      push(a[j], va); push(b[j], va); push(b[j + 1], vb)
      push(a[j], va); push(b[j + 1], vb); push(a[j + 1], vb)
    }
  }

  // 갑판: 양현 현측선을 이어 덮는다.
  const deck = new THREE.Color('#a67b48')
  const pushDeck = (p) => {
    pos.push(p.x, p.y, p.z)
    col.push(deck.r, deck.g, deck.b)
  }
  for (let i = 0; i < RIBS - 1; i++) {
    const a0 = ribs[i][0]
    const a1 = ribs[i][ribs[i].length - 1]
    const b0 = ribs[i + 1][0]
    const b1 = ribs[i + 1][ribs[i + 1].length - 1]
    pushDeck(a0); pushDeck(b0); pushDeck(b1)
    pushDeck(a0); pushDeck(b1); pushDeck(a1)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.computeVertexNormals()
  return geo
}

// ── 돛: 바람을 먹은 곡면. 정점을 CPU에서 갱신해 숨쉬듯 부풀린다 ────────
function makeSail(w, h) {
  const geo = new THREE.PlaneGeometry(w, h, 8, 6)
  geo.userData.base = Float32Array.from(geo.attributes.position.array)
  return geo
}

function billowSails(sails, t, wind) {
  for (const mesh of sails) {
    const geo = mesh.geometry
    const base = geo.userData.base
    const arr = geo.attributes.position.array
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i]
      const y = base[i + 1]
      const u = x / (geo.parameters.width * 0.5)
      const v = y / (geo.parameters.height * 0.5)
      const bulge = Math.cos((u * Math.PI) / 2) * Math.cos((v * Math.PI) / 2)
      arr[i + 2] = bulge * (0.06 + wind * 0.16) + Math.sin(t * 2.1 + v * 3.0) * 0.012 * bulge
    }
    geo.attributes.position.needsUpdate = true
    geo.computeVertexNormals()
  }
}

// ── 갈매기: 삼각형 두 장이 날갯짓한다 ────────────────────────────────
function makeGull(mat) {
  const g = new THREE.Group()
  const shape = new THREE.BufferGeometry()
  shape.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 0.16, 0.012, -0.05, 0.15, 0, 0.05,
  ], 3))
  shape.computeVertexNormals()
  const left = new THREE.Mesh(shape, mat)
  const right = new THREE.Mesh(shape, mat)
  right.scale.x = -1
  g.add(left, right)
  g.userData = { left, right }
  return g
}

// ── 산호: 재귀 분기 ──────────────────────────────────────────────────
function makeCoral(rng, mat, depth = 0) {
  const g = new THREE.Group()
  const h = 0.07 + rng() * 0.06
  const r = 0.012 * (1 - depth * 0.22)
  const seg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 6), mat)
  seg.position.y = h / 2
  g.add(seg)
  if (depth < 3) {
    const branches = 2 + (rng() < 0.35 ? 1 : 0)
    for (let i = 0; i < branches; i++) {
      const child = makeCoral(rng, mat, depth + 1)
      child.position.y = h
      child.rotation.z = (rng() - 0.5) * 1.1
      child.rotation.y = rng() * Math.PI * 2
      child.scale.setScalar(0.82)
      g.add(child)
    }
  }
  return g
}

export default function ShipInABottle() {
  const wrapRef = useRef(null)
  const apiRef = useRef(null)
  const [seed, setSeed] = useState(() => (Math.random() * 0xffff) | 0)
  const [wind, setWind] = useState(0.45)
  const [sailsUp, setSailsUp] = useState(true)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return undefined

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0b0f16')
    const camera = new THREE.PerspectiveCamera(42, wrap.clientWidth / wrap.clientHeight, 0.1, 100)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(wrap.clientWidth, wrap.clientHeight)
    wrap.appendChild(renderer.domElement)

    const disposables = []
    const track = (o) => { disposables.push(o); return o }

    scene.add(new THREE.AmbientLight(0x6f86a8, 0.75))
    const key = new THREE.DirectionalLight(0xfff0d6, 1.5)
    key.position.set(2.4, 3.2, 2.0)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x7fb6d8, 0.5)
    fill.position.set(-2.5, 1.0, -1.6)
    scene.add(fill)

    // 병 전체를 한 그룹에 담아 드래그로 통째로 돌린다.
    const bottle = new THREE.Group()
    scene.add(bottle)

    // ── 유리: 안쪽 면과 바깥 면을 따로 그려 두께감을 만든다.
    const glassGeo = track(makeBottleGeometry())
    const glassUniforms = {
      uTint: { value: new THREE.Color('#16323a') },
      uRim: { value: new THREE.Color('#8fe6dc') },
      uOpacity: { value: 0.1 },
    }
    const glassInner = track(new THREE.ShaderMaterial({
      vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG,
      uniforms: glassUniforms, transparent: true, side: THREE.BackSide, depthWrite: false,
    }))
    const glassOuter = track(new THREE.ShaderMaterial({
      vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG,
      uniforms: glassUniforms, transparent: true, side: THREE.FrontSide, depthWrite: false,
    }))
    const innerMesh = new THREE.Mesh(glassGeo, glassInner)
    innerMesh.renderOrder = 1
    const outerMesh = new THREE.Mesh(glassGeo, glassOuter)
    outerMesh.renderOrder = 3 // 내용물(2)보다 뒤에 그려야 유리를 통해 보인다
    bottle.add(innerMesh, outerMesh)

    // 코르크 + 밀랍
    const corkMat = track(new THREE.MeshStandardMaterial({ color: '#b98a52', roughness: 0.95 }))
    const cork = new THREE.Mesh(track(new THREE.CylinderGeometry(0.29, 0.27, 0.45, 20)), corkMat)
    cork.rotation.z = -Math.PI / 2
    cork.position.x = 2.05
    bottle.add(cork)
    const wax = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.3, 20, 12)),
      track(new THREE.MeshStandardMaterial({ color: '#8e2f2a', roughness: 0.6 })),
    )
    wax.scale.set(0.5, 1, 1)
    wax.position.x = 2.24
    bottle.add(wax)

    const contents = new THREE.Group() // 병 내용물 — 유리보다 먼저 그린다
    contents.renderOrder = 2
    bottle.add(contents)

    // ── 물: 격자의 폭이 병 안쪽 지름을 그대로 따라간다.
    const NX = 120
    const NZ = 26
    const waterPos = []
    const waterIdx = []
    const xs = []
    for (let i = 0; i < NX; i++) {
      const x = AXIS_MIN + 0.12 + ((1.78 - AXIS_MIN - 0.12) * i) / (NX - 1)
      xs.push(x)
      const hw = waterHalfWidth(x) * 0.94
      for (let j = 0; j < NZ; j++) {
        waterPos.push(x, WATER_Y, -hw + (2 * hw * j) / (NZ - 1))
      }
    }
    for (let i = 0; i < NX - 1; i++) {
      for (let j = 0; j < NZ - 1; j++) {
        const a = i * NZ + j
        waterIdx.push(a, a + NZ, a + NZ + 1, a, a + NZ + 1, a + 1)
      }
    }
    const waterGeo = track(new THREE.BufferGeometry())
    waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(waterPos, 3))
    waterGeo.setIndex(waterIdx)
    const waterUniforms = {
      uTime: { value: 0 },
      uAmp: { value: WAVE_BASE },
      uDeep: { value: new THREE.Color('#0e4f63') },
      uShallow: { value: new THREE.Color('#49b4b8') },
      uFoam: { value: new THREE.Color('#dff5f2') },
      uSun: { value: new THREE.Vector3(2.4, 3.2, 2.0) },
    }
    const waterMat = track(new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
      uniforms: waterUniforms, transparent: true, side: THREE.DoubleSide,
    }))
    contents.add(new THREE.Mesh(waterGeo, waterMat))

    // ── 모래 바닥: 병 안쪽 곡면에 그대로 붙는다.
    const sandPos = []
    const sandIdx = []
    for (let i = 0; i < NX; i++) {
      const x = xs[i]
      const r = bottleRadius(x) * 0.955
      for (let j = 0; j < NZ; j++) {
        const z = -r + (2 * r * j) / (NZ - 1)
        const y = -Math.sqrt(Math.max(r * r - z * z, 0)) + 0.01
        sandPos.push(x, Math.min(y, WATER_Y - 0.02), z)
      }
    }
    for (let i = 0; i < NX - 1; i++) {
      for (let j = 0; j < NZ - 1; j++) {
        const a = i * NZ + j
        sandIdx.push(a, a + NZ + 1, a + NZ, a, a + 1, a + NZ + 1)
      }
    }
    const sandGeo = track(new THREE.BufferGeometry())
    sandGeo.setAttribute('position', new THREE.Float32BufferAttribute(sandPos, 3))
    sandGeo.setIndex(sandIdx)
    sandGeo.computeVertexNormals()
    contents.add(new THREE.Mesh(sandGeo, track(new THREE.MeshStandardMaterial({
      color: '#b99a6b', roughness: 1,
    }))))

    // ── 배 · 산호 · 부두: 시드로 다시 짓는 부분
    const shipGroup = new THREE.Group()
    contents.add(shipGroup)
    const reefGroup = new THREE.Group()
    contents.add(reefGroup)

    const sails = []
    let flagMesh = null
    const shipDisposables = []

    const clearGroup = (g, keep) => {
      for (const child of [...g.children]) g.remove(child)
      for (const d of keep) d.dispose?.()
      keep.length = 0
    }

    const buildScene = (s) => {
      const rng = mulberry32(s)
      sails.length = 0
      clearGroup(shipGroup, shipDisposables)
      clearGroup(reefGroup, [])

      // 선체 치수 — 시드마다 다른 배가 나온다.
      const dims = {
        length: 1.72 + rng() * 0.38,
        beam: 0.3 + rng() * 0.08,
        draft: 0.15 + rng() * 0.05,
        sheer: 0.19 + rng() * 0.06,
      }
      const hullGeo = buildHull(dims)
      const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
      shipDisposables.push(hullGeo, hullMat)
      shipGroup.add(new THREE.Mesh(hullGeo, hullMat))

      const timberMat = new THREE.MeshStandardMaterial({ color: '#6b4526', roughness: 0.8 })
      const sailMat = new THREE.MeshStandardMaterial({
        color: '#efe3cd', roughness: 0.95, side: THREE.DoubleSide,
      })
      shipDisposables.push(timberMat, sailMat)

      // 돛대 2~3개. 각 돛대에 활대와 돛을 층층이 건다.
      const mastCount = rng() < 0.55 ? 3 : 2
      const mastTops = []
      for (let m = 0; m < mastCount; m++) {
        const u = mastCount === 2 ? 0.36 + m * 0.34 : 0.28 + m * 0.26
        const x = -dims.length / 2 + dims.length * u
        const h = (0.68 + rng() * 0.24) * (m === 1 && mastCount === 3 ? 1.15 : 1)
        const mastGeo = new THREE.CylinderGeometry(0.006, 0.009, h, 6)
        shipDisposables.push(mastGeo)
        const mast = new THREE.Mesh(mastGeo, timberMat)
        mast.position.set(x, dims.sheer + h / 2 - 0.02, 0)
        mast.rotation.z = -0.03 // 약간의 후경사
        shipGroup.add(mast)
        mastTops.push(new THREE.Vector3(x, dims.sheer + h, 0))

        const tiers = 2 + (rng() < 0.55 ? 1 : 0)
        for (let k = 0; k < tiers; k++) {
          const ty = dims.sheer + h * (0.32 + k * 0.26)
          const spanW = (0.42 - k * 0.07) * (1 + rng() * 0.15)
          const yardGeo = new THREE.CylinderGeometry(0.005, 0.005, spanW * 2, 5)
          shipDisposables.push(yardGeo)
          const yard = new THREE.Mesh(yardGeo, timberMat)
          yard.rotation.x = Math.PI / 2
          yard.position.set(x, ty, 0)
          shipGroup.add(yard)

          const sailGeo = makeSail(spanW * 1.9, h * 0.23)
          shipDisposables.push(sailGeo)
          const sail = new THREE.Mesh(sailGeo, sailMat)
          sail.rotation.y = Math.PI / 2
          sail.position.set(x, ty - h * 0.1, 0)
          shipGroup.add(sail)
          sails.push(sail)
        }
      }

      // 삭구: 돛대 꼭대기에서 선체로 내리는 선들. 실제 배의 실루엣은
      // 목재보다 이 선들이 만든다.
      const rigPts = []
      const bow = new THREE.Vector3(dims.length / 2 - 0.02, dims.sheer, 0)
      const stern = new THREE.Vector3(-dims.length / 2 + 0.02, dims.sheer, 0)
      for (const top of mastTops) {
        rigPts.push(top.clone(), bow.clone())
        rigPts.push(top.clone(), stern.clone())
        for (const side of [-1, 1]) {
          rigPts.push(top.clone(), new THREE.Vector3(top.x + 0.08 * side * 0, dims.sheer, side * dims.beam * 0.85))
        }
      }
      const rigGeo = new THREE.BufferGeometry().setFromPoints(rigPts)
      const rigMat = new THREE.LineBasicMaterial({ color: 0x2b2118, transparent: true, opacity: 0.75 })
      shipDisposables.push(rigGeo, rigMat)
      shipGroup.add(new THREE.LineSegments(rigGeo, rigMat))

      // 깃발
      const flagGeo = makeSail(0.14, 0.075)
      const flagMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(rng(), 0.65, 0.5), side: THREE.DoubleSide, roughness: 0.9,
      })
      shipDisposables.push(flagGeo, flagMat)
      flagMesh = new THREE.Mesh(flagGeo, flagMat)
      const tallest = mastTops.reduce((a, b) => (b.y > a.y ? b : a))
      flagMesh.position.set(tallest.x + 0.07, tallest.y - 0.03, 0)
      flagMesh.rotation.y = Math.PI / 2
      shipGroup.add(flagMesh)
      sails.push(flagMesh)

      // 선수 사장(bowsprit)
      const spritGeo = new THREE.CylinderGeometry(0.005, 0.007, 0.3, 5)
      shipDisposables.push(spritGeo)
      const sprit = new THREE.Mesh(spritGeo, timberMat)
      sprit.position.set(dims.length / 2 + 0.1, dims.sheer + 0.04, 0)
      sprit.rotation.z = Math.PI / 2 - 0.25
      shipGroup.add(sprit)

      shipGroup.userData.dims = dims
      shipGroup.position.x = -0.35

      // ── 산호초와 바위
      const coralMat = new THREE.MeshStandardMaterial({ color: '#d2694f', roughness: 0.9 })
      const rockMat = new THREE.MeshStandardMaterial({ color: '#59606b', roughness: 1 })
      shipDisposables.push(coralMat, rockMat)
      for (let i = 0; i < 14; i++) {
        const x = AXIS_MIN + 0.25 + rng() * 2.6
        const r = bottleRadius(x) * 0.9
        const z = (rng() - 0.5) * 2 * r * 0.8
        const y = -Math.sqrt(Math.max(r * r - z * z, 0)) + 0.01
        if (y > WATER_Y - 0.06) continue
        if (rng() < 0.62) {
          const c = makeCoral(rng, coralMat)
          c.position.set(x, y, z)
          c.scale.setScalar(0.7 + rng() * 0.7)
          reefGroup.add(c)
        } else {
          const rockGeo = new THREE.IcosahedronGeometry(0.035 + rng() * 0.05, 0)
          shipDisposables.push(rockGeo)
          const rock = new THREE.Mesh(rockGeo, rockMat)
          rock.position.set(x, y + 0.01, z)
          rock.rotation.set(rng() * 3, rng() * 3, rng() * 3)
          reefGroup.add(rock)
        }
      }
    }

    buildScene(seed)

    // ── 등대가 선 작은 부두 — 병 바닥 쪽 끝에 둔다.
    const pierMat = track(new THREE.MeshStandardMaterial({ color: '#7d715f', roughness: 1 }))
    const pier = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.1, 0.3)), pierMat)
    pier.position.set(AXIS_MIN + 0.55, WATER_Y - 0.02, 0.28)
    contents.add(pier)
    const tower = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.035, 0.055, 0.26, 12)),
      track(new THREE.MeshStandardMaterial({ color: '#e8e2d6', roughness: 0.9 })),
    )
    tower.position.set(AXIS_MIN + 0.55, WATER_Y + 0.11, 0.28)
    contents.add(tower)
    const lampMat = track(new THREE.MeshBasicMaterial({ color: '#ffd98a' }))
    const lamp = new THREE.Mesh(track(new THREE.SphereGeometry(0.018, 10, 8)), lampMat)
    lamp.position.set(AXIS_MIN + 0.55, WATER_Y + 0.25, 0.28)
    contents.add(lamp)
    const lampLight = new THREE.PointLight(0xffc46b, 0.35, 0.9)
    lampLight.position.copy(lamp.position)
    contents.add(lampLight)

    // ── 갈매기
    const gullMat = track(new THREE.MeshStandardMaterial({
      color: '#f2f5f8', roughness: 0.8, side: THREE.DoubleSide,
    }))
    const gulls = []
    for (let i = 0; i < 4; i++) {
      const g = makeGull(gullMat)
      g.userData.phase = (i / 4) * Math.PI * 2
      g.userData.radius = 0.55 + (i % 2) * 0.18
      g.userData.height = 0.36 + (i % 3) * 0.1
      contents.add(g)
      gulls.push(g)
    }

    // ── 받침대: 병이 공중에 떠 있으면 표본이 아니라 렌더로 보인다.
    const standMat = track(new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: 0.95 }))
    const ARC = Math.PI * 0.62
    const standGeo = track(new THREE.TorusGeometry(1.06, 0.05, 8, 28, ARC))
    for (const x of [-1.4, 0.35]) {
      const cradle = new THREE.Mesh(standGeo, standMat)
      cradle.position.set(x, 0, 0)
      // 호의 중점을 바닥(각도 1.5π)에 맞춘다.
      cradle.rotation.z = 1.5 * Math.PI - ARC / 2
      cradle.rotation.y = Math.PI / 2
      scene.add(cradle)
    }
    const plank = new THREE.Mesh(track(new THREE.BoxGeometry(3.4, 0.09, 0.8)), standMat)
    plank.position.set(-0.5, -1.16, 0)
    scene.add(plank)

    // ── 시점: 드래그 회전 + 휠 줌
    let yaw = 0.5
    let pitch = 0.22
    let dist = 6.2
    let dragging = false
    let px = 0
    let py = 0
    const el = renderer.domElement
    const onDown = (e) => { dragging = true; px = e.clientX; py = e.clientY }
    const onMove = (e) => {
      if (!dragging) return
      yaw -= (e.clientX - px) * 0.006
      pitch = Math.max(-0.6, Math.min(1.1, pitch + (e.clientY - py) * 0.004))
      px = e.clientX
      py = e.clientY
    }
    const onUp = () => { dragging = false }
    const onWheel = (e) => {
      e.preventDefault()
      dist = Math.max(3.2, Math.min(11, dist + e.deltaY * 0.004))
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })

    const resize = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const clock = new THREE.Clock()
    let time = 0
    let windValue = wind
    let sailsVisible = sailsUp
    let raf = 0

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(clock.getDelta(), 0.05)
      if (!reduced) time += dt

      const amp = WAVE_BASE * (0.35 + windValue * 1.4)
      waterUniforms.uTime.value = time
      waterUniforms.uAmp.value = amp

      // 배는 수면을 "탄다" — 선수와 선미의 파고를 각각 재서 자세를 얻는다.
      const dims = shipGroup.userData.dims
      if (dims) {
        const cx = shipGroup.position.x
        const hMid = waveHeight(cx, 0, time, amp)
        const hBow = waveHeight(cx + dims.length * 0.45, 0, time, amp)
        const hStern = waveHeight(cx - dims.length * 0.45, 0, time, amp)
        shipGroup.position.y = WATER_Y + hMid + dims.draft * 0.45
        shipGroup.rotation.z = Math.atan2(hBow - hStern, dims.length * 0.9)
        shipGroup.rotation.x = Math.sin(time * 0.7) * (0.05 + windValue * 0.09)
      }

      if (!reduced) billowSails(sails, time, windValue)
      for (const s of sails) s.visible = sailsVisible || s === flagMesh

      // 갈매기: 타원 궤도를 돌며 날갯짓하고, 도는 쪽으로 살짝 기운다.
      for (const g of gulls) {
        const a = time * (0.55 + g.userData.radius * 0.2) + g.userData.phase
        g.position.set(
          Math.cos(a) * g.userData.radius * 1.5 - 0.2,
          g.userData.height + Math.sin(a * 2.1) * 0.05,
          Math.sin(a) * g.userData.radius * 0.55,
        )
        g.rotation.y = -a + Math.PI / 2
        g.rotation.z = Math.sin(a) * 0.25
        const flap = Math.sin(time * 7 + g.userData.phase) * 0.55
        g.userData.left.rotation.x = flap
        g.userData.right.rotation.x = flap
      }

      // 등대: 느리게 깜빡인다.
      const beat = 0.55 + 0.45 * Math.pow(Math.max(Math.sin(time * 1.3), 0), 3)
      lampMat.color.setRGB(1, 0.85 * beat, 0.55 * beat)
      lampLight.intensity = 0.12 + beat * 0.35

      camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * dist,
        Math.sin(pitch) * dist,
        Math.cos(yaw) * Math.cos(pitch) * dist,
      )
      camera.lookAt(0, -0.15, 0)
      renderer.render(scene, camera)
    }
    tick()

    apiRef.current = {
      rebuild: (s) => buildScene(s),
      setWind: (v) => { windValue = v },
      setSails: (v) => { sailsVisible = v },
    }

    return () => {
      apiRef.current = null
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('wheel', onWheel)
      for (const d of disposables) d.dispose?.()
      for (const d of shipDisposables) d.dispose?.()
      renderer.dispose()
      wrap.removeChild(renderer.domElement)
    }
    // 시드·바람·돛은 apiRef로 전달한다 — 씬을 다시 세우지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { apiRef.current?.rebuild(seed) }, [seed])
  useEffect(() => { apiRef.current?.setWind(wind) }, [wind])
  useEffect(() => { apiRef.current?.setSails(sailsUp) }, [sailsUp])

  const hex = `0x${(seed & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`

  return (
    <div className="exp-wrap" ref={wrapRef}>
      <span className="exp-hint">드래그로 병을 돌리고 · 휠로 다가가며 · 바람을 올리면 파도가 거세집니다</span>
      <div className="exp-controls">
        <span className="exp-btn" style={{ pointerEvents: 'none' }}>SEED {hex}</span>
        <input
          className="exp-range"
          type="range"
          min="0"
          max="100"
          value={Math.round(wind * 100)}
          aria-label="바람"
          style={{ width: 130 }}
          onChange={(e) => setWind(Number(e.target.value) / 100)}
        />
        <button className="exp-btn" type="button" onClick={() => setSeed((Math.random() * 0xffff) | 0)}>
          새 배
        </button>
        <button
          className={`exp-btn${sailsUp ? ' active' : ''}`}
          type="button"
          onClick={() => setSailsUp((v) => !v)}
        >
          {sailsUp ? '돛 펼침' : '돛 접힘'}
        </button>
      </div>
    </div>
  )
}
