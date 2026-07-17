import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Reflector } from 'three/addons/objects/Reflector.js'
import '../shared/exp.css'

// ── 도시 경계 (스트리트는 Z축을 따라 뻗음) ──
const STREET_HALF = 100
const CROSSWALK_ZS = [-70, -22, 26, 74]
const CROSSWALK_HALF_Z = 3
const EYE_HEIGHT = 1.72
const THREE_UP = new THREE.Vector3(0, 1, 0)

const DISTRICTS = [
  {
    id: 'gangnam',
    name: '강남역',
    subtitle: 'GANGNAM STATION · 11번 출구',
    accent: '#7aa2ff',
    fogColor: 0x0a0d1c,
    fogDensity: 0.0105,
    buildingPalette: [0x232a3d, 0x1c2436, 0x272038, 0x1a2030],
    neonHues: [0.58, 0.62, 0.5, 0.78, 0.95, 0.55],
    signs: ['24시 편의점', '노래방', '스터디카페', '뷰티샵', '핫도그', '부동산', 'PC방', '라멘', '서점', '카페', '헬스클럽', '문구점'],
    streetWidth: 16,
    sidewalkWidth: 5,
    buildingSpacing: 11,
    tierHeights: [[8, 14], [14, 26], [26, 46]],
    tierWeights: [0.45, 0.35, 0.2],
    crowdCount: 260,
    hasVehicles: true,
    vehicleCount: 20,
  },
  {
    id: 'myeongdong',
    name: '명동',
    subtitle: 'MYEONGDONG · 쇼핑거리',
    accent: '#ff6fa8',
    fogColor: 0x180b14,
    fogDensity: 0.0135,
    buildingPalette: [0x2a1420, 0x321624, 0x24101c, 0x2e1a22],
    neonHues: [0.0, 0.02, 0.95, 0.08, 0.9, 0.05],
    signs: ['화장품 세일', '노점 떡볶이', '환전소', '붕어빵', '만두집', '기념품', '호떡', '뷰티스토어', '노래방', '카페', '액세서리', '군것질'],
    streetWidth: 10,
    sidewalkWidth: 4,
    buildingSpacing: 9,
    tierHeights: [[7, 11], [11, 16], [16, 22]],
    tierWeights: [0.5, 0.35, 0.15],
    crowdCount: 380,
    hasVehicles: false,
    vehicleCount: 0,
  },
  {
    id: 'hongdae',
    name: '홍대',
    subtitle: 'HONGDAE · 걷고싶은거리',
    accent: '#a78bfa',
    fogColor: 0x100a1c,
    fogDensity: 0.0125,
    buildingPalette: [0x241a34, 0x1c1428, 0x2a1c3a, 0x1a1226],
    neonHues: [0.78, 0.83, 0.55, 0.05, 0.9, 0.35],
    signs: ['라이브클럽', '버스킹존', '수제맥주', '타투샵', '빈티지샵', '떡볶이', '방탈출', '소품샵', '노래방', '카페', '피어싱', '스트릿패션'],
    streetWidth: 11,
    sidewalkWidth: 4,
    buildingSpacing: 9.5,
    tierHeights: [[6, 10], [10, 15], [15, 20]],
    tierWeights: [0.5, 0.35, 0.15],
    crowdCount: 340,
    hasVehicles: false,
    vehicleCount: 0,
  },
  {
    id: 'busan',
    name: '부산 서면',
    subtitle: 'BUSAN SEOMYEON · 젊음의거리',
    accent: '#2dd4bf',
    fogColor: 0x081a1c,
    fogDensity: 0.0115,
    buildingPalette: [0x14282a, 0x0f2224, 0x1a3234, 0x102628],
    neonHues: [0.5, 0.48, 0.08, 0.95, 0.15, 0.55],
    signs: ['돼지국밥', '씨앗호떡', '노래방', '전자상가', '찜질방', '수산시장', '커피', '분식', '스포츠용품', '약국', '환전소', '노점'],
    streetWidth: 15,
    sidewalkWidth: 5,
    buildingSpacing: 10.5,
    tierHeights: [[8, 13], [13, 24], [24, 40]],
    tierWeights: [0.42, 0.36, 0.22],
    crowdCount: 300,
    hasVehicles: true,
    vehicleCount: 18,
  },
  {
    id: 'daegu',
    name: '대구 동성로',
    subtitle: 'DAEGU DONGSEONGNO · 젊음의거리',
    accent: '#fb923c',
    fogColor: 0x1a0e06,
    fogDensity: 0.0125,
    buildingPalette: [0x2c1a10, 0x24140c, 0x321e12, 0x1e120a],
    neonHues: [0.08, 0.05, 0.55, 0.95, 0.12, 0.6],
    signs: ['분식', '커피', '옷가게', '화장품', '노래방', '떡볶이', '치킨', '문구점', '신발가게', '액세서리', 'PC방', '빙수'],
    streetWidth: 12,
    sidewalkWidth: 4,
    buildingSpacing: 9.5,
    tierHeights: [[7, 11], [11, 17], [17, 24]],
    tierWeights: [0.48, 0.36, 0.16],
    crowdCount: 350,
    hasVehicles: false,
    vehicleCount: 0,
  },
  {
    id: 'daejeon',
    name: '대전 으능정이거리',
    subtitle: 'DAEJEON SKYROAD',
    accent: '#38bdf8',
    fogColor: 0x061420,
    fogDensity: 0.012,
    buildingPalette: [0x0f2434, 0x0a1c2a, 0x122a3c, 0x0c1e2e],
    neonHues: [0.55, 0.6, 0.5, 0.75, 0.9, 0.05],
    signs: ['빵집', '커피', '노래방', '떡볶이', '옷가게', '문구점', '오락실', '사진관', '치킨', '분식', '헬스클럽', '편의점'],
    streetWidth: 13,
    sidewalkWidth: 4.5,
    buildingSpacing: 10,
    tierHeights: [[7, 12], [12, 19], [19, 28]],
    tierWeights: [0.46, 0.36, 0.18],
    crowdCount: 300,
    hasVehicles: false,
    vehicleCount: 0,
  },
  {
    id: 'pohang',
    name: '포항 시내',
    subtitle: 'POHANG DOWNTOWN · 죽도시장',
    accent: '#facc15',
    fogColor: 0x140f04,
    fogDensity: 0.0118,
    buildingPalette: [0x241d0c, 0x1c1608, 0x2a2110, 0x1a1408],
    neonHues: [0.13, 0.1, 0.55, 0.02, 0.6, 0.95],
    signs: ['건어물', '횟집', '노래방', '전통시장', '떡볶이', '철물점', '분식', '약국', '편의점', '수산물', '커피', '옷가게'],
    streetWidth: 14,
    sidewalkWidth: 4.5,
    buildingSpacing: 10.5,
    tierHeights: [[6, 10], [10, 15], [15, 20]],
    tierWeights: [0.55, 0.33, 0.12],
    crowdCount: 220,
    hasVehicles: true,
    vehicleCount: 14,
  },
]

function pickWeighted(weights) {
  const r = Math.random()
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]
    if (r <= acc) return i
  }
  return weights.length - 1
}

// 창문이 켜진 빌딩 파사드 텍스처 (공유 베이스, 층 그룹별로 clone 하여 repeat만 다르게)
function makeWindowTexture() {
  const w = 128, h = 256
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, w, h)
  const cols = 6, rows = 12
  const cw = w / cols, rh = h / rows
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      if (Math.random() < 0.58) {
        const warm = Math.random() < 0.7
        ctx.fillStyle = warm ? 'rgba(255,214,140,0.95)' : 'rgba(160,200,255,0.85)'
        const pad = cw * 0.18
        ctx.fillRect(col * cw + pad, r * rh + pad * 1.4, cw - pad * 2, rh - pad * 2.4)
      }
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

// 네온 간판 텍스처 (한글 텍스트 + 발광)
function makeSignTexture(text, hue) {
  const w = 512, h = 160
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  const color = `hsl(${Math.round(hue * 360)}, 95%, 68%)`
  ctx.fillStyle = 'rgba(6,4,10,0.72)'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = color
  ctx.lineWidth = 6
  ctx.strokeRect(6, 6, w - 12, h - 12)
  ctx.font = 'bold 64px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = color
  ctx.shadowBlur = 26
  ctx.fillStyle = color
  ctx.fillText(text, w / 2, h / 2)
  ctx.shadowBlur = 10
  ctx.fillText(text, w / 2, h / 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// 도로/보도 텍스처 (차선 + 인도 타일)
function makeGroundTexture(district) {
  const w = 512, h = 1024
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  const roadPx = (district.streetWidth / (district.streetWidth + district.sidewalkWidth * 2)) * w
  const sidePx = (w - roadPx) / 2

  ctx.fillStyle = '#1b1d22'
  ctx.fillRect(sidePx, 0, roadPx, h)
  ctx.fillStyle = '#2c2e33'
  ctx.fillRect(0, 0, sidePx, h)
  ctx.fillRect(sidePx + roadPx, 0, sidePx, h)

  // 인도 타일 라인
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 2
  for (let y = 0; y < h; y += 26) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(sidePx, y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(sidePx + roadPx, y); ctx.lineTo(w, y); ctx.stroke()
  }

  if (district.hasVehicles) {
    // 중앙 점선 차선
    ctx.strokeStyle = 'rgba(255,220,120,0.85)'
    ctx.lineWidth = 5
    ctx.setLineDash([22, 18])
    ctx.beginPath()
    ctx.moveTo(sidePx + roadPx / 2, 0)
    ctx.lineTo(sidePx + roadPx / 2, h)
    ctx.stroke()
    ctx.setLineDash([])
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

function makeCrosswalkTexture() {
  const w = 128, h = 64
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(235,235,240,0.92)'
  const stripes = 6
  for (let i = 0; i < stripes; i++) {
    ctx.fillRect((i / stripes) * w + 3, 0, w / stripes - 6, h)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// 대전 스카이로드: 거리를 가로지르는 아치형 LED 캐노피에 흐르는 영상 패턴
function makeSkyroadTexture() {
  const w = 512, h = 64
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  const bands = 6
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = `hsl(${(i / bands) * 360}, 90%, 62%)`
    ctx.fillRect((i / bands) * w, 0, w / bands + 1, h)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// 대구 동성로 아케이드: 상가 차양의 줄무늬 캔버스 패턴
function makeAwningTexture() {
  const w = 128, h = 64
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  const colors = ['#c23b3b', '#e8e4d8']
  const stripes = 8
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = colors[i % 2]
    ctx.fillRect((i / stripes) * w, 0, w / stripes, h)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// 인간형 유닛 지오메트리: 몸통은 고정, 팔다리는 걸음에 맞춰 흔들리도록
// 엉덩이/어깨 관절이 원점(0,0,0)에 오게 만들어 회전 피벗으로 쓴다.
// (머리는 피부색 톤을 별도로 주기 위해 분리된 InstancedMesh로 처리)
function makeTorsoGeometry() {
  const torso = new THREE.BoxGeometry(0.34, 0.5, 0.2)
  torso.translate(0, 1.05, 0)
  return torso
}

function makeLimbGeometry(w, h, d, x, z) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, -h / 2, z) // 관절(원점)에서 아래로 매달린 형태
  return g
}

function makeHeadGeometry() {
  const head = new THREE.SphereGeometry(0.14, 10, 8)
  head.translate(0, 1.42, 0)
  return head
}

function makeShadowTexture() {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(0,0,0,0.5)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  return new THREE.CanvasTexture(c)
}

// 야간 도심 위 대기광 그라디언트 (지평선 근처는 빛 공해로 밝고, 천정은 어둡게)
function makeSkyTexture(fogColor) {
  const w = 8, h = 256
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  const fog = new THREE.Color(fogColor)
  const horizon = fog.clone().lerp(new THREE.Color(0xffffff), 0.16)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#020208')
  g.addColorStop(0.55, `#${fog.getHexString()}`)
  g.addColorStop(1, `#${horizon.getHexString()}`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export default function SeoulNights() {
  const [districtIdx, setDistrictIdx] = useState(0)
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const statusRef = useRef(null)
  const coordsRef = useRef(null)
  const hintRef = useRef(null)
  const crosshairRef = useRef(null)
  const popRef = useRef(null)
  const fpsRef = useRef(null)

  useEffect(() => {
    const district = DISTRICTS[districtIdx]
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    let raf
    const disposables = []

    // ── 기본 씬 구성 ──
    const scene = new THREE.Scene()
    const skyTex = makeSkyTexture(district.fogColor)
    disposables.push(skyTex)
    scene.background = skyTex
    scene.fog = new THREE.FogExp2(district.fogColor, district.fogDensity)

    const camera = new THREE.PerspectiveCamera(68, container.clientWidth / container.clientHeight, 0.1, 400)
    const startX = -(district.streetWidth / 2 + district.sidewalkWidth / 2)
    camera.position.set(startX, EYE_HEIGHT, STREET_HALF - 8)
    camera.rotation.order = 'YXZ'

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // ── 조명 (야간 도심: 은은한 달빛 + 앰비언트, 나머지는 발광 텍스처와 블룸이 담당) ──
    scene.add(new THREE.AmbientLight(0x30395c, 0.9))
    const moon = new THREE.DirectionalLight(0x8fb3ff, 0.55)
    moon.position.set(-30, 60, 20)
    moon.castShadow = true
    moon.shadow.mapSize.set(2048, 2048)
    moon.shadow.camera.near = 1
    moon.shadow.camera.far = 160
    moon.shadow.camera.left = -60
    moon.shadow.camera.right = 60
    moon.shadow.camera.top = 110
    moon.shadow.camera.bottom = -110
    moon.shadow.bias = -0.0012
    moon.shadow.radius = 2.5
    scene.add(moon)

    // ── 포스트프로세싱 (네온 블룸 + 안티앨리어싱) ──
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.85, 0.5, 0.18
    )
    composer.addPass(bloom)
    composer.addPass(new SMAAPass())
    composer.addPass(new OutputPass())

    // ── 바닥 (도로 + 인도 + 젖은 아스팔트 반사) ──
    const groundTex = makeGroundTexture(district)
    groundTex.repeat.set(1, (STREET_HALF * 2) / 24)
    disposables.push(groundTex)
    const groundWidth = district.streetWidth + district.sidewalkWidth * 2
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundWidth, STREET_HALF * 2),
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    disposables.push(ground.geometry, ground.material)

    // 네온·창문 불빛이 바닥에 비치는 젖은 노면 반사 (실시간 평면 반사)
    const reflector = new Reflector(new THREE.PlaneGeometry(groundWidth, STREET_HALF * 2), {
      clipBias: 0.003,
      textureWidth: Math.min(container.clientWidth, 1024) * Math.min(window.devicePixelRatio, 2),
      textureHeight: Math.min(container.clientHeight, 1024) * Math.min(window.devicePixelRatio, 2),
      color: 0x14141c,
    })
    reflector.rotation.x = -Math.PI / 2
    reflector.position.y = 0.004
    reflector.material.transparent = true
    reflector.material.opacity = 0.4
    reflector.renderOrder = 1
    scene.add(reflector)
    disposables.push(reflector.geometry, reflector)

    if (district.hasVehicles) {
      const crossTex = makeCrosswalkTexture()
      disposables.push(crossTex)
      for (const z of CROSSWALK_ZS) {
        const cw = new THREE.Mesh(
          new THREE.PlaneGeometry(district.streetWidth, CROSSWALK_HALF_Z * 2),
          new THREE.MeshBasicMaterial({ map: crossTex, transparent: true })
        )
        cw.renderOrder = 2
        cw.rotation.x = -Math.PI / 2
        cw.position.set(0, 0.01, z)
        scene.add(cw)
        disposables.push(cw.geometry, cw.material)
      }
    }

    // ── 빌딩 생성 (높이 계층별 InstancedMesh) ──
    const windowBaseTex = makeWindowTexture()
    disposables.push(windowBaseTex)
    const outerEdge = district.streetWidth / 2 + district.sidewalkWidth
    const buildingsMeta = []
    const tierItems = district.tierHeights.map(() => [])

    for (const side of [-1, 1]) {
      let z = -STREET_HALF + 4
      while (z < STREET_HALF - 4) {
        const width = district.buildingSpacing * (0.75 + Math.random() * 0.45)
        const depth = 9 + Math.random() * 7
        const gap = 1.2 + Math.random() * 2.2
        const tierIdx = pickWeighted(district.tierWeights)
        const [hMin, hMax] = district.tierHeights[tierIdx]
        const height = hMin + Math.random() * (hMax - hMin)
        const centerZ = z + width / 2
        const centerX = side * (outerEdge + depth / 2 + 0.4)
        tierItems[tierIdx].push({ centerX, centerZ, width, height, depth })
        buildingsMeta.push({
          minX: centerX - width / 2, maxX: centerX + width / 2,
          minZ: centerZ - depth / 2, maxZ: centerZ + depth / 2,
          side, centerX, centerZ, width, depth, height,
        })
        z += width + gap
      }
    }

    const unitBox = new THREE.BoxGeometry(1, 1, 1)
    disposables.push(unitBox)
    tierItems.forEach((items, tierIdx) => {
      if (!items.length) return
      const tex = windowBaseTex.clone()
      tex.needsUpdate = true
      tex.repeat.set(2 + tierIdx, 3 + tierIdx * 4)
      disposables.push(tex)
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        metalness: 0.1,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.9,
      })
      disposables.push(mat)
      const mesh = new THREE.InstancedMesh(unitBox, mat, items.length)
      const m = new THREE.Matrix4()
      items.forEach((b, i) => {
        m.compose(
          new THREE.Vector3(b.centerX, b.height / 2, b.centerZ),
          new THREE.Quaternion(),
          new THREE.Vector3(b.width, b.height, b.depth)
        )
        mesh.setMatrixAt(i, m)
        const c = new THREE.Color(district.buildingPalette[(Math.random() * district.buildingPalette.length) | 0])
        mesh.setColorAt(i, c)
      })
      mesh.instanceColor.needsUpdate = true
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
    })

    // ── 네온 간판 (건물 절반 정도에 부착) ──
    const signMeshes = []
    const signPlane = new THREE.PlaneGeometry(3.2, 1)
    disposables.push(signPlane)
    buildingsMeta.forEach((b) => {
      if (Math.random() > 0.55) return
      const text = district.signs[(Math.random() * district.signs.length) | 0]
      const hue = district.neonHues[(Math.random() * district.neonHues.length) | 0]
      const tex = makeSignTexture(text, hue)
      disposables.push(tex)
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true })
      disposables.push(mat)
      const mesh = new THREE.Mesh(signPlane, mat)
      const faceX = b.centerX - b.side * (b.depth / 2 + 0.06)
      mesh.position.set(faceX, 2.6 + Math.random() * (Math.min(b.height, 12) - 3), b.centerZ)
      mesh.rotation.y = b.side > 0 ? -Math.PI / 2 : Math.PI / 2
      mesh.userData.flicker = Math.random() < 0.25 ? 4 + Math.random() * 4 : 0
      mesh.userData.phase = Math.random() * Math.PI * 2
      scene.add(mesh)
      signMeshes.push(mesh)
    })

    // ── 가로등 (인스턴싱: 기둥 + 발광 헤드) ──
    const lampPositions = []
    for (const side of [-1, 1]) {
      const lampX = side * (district.streetWidth / 2 + district.sidewalkWidth * 0.55)
      for (let z = -STREET_HALF + 10; z < STREET_HALF; z += 16) lampPositions.push({ x: lampX, z })
    }
    if (lampPositions.length) {
      const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 4.2, 6)
      const headGeo = new THREE.SphereGeometry(0.22, 8, 8)
      poleGeo.translate(0, 2.1, 0)
      headGeo.translate(0, 4.2, 0)
      const lampGeo = mergeGeometries([poleGeo, headGeo])
      poleGeo.dispose(); headGeo.dispose()
      disposables.push(lampGeo)
      const lampMat = new THREE.MeshStandardMaterial({ color: 0x24262c, emissive: 0xffe3ab, emissiveIntensity: 0.6 })
      disposables.push(lampMat)
      const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, lampPositions.length)
      const m = new THREE.Matrix4()
      lampPositions.forEach((p, i) => {
        m.compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1))
        lampMesh.setMatrixAt(i, m)
      })
      scene.add(lampMesh)
    }

    // ── 신호등 (차량이 있는 구역만) ──
    let signalState = { walk: true, timer: 0 }
    const signalHeads = []
    if (district.hasVehicles) {
      const headGeo = new THREE.SphereGeometry(0.18, 8, 8)
      disposables.push(headGeo)
      for (const cz of CROSSWALK_ZS) {
        for (const side of [-1, 1]) {
          const x = side * (district.streetWidth / 2 + 1.2)
          const mat = new THREE.MeshBasicMaterial({ color: 0x39ff6a })
          disposables.push(mat)
          const mesh = new THREE.Mesh(headGeo, mat)
          mesh.position.set(x, 2.6, cz - CROSSWALK_HALF_Z - 1.5)
          scene.add(mesh)
          signalHeads.push(mesh)
        }
      }
    }

    // ── 도시별 랜드마크 (색상만이 아니라 실루엣으로도 도시를 구분) ──
    const decorMeshes = []
    if (district.id === 'daejeon') {
      // 스카이로드: 거리를 가로지르는 아치형 LED 캐노피
      const archRadius = groundWidth / 2 - 0.6
      const archGeo = new THREE.TorusGeometry(archRadius, 0.4, 10, 40, Math.PI)
      disposables.push(archGeo)
      const archTex = makeSkyroadTexture()
      archTex.wrapS = THREE.RepeatWrapping
      archTex.repeat.set(3, 1)
      disposables.push(archTex)
      const archMat = new THREE.MeshBasicMaterial({ map: archTex, side: THREE.DoubleSide })
      disposables.push(archMat)
      for (const z of [-60, -15, 30, 65]) {
        const arch = new THREE.Mesh(archGeo, archMat)
        arch.position.set(0, 6.5, z)
        arch.userData.kind = 'skyroad'
        scene.add(arch)
        decorMeshes.push(arch)
      }
    } else if (district.id === 'myeongdong') {
      // 명동성당: 고딕 첨탑 실루엣의 랜드마크 건물 (충돌 판정에도 포함)
      const cSide = -1
      const cz = 40
      const cx = cSide * (outerEdge + 5.5)
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b5a4a, roughness: 0.9 })
      disposables.push(stoneMat)
      const bodyGeo = new THREE.BoxGeometry(9, 15, 11)
      disposables.push(bodyGeo)
      const body = new THREE.Mesh(bodyGeo, stoneMat)
      body.position.set(cx, 7.5, cz)
      body.castShadow = true
      body.receiveShadow = true
      scene.add(body)
      const spireMat = new THREE.MeshStandardMaterial({ color: 0x4a3c2e, roughness: 0.85 })
      disposables.push(spireMat)
      const spireGeo = new THREE.ConeGeometry(2.4, 11, 4)
      disposables.push(spireGeo)
      const spire = new THREE.Mesh(spireGeo, spireMat)
      spire.position.set(cx, 15 + 5.5, cz)
      spire.rotation.y = Math.PI / 4
      spire.castShadow = true
      scene.add(spire)
      const labelTex = makeSignTexture('명동성당', 0.12)
      disposables.push(labelTex)
      const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })
      disposables.push(labelMat)
      const label = new THREE.Mesh(signPlane, labelMat)
      label.position.set(cx - cSide * 4.6, 4.5, cz)
      label.rotation.y = cSide > 0 ? -Math.PI / 2 : Math.PI / 2
      scene.add(label)
      buildingsMeta.push({
        minX: cx - 4.5, maxX: cx + 4.5, minZ: cz - 5.5, maxZ: cz + 5.5,
        side: cSide, centerX: cx, centerZ: cz, width: 9, depth: 11, height: 15,
      })
    } else if (district.id === 'gangnam') {
      // 강남역 11번 출구: 유리 캐노피 지하철 입구 조형물
      const eSide = 1
      const ez = STREET_HALF - 22
      const ex = eSide * (district.streetWidth / 2 + district.sidewalkWidth / 2)
      const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.6, metalness: 0.4 })
      disposables.push(pillarMat)
      const pillarGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.2, 8)
      disposables.push(pillarGeo)
      for (const [px, pz] of [[-1.6, -1.4], [1.6, -1.4], [-1.6, 1.4], [1.6, 1.4]]) {
        const pillar = new THREE.Mesh(pillarGeo, pillarMat)
        pillar.position.set(ex + px, 1.6, ez + pz)
        pillar.castShadow = true
        scene.add(pillar)
      }
      const canopyMat = new THREE.MeshPhysicalMaterial({
        color: 0x8fb3ff, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1,
      })
      disposables.push(canopyMat)
      const canopyGeo = new THREE.BoxGeometry(4, 0.15, 4)
      disposables.push(canopyGeo)
      const canopy = new THREE.Mesh(canopyGeo, canopyMat)
      canopy.position.set(ex, 3.25, ez)
      canopy.castShadow = true
      scene.add(canopy)
      const numTex = makeSignTexture('11', district.neonHues[0])
      disposables.push(numTex)
      const numMat = new THREE.MeshBasicMaterial({ map: numTex, transparent: true })
      disposables.push(numMat)
      const numSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), numMat)
      disposables.push(numSign.geometry)
      numSign.position.set(ex, 2.2, ez - 2.1)
      scene.add(numSign)
      buildingsMeta.push({
        minX: ex - 2.1, maxX: ex + 2.1, minZ: ez - 2.1, maxZ: ez + 2.1,
        side: eSide, centerX: ex, centerZ: ez, width: 4.2, depth: 4.2, height: 3.3,
      })
    } else if (district.id === 'pohang') {
      // 포항제철 공업 실루엣: 거리 뒤편 배경으로 보이는 굴뚝
      const stackMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.9 })
      disposables.push(stackMat)
      const stackGeo = new THREE.CylinderGeometry(0.9, 1.2, 30, 10)
      disposables.push(stackGeo)
      const flareMat = new THREE.MeshBasicMaterial({ color: 0xff8a3d })
      disposables.push(flareMat)
      const flareGeo = new THREE.SphereGeometry(0.9, 8, 8)
      disposables.push(flareGeo)
      for (const [sx, sz] of [[-1, -40], [1, -20], [-1, 55]]) {
        const stackX = sx * (outerEdge + 32)
        const stack = new THREE.Mesh(stackGeo, stackMat)
        stack.position.set(stackX, 15, sz)
        scene.add(stack)
        const flare = new THREE.Mesh(flareGeo, flareMat)
        flare.position.set(stackX, 30.5, sz)
        flare.userData.kind = 'flare'
        scene.add(flare)
        decorMeshes.push(flare)
      }
    } else if (district.id === 'busan') {
      // 영화의전당 모티프: 외팔보 대형 캐노피 지붕이 거리 뒤편 스카이라인에 걸림
      const canopyMat = new THREE.MeshStandardMaterial({
        color: 0x0f3a3c, roughness: 0.5, metalness: 0.3, emissive: 0x0a4a4a, emissiveIntensity: 0.3,
      })
      disposables.push(canopyMat)
      const canopyGeo = new THREE.CylinderGeometry(14, 14, 0.6, 24)
      disposables.push(canopyGeo)
      const canopy = new THREE.Mesh(canopyGeo, canopyMat)
      const cx = -1 * (outerEdge + 30)
      const cz = 10
      canopy.position.set(cx, 26, cz)
      canopy.rotation.x = Math.PI / 2
      canopy.rotation.z = 0.18
      canopy.castShadow = true
      scene.add(canopy)
      const pillarMat2 = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6 })
      disposables.push(pillarMat2)
      const pillarGeo2 = new THREE.CylinderGeometry(0.8, 0.8, 22, 10)
      disposables.push(pillarGeo2)
      const pillar2 = new THREE.Mesh(pillarGeo2, pillarMat2)
      pillar2.position.set(cx + 4, 12, cz)
      pillar2.castShadow = true
      scene.add(pillar2)
    } else if (district.id === 'daegu') {
      // 동성로 아케이드: 인도 위 상가 차양들이 줄지어 거리를 덮는 느낌
      const awningTex = makeAwningTexture()
      disposables.push(awningTex)
      const awningMat = new THREE.MeshStandardMaterial({ map: awningTex, side: THREE.DoubleSide, roughness: 0.8 })
      disposables.push(awningMat)
      const awningGeo = new THREE.PlaneGeometry(3.4, 1.8)
      disposables.push(awningGeo)
      buildingsMeta.forEach((b, i) => {
        if (i % 3 !== 0) return
        const awning = new THREE.Mesh(awningGeo, awningMat)
        const faceX = b.centerX - b.side * (b.depth / 2 + 0.9)
        awning.position.set(faceX, 3.1, b.centerZ)
        awning.rotation.y = b.side > 0 ? -Math.PI / 2 : Math.PI / 2
        scene.add(awning)
      })
    } else if (district.id === 'hongdae') {
      // 홍대 놀이터: 버스킹 무대와 나무가 있는 작은 광장 (충돌 판정 포함)
      const px = 1 * (outerEdge + 3)
      const pz = -10
      const stageMat = new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.8 })
      disposables.push(stageMat)
      const stageGeo = new THREE.CylinderGeometry(3.2, 3.4, 0.4, 16)
      disposables.push(stageGeo)
      const stage = new THREE.Mesh(stageGeo, stageMat)
      stage.position.set(px, 0.2, pz)
      stage.receiveShadow = true
      scene.add(stage)
      const micMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.6 })
      disposables.push(micMat)
      const micGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6)
      disposables.push(micGeo)
      const mic = new THREE.Mesh(micGeo, micMat)
      mic.position.set(px, 1.1, pz)
      scene.add(mic)
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2a1c, roughness: 0.9 })
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5a34, roughness: 0.8 })
      disposables.push(trunkMat, leafMat)
      const trunkGeo = new THREE.CylinderGeometry(0.25, 0.32, 3, 8)
      const leafGeo = new THREE.SphereGeometry(1.6, 8, 8)
      disposables.push(trunkGeo, leafGeo)
      for (const [tx, tz] of [[px + 4.5, pz - 3], [px + 5, pz + 3.5]]) {
        const trunk = new THREE.Mesh(trunkGeo, trunkMat)
        trunk.position.set(tx, 1.5, tz)
        trunk.castShadow = true
        scene.add(trunk)
        const leaf = new THREE.Mesh(leafGeo, leafMat)
        leaf.position.set(tx, 3.6, tz)
        leaf.castShadow = true
        scene.add(leaf)
      }
      buildingsMeta.push({
        minX: px - 3.4, maxX: px + 3.4, minZ: pz - 3.4, maxZ: pz + 3.4,
        side: 1, centerX: px, centerZ: pz, width: 6.8, depth: 6.8, height: 0.4,
      })
    }

    // ── 군중 인스턴싱 (몸통 + 걸음에 맞춰 흔들리는 팔다리 + 별도 머리 메시) ──
    const torsoGeo = makeTorsoGeometry()
    disposables.push(torsoGeo)
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.85 })
    disposables.push(bodyMat)
    const crowdMesh = new THREE.InstancedMesh(torsoGeo, bodyMat, district.crowdCount)
    crowdMesh.castShadow = true
    scene.add(crowdMesh)

    const HIP_Y = 0.8
    const SHOULDER_Y = 1.18
    const legGeoL = makeLimbGeometry(0.13, 0.8, 0.15, -0.09, 0)
    const legGeoR = makeLimbGeometry(0.13, 0.8, 0.15, 0.09, 0)
    const armGeoL = makeLimbGeometry(0.11, 0.52, 0.13, -0.245, 0.03)
    const armGeoR = makeLimbGeometry(0.11, 0.52, 0.13, 0.245, -0.03)
    disposables.push(legGeoL, legGeoR, armGeoL, armGeoR)
    const pantsMat = new THREE.MeshStandardMaterial({ roughness: 0.85 })
    const armMat = new THREE.MeshStandardMaterial({ roughness: 0.85 })
    disposables.push(pantsMat, armMat)
    const legMeshL = new THREE.InstancedMesh(legGeoL, pantsMat, district.crowdCount)
    const legMeshR = new THREE.InstancedMesh(legGeoR, pantsMat, district.crowdCount)
    const armMeshL = new THREE.InstancedMesh(armGeoL, armMat, district.crowdCount)
    const armMeshR = new THREE.InstancedMesh(armGeoR, armMat, district.crowdCount)
    ;[legMeshL, legMeshR, armMeshL, armMeshR].forEach((mesh) => { mesh.castShadow = true })
    scene.add(legMeshL, legMeshR, armMeshL, armMeshR)

    const headGeo = makeHeadGeometry()
    disposables.push(headGeo)
    const headMat = new THREE.MeshStandardMaterial({ roughness: 0.7 })
    disposables.push(headMat)
    const headMesh = new THREE.InstancedMesh(headGeo, headMat, district.crowdCount)
    headMesh.castShadow = true
    scene.add(headMesh)

    // 발밑 접지 그림자 (바닥에서 살짝 떠 보이지 않도록 하는 페이크 AO)
    const shadowTex = makeShadowTexture()
    disposables.push(shadowTex)
    const shadowGeo = new THREE.PlaneGeometry(0.55, 0.55)
    shadowGeo.rotateX(-Math.PI / 2)
    disposables.push(shadowGeo)
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    disposables.push(shadowMat)
    const shadowMesh = new THREE.InstancedMesh(shadowGeo, shadowMat, district.crowdCount)
    scene.add(shadowMesh)

    const half = district.streetWidth / 2
    const sideMin = half + 0.6
    const sideMax = half + district.sidewalkWidth - 0.6
    const people = []
    for (let i = 0; i < district.crowdCount; i++) {
      const side = Math.random() < 0.5 ? -1 : 1
      const isCrosser = district.hasVehicles && Math.random() < 0.3
      const person = {
        side,
        lane: sideMin + Math.random() * (sideMax - sideMin),
        z: -STREET_HALF + 6 + Math.random() * (STREET_HALF * 2 - 12),
        speed: 0.9 + Math.random() * 1.1,
        dir: Math.random() < 0.5 ? -1 : 1,
        phase: Math.random() * Math.PI * 2,
        mode: isCrosser ? 'wait' : 'stroll',
        crossX: 0,
        millX: 0,
      }
      if (!district.hasVehicles) {
        // 명동: 차도 없이 거리 전체를 자유롭게 배회
        person.millX = -half - district.sidewalkWidth + Math.random() * (half * 2 + district.sidewalkWidth * 2)
      }
      if (isCrosser) {
        const cz = CROSSWALK_ZS[(Math.random() * CROSSWALK_ZS.length) | 0]
        person.z = cz + (Math.random() - 0.5) * (CROSSWALK_HALF_Z * 1.4)
        person.crosswalkZ = cz
      }
      const clothingHue = Math.random()
      const shirtLight = 0.38 + Math.random() * 0.25
      const shirtColor = new THREE.Color().setHSL(clothingHue, 0.35, shirtLight)
      const pantsColor = new THREE.Color().setHSL(clothingHue, 0.3, shirtLight * 0.6)
      crowdMesh.setColorAt(i, shirtColor)
      armMeshL.setColorAt(i, shirtColor)
      armMeshR.setColorAt(i, shirtColor)
      legMeshL.setColorAt(i, pantsColor)
      legMeshR.setColorAt(i, pantsColor)
      headMesh.setColorAt(i, new THREE.Color().setHSL(0.07, 0.45, 0.5 + Math.random() * 0.22))
      people.push(person)
    }
    crowdMesh.instanceColor.needsUpdate = true
    legMeshL.instanceColor.needsUpdate = true
    legMeshR.instanceColor.needsUpdate = true
    armMeshL.instanceColor.needsUpdate = true
    armMeshR.instanceColor.needsUpdate = true
    headMesh.instanceColor.needsUpdate = true

    // ── 차량 인스턴싱 ──
    let vehicleMesh = null
    const vehicles = []
    if (district.hasVehicles && district.vehicleCount > 0) {
      const carGeo = new THREE.BoxGeometry(1.8, 1.2, 3.6)
      disposables.push(carGeo)
      const carMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3, emissive: 0x111111 })
      disposables.push(carMat)
      vehicleMesh = new THREE.InstancedMesh(carGeo, carMat, district.vehicleCount)
      vehicleMesh.castShadow = true
      vehicleMesh.receiveShadow = true
      scene.add(vehicleMesh)
      for (let i = 0; i < district.vehicleCount; i++) {
        const lane = Math.random() < 0.5 ? -1 : 1
        vehicles.push({
          lane,
          x: lane * (district.streetWidth / 4),
          z: -STREET_HALF + Math.random() * STREET_HALF * 2,
          speed: 7 + Math.random() * 5,
        })
        vehicleMesh.setColorAt(i, new THREE.Color().setHSL(Math.random(), 0.5, 0.55))
      }
      vehicleMesh.instanceColor.needsUpdate = true
    }

    // ── 이동/입력 처리 (BinaryWorld 패턴 재사용) ──
    const keys = { w: false, a: false, s: false, d: false, space: false }
    const velocity = new THREE.Vector3()
    let canJump = false

    const onKeyDown = (e) => {
      const k = e.key.toLowerCase()
      if (k === 'w' || k === 'arrowup') keys.w = true
      if (k === 'a' || k === 'arrowleft') keys.a = true
      if (k === 's' || k === 'arrowdown') keys.s = true
      if (k === 'd' || k === 'arrowright') keys.d = true
      if (e.key === ' ') { keys.space = true; e.preventDefault() }
    }
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase()
      if (k === 'w' || k === 'arrowup') keys.w = false
      if (k === 'a' || k === 'arrowleft') keys.a = false
      if (k === 's' || k === 'arrowdown') keys.s = false
      if (k === 'd' || k === 'arrowright') keys.d = false
      if (e.key === ' ') keys.space = false
    }
    // 마우스 시선 처리: Pointer Lock이 가능하면 그것을 쓰고,
    // (임베드/권한 문제 등으로) 실패하거나 지원되지 않는 환경에서는
    // 버튼을 누른 채 드래그하는 방식으로도 동일하게 시선을 조작할 수 있게 폴백한다.
    let dragging = false
    const setActive = (active) => {
      if (statusRef.current) {
        statusRef.current.textContent = active ? 'STATUS: 탐험중' : 'STATUS: 대기'
        statusRef.current.style.color = active ? district.accent : '#999'
      }
      if (hintRef.current) hintRef.current.style.display = active ? 'none' : 'flex'
      if (crosshairRef.current) crosshairRef.current.style.display = active ? 'block' : 'none'
    }
    const onMouseMove = (e) => {
      const locked = document.pointerLockElement === container
      if (!locked && !dragging) return
      const s = 0.0022
      camera.rotation.y -= e.movementX * s
      camera.rotation.x -= e.movementY * s
      camera.rotation.x = Math.max(-Math.PI / 2.05, Math.min(Math.PI / 2.05, camera.rotation.x))
    }
    const onLockChange = () => {
      setActive(document.pointerLockElement === container || dragging)
    }
    const onPointerDown = () => {
      dragging = true
      setActive(true)
      container.requestPointerLock?.()?.catch?.(() => {})
    }
    const onPointerUp = () => {
      dragging = false
      setActive(document.pointerLockElement === container)
    }
    container.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointerlockchange', onLockChange)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)

    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      composer.setSize(w, h)
      bloom.setSize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    if (popRef.current) popRef.current.textContent = `인구 밀도: 보행자 ${district.crowdCount}명${district.hasVehicles ? ` · 차량 ${district.vehicleCount}대` : ''}`

    const clock = new THREE.Clock()
    const playerRadius = 0.5
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const qSwing = new THREE.Quaternion()
    const qLimb = new THREE.Quaternion()
    const IDENTITY_Q = new THREE.Quaternion()
    const SHADOW_POS = new THREE.Vector3()
    const AXIS_X = new THREE.Vector3(1, 0, 0)
    const scaleOne = new THREE.Vector3(1, 1, 1)
    let fpsFrames = 0
    let fpsTimer = 0

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const rawDt = clock.getDelta()
      const dt = Math.min(rawDt, 0.1)
      const t = clock.elapsedTime

      fpsFrames++
      fpsTimer += rawDt
      if (fpsTimer >= 0.5) {
        if (fpsRef.current) fpsRef.current.textContent = `FPS: ${Math.round(fpsFrames / fpsTimer)}`
        fpsFrames = 0
        fpsTimer = 0
      }

      // 보행자 신호 사이클
      if (district.hasVehicles) {
        signalState.timer += dt
        const cycle = signalState.walk ? 7 : 5
        if (signalState.timer > cycle) { signalState.timer = 0; signalState.walk = !signalState.walk }
        const col = signalState.walk ? 0x39ff6a : 0xff3b3b
        signalHeads.forEach((h) => h.material.color.setHex(col))
      }

      // 네온 간판 플리커
      signMeshes.forEach((s) => {
        if (s.userData.flicker) {
          const v = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * s.userData.flicker + s.userData.phase))
          s.material.opacity = v
        }
      })

      // 도시별 랜드마크 애니메이션 (스카이로드 스크롤, 제철소 불꽃 펄스)
      decorMeshes.forEach((m) => {
        if (m.userData.kind === 'skyroad') {
          m.material.map.offset.x = (t * 0.15) % 1
        } else if (m.userData.kind === 'flare') {
          const p = 0.75 + 0.25 * Math.sin(t * 2.5 + m.position.z)
          m.material.color.setRGB(p, p * 0.5, 0.15)
        }
      })

      // 군중 갱신
      const walkOk = !district.hasVehicles || signalState.walk
      for (let i = 0; i < people.length; i++) {
        const p = people[i]
        let x, z, facing

        if (!district.hasVehicles) {
          p.millX += p.dir * p.speed * dt
          const limit = half + district.sidewalkWidth - 1
          if (p.millX > limit || p.millX < -limit) { p.dir *= -1; p.millX = Math.max(-limit, Math.min(limit, p.millX)) }
          p.z += Math.sin(p.phase + t * 0.3) * 0.15 * dt
          x = p.millX
          z = p.z
          facing = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2
        } else if (p.mode === 'wait') {
          x = p.side * p.lane
          z = p.crosswalkZ + Math.sin(p.phase) * 0.3
          facing = p.side > 0 ? Math.PI / 2 : -Math.PI / 2
          if (walkOk) p.mode = 'cross'
        } else if (p.mode === 'cross') {
          p.lane -= p.speed * dt
          x = p.side * p.lane
          z = p.crosswalkZ
          facing = p.side > 0 ? -Math.PI / 2 : Math.PI / 2
          if (p.lane <= -sideMin) {
            p.side *= -1
            p.lane = sideMin + Math.random() * (sideMax - sideMin)
            p.mode = 'stroll'
            p.dir = Math.random() < 0.5 ? -1 : 1
          }
        } else {
          p.z += p.dir * p.speed * dt
          const zLimit = STREET_HALF - 4
          if (p.z > zLimit || p.z < -zLimit) p.dir *= -1
          x = p.side * p.lane
          z = p.z
          facing = p.dir > 0 ? 0 : Math.PI
        }

        const walking = p.mode !== 'wait'
        const bob = walking ? Math.abs(Math.sin(t * 6 + p.phase)) * 0.06 : 0
        q.setFromAxisAngle(THREE_UP, facing)
        m.compose(new THREE.Vector3(x, bob, z), q, scaleOne)
        crowdMesh.setMatrixAt(i, m)
        headMesh.setMatrixAt(i, m)

        // 걸음 애니메이션: 걷는 동안에만 팔다리가 관절을 축으로 앞뒤로 흔들림
        const strideAngle = walking ? Math.sin(t * (2.4 + p.speed * 0.5) + p.phase) * 0.5 : 0
        const armAngle = -strideAngle * 0.8
        const hipPos = new THREE.Vector3(x, bob + HIP_Y, z)
        const shoulderPos = new THREE.Vector3(x, bob + SHOULDER_Y, z)

        qSwing.setFromAxisAngle(AXIS_X, strideAngle)
        qLimb.multiplyQuaternions(q, qSwing)
        m.compose(hipPos, qLimb, scaleOne)
        legMeshR.setMatrixAt(i, m)

        qSwing.setFromAxisAngle(AXIS_X, -strideAngle)
        qLimb.multiplyQuaternions(q, qSwing)
        m.compose(hipPos, qLimb, scaleOne)
        legMeshL.setMatrixAt(i, m)

        qSwing.setFromAxisAngle(AXIS_X, armAngle)
        qLimb.multiplyQuaternions(q, qSwing)
        m.compose(shoulderPos, qLimb, scaleOne)
        armMeshR.setMatrixAt(i, m)

        qSwing.setFromAxisAngle(AXIS_X, -armAngle)
        qLimb.multiplyQuaternions(q, qSwing)
        m.compose(shoulderPos, qLimb, scaleOne)
        armMeshL.setMatrixAt(i, m)

        m.compose(SHADOW_POS.set(x, 0.03, z), IDENTITY_Q, scaleOne)
        shadowMesh.setMatrixAt(i, m)
      }
      crowdMesh.instanceMatrix.needsUpdate = true
      headMesh.instanceMatrix.needsUpdate = true
      legMeshL.instanceMatrix.needsUpdate = true
      legMeshR.instanceMatrix.needsUpdate = true
      armMeshL.instanceMatrix.needsUpdate = true
      armMeshR.instanceMatrix.needsUpdate = true
      shadowMesh.instanceMatrix.needsUpdate = true

      // 차량 갱신
      if (vehicleMesh) {
        for (let i = 0; i < vehicles.length; i++) {
          const v = vehicles[i]
          v.z += v.lane * v.speed * dt * -1
          if (v.z < -STREET_HALF) v.z = STREET_HALF
          if (v.z > STREET_HALF) v.z = -STREET_HALF
          const facing = v.lane > 0 ? 0 : Math.PI
          q.setFromAxisAngle(THREE_UP, facing)
          m.compose(new THREE.Vector3(v.x, 0.7, v.z), q, scaleOne)
          vehicleMesh.setMatrixAt(i, m)
        }
        vehicleMesh.instanceMatrix.needsUpdate = true
      }

      // 플레이어 이동
      velocity.y -= 7.5 * dt
      const moveDir = new THREE.Vector3()
      if (keys.w) moveDir.z -= 1
      if (keys.s) moveDir.z += 1
      if (keys.a) moveDir.x -= 1
      if (keys.d) moveDir.x += 1
      moveDir.normalize()
      const moveSpeed = 5.4
      const yaw = camera.rotation.y
      const fwd = new THREE.Vector3(
        moveDir.x * Math.cos(yaw) + moveDir.z * Math.sin(yaw),
        0,
        -moveDir.x * Math.sin(yaw) + moveDir.z * Math.cos(yaw)
      ).normalize().multiplyScalar(moveSpeed)
      velocity.x = fwd.x
      velocity.z = fwd.z
      if (keys.space && canJump) { velocity.y = 4.6; canJump = false }

      camera.position.x += velocity.x * dt
      camera.position.y += velocity.y * dt
      camera.position.z += velocity.z * dt

      if (camera.position.y < EYE_HEIGHT) { camera.position.y = EYE_HEIGHT; velocity.y = 0; canJump = true }

      // 경계 클램프
      const outerLimit = outerEdge + 40
      camera.position.x = Math.max(-outerLimit, Math.min(outerLimit, camera.position.x))
      camera.position.z = Math.max(-STREET_HALF + 2, Math.min(STREET_HALF - 2, camera.position.z))

      // 건물 충돌 (근접 건물만 검사)
      const pX = camera.position.x, pZ = camera.position.z
      for (let i = 0; i < buildingsMeta.length; i++) {
        const b = buildingsMeta[i]
        if (Math.abs(b.centerZ - pZ) > b.depth / 2 + playerRadius + 6) continue
        if (Math.abs(b.centerX - pX) > b.width / 2 + playerRadius + 6) continue
        const cx = Math.max(b.minX, Math.min(pX, b.maxX))
        const cz = Math.max(b.minZ, Math.min(pZ, b.maxZ))
        const dx = pX - cx, dz = pZ - cz
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < playerRadius && dist > 0.0001) {
          const push = playerRadius - dist
          camera.position.x += (dx / dist) * push
          camera.position.z += (dz / dist) * push
        } else if (dist <= 0.0001) {
          camera.position.x = b.maxX + playerRadius
        }
      }

      if (coordsRef.current) {
        coordsRef.current.textContent = `X:${camera.position.x.toFixed(1)} Z:${camera.position.z.toFixed(1)}`
      }

      composer.render()
    }
    raf = requestAnimationFrame(tick)

    // 개발 전용 렌더 성능 측정 훅: 브라우저 자동화/백그라운드 탭에서는
    // requestAnimationFrame이 강제로 스로틀링되어 실측 FPS가 왜곡되므로,
    // rAF와 무관하게 실제 렌더 1프레임 비용(ms)을 직접 측정할 수 있게 노출한다.
    if (import.meta.env.DEV) {
      window.__seoulNightsBench = (n = 180) => {
        const start = performance.now()
        for (let i = 0; i < n; i++) composer.render()
        const elapsed = performance.now() - start
        return { district: district.id, samples: n, avgMs: +(elapsed / n).toFixed(2), estFps: +(1000 / (elapsed / n)).toFixed(1) }
      }
      // rAF 스케줄링과 무관하게 이동/충돌 로직 자체를 검증하기 위한 훅
      // (백그라운드 탭에서는 rAF가 멈춰 tick()이 자연 호출되지 않는다)
      window.__seoulNightsStep = (n = 60, held = {}, yaw) => {
        if (typeof yaw === 'number') camera.rotation.y = yaw
        Object.assign(keys, held)
        for (let i = 0; i < n; i++) tick()
        Object.assign(keys, { w: false, a: false, s: false, d: false, space: false })
        return { x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2) }
      }
      // 랜드마크가 실제로 씬에 올바르게 배치됐는지 좌표로 직접 확인하는 훅
      window.__seoulNightsScene = () => ({
        decorCount: decorMeshes.length,
        meshCount: scene.children.filter((o) => o.isMesh).length,
        objects: scene.children
          .filter((o) => o.isMesh || o.isGroup)
          .map((o) => ({ type: o.geometry?.type, pos: [o.position.x, o.position.y, o.position.z] })),
      })
    }

    return () => {
      cancelAnimationFrame(raf)
      if (window.__seoulNightsBench) delete window.__seoulNightsBench
      if (window.__seoulNightsStep) delete window.__seoulNightsStep
      if (window.__seoulNightsScene) delete window.__seoulNightsScene
      ro.disconnect()
      container.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointerlockchange', onLockChange)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onMouseMove)
      if (document.pointerLockElement === container) document.exitPointerLock()

      disposables.forEach((d) => d.dispose?.())
      composer.dispose()
      renderer.dispose()
    }
  }, [districtIdx])

  const district = DISTRICTS[districtIdx]

  return (
    <div className="exp-wrap" ref={containerRef} style={{ position: 'relative', cursor: 'pointer' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      <div style={{
        position: 'absolute', top: 24, left: 24,
        fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: district.accent,
        textShadow: `0 0 8px ${district.accent}66`, pointerEvents: 'none',
        display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10,
      }}>
        <div style={{ fontWeight: 'bold', letterSpacing: '0.08em' }}>{district.name} · {district.subtitle}</div>
        <div ref={statusRef}>STATUS: 대기</div>
        <div ref={coordsRef} style={{ color: 'rgba(255,255,255,0.6)' }}>X:0.0 Z:0.0</div>
        <div ref={popRef} style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }} />
        <div ref={fpsRef} style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>FPS: --</div>
      </div>

      <div style={{
        position: 'absolute', bottom: 76, left: '50%', transform: 'translateX(-50%)',
        fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'rgba(255,255,255,0.4)',
        pointerEvents: 'none', zIndex: 10,
      }}>
        W-A-S-D: 이동 · SPACE: 점프 · 마우스: 시선
      </div>

      <div className="exp-controls">
        {DISTRICTS.map((d, i) => (
          <button
            key={d.id}
            className={`exp-btn${i === districtIdx ? ' active' : ''}`}
            onClick={() => setDistrictIdx(i)}
          >
            {d.name}
          </button>
        ))}
      </div>

      <div
        ref={crosshairRef}
        style={{
          position: 'absolute', top: '50%', left: '50%', width: 6, height: 6,
          borderRadius: '50%', background: district.accent, boxShadow: `0 0 10px ${district.accent}`,
          transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 10, display: 'none',
        }}
      />

      <div
        ref={hintRef}
        className="exp-hint"
        style={{
          pointerEvents: 'none', background: 'rgba(2,2,6,0.88)', padding: '20px 32px',
          borderRadius: 16, border: `1px solid ${district.accent}44`, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          top: '50%', transform: 'translate(-50%, -50%)',
        }}
      >
        <span style={{ color: district.accent, fontWeight: 'bold', fontSize: 13, letterSpacing: '0.05em' }}>
          화면을 클릭하여 {district.name} 거리로 들어가세요
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 8, lineHeight: 1.5 }}>
          W-A-S-D : 이동 · Space : 점프 · 마우스 : 시선 이동 (드래그로도 가능) <br />
          아래 버튼으로 다른 도시 번화가로 이동할 수 있습니다 <br />
          Esc 키를 누르면 원래 화면으로 돌아옵니다
        </span>
      </div>
    </div>
  )
}
