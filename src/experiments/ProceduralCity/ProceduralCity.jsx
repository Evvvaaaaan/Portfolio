import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { patchFacade, patchGround, PALETTE, FLOOR_H } from './scene/facade.js'
import '../shared/exp.css'

// 에셋 없이 도시 한 채를 코드로 짓는다. 지오메트리는 단위 박스 하나뿐이고,
// 도로망·필지 분할·건물 매스·창문·차량 흐름이 전부 시드 하나에서 결정론적으로
// 파생된다. 시드가 같으면 언제 열어도 같은 도시가 선다.
//
// 셰이딩은 three의 표준 재질에 코드를 주입하는 방식이다 (scene/facade.js).
// 직접 램버트를 계산하면 그림자도, 하늘 반사도, 창 뒤의 방도 얻을 수 없다 —
// 도시가 도시로 보이지 않는 이유의 대부분이 그 셋이었다.

const GRID = 24            // 한 변의 블록 수
const BLOCK = 28           // 블록 피치(도로 중심 간 거리)
const ROAD_W = 10          // 도로 폭 (보도 포함)
const EXTENT = GRID * BLOCK
const HALF = EXTENT / 2
const MAX_TIERS = 5200     // 인스턴스 상한 — 재생성 때 버퍼를 다시 만들지 않는다
const CARS = 2400

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SKY_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float t = clamp(d.y * 1.6 + 0.06, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(t, 0.75));
    // 해 주변의 산란 — 이 한 항이 환경맵에 들어가면 건물 유리에 해가 비친다.
    float s = max(dot(d, uSunDir), 0.0);
    col += uSunColor * (pow(s, 8.0) * 0.55 + pow(s, 220.0) * 6.0);
    gl_FragColor = vec4(col, 1.0);
  }
`

const CAR_VERT = /* glsl */ `
  attribute vec3 aColor;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_PointSize = uPixelRatio * 420.0 / max(vDepth, 1.0);
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
  }
`

const CAR_FRAG = /* glsl */ `
  precision highp float;
  uniform float uNight;
  uniform float uFogDensity;
  varying vec3 vColor;
  varying float vDepth;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.06, d);
    float fog = 1.0 - exp(-vDepth * uFogDensity);
    float strength = mix(0.3, 1.6, uNight);
    gl_FragColor = vec4(vColor * strength, a * strength * (1.0 - fog));
  }
`

// 시드 하나에서 도시 전체의 매스를 만든다. 미리 잡아둔 배열을 채우고 실제
// 인스턴스 수만 돌려준다 — 재생성마다 GPU 버퍼를 다시 만들지 않기 위해서다.
function buildCity(seed, { matrix, scales, seeds, tints, dummy }) {
  const rng = mulberry32(seed)
  let n = 0

  const push = (x, z, w, d, base, height, tint) => {
    if (n >= MAX_TIERS) return
    dummy.position.set(x, base + height / 2, z)
    dummy.scale.set(w, height, d)
    dummy.updateMatrix()
    dummy.matrix.toArray(matrix, n * 16)
    scales[n * 3] = w
    scales[n * 3 + 1] = height
    scales[n * 3 + 2] = d
    seeds[n] = rng() * 500
    tints[n] = tint
    n++
  }

  const interior = BLOCK - ROAD_W

  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const cx = (i + 0.5) * BLOCK - HALF
      const cz = (j + 0.5) * BLOCK - HALF

      // 도심 낙차: 중심에서 멀어질수록 낮아진다. 이 한 줄이 "무작위 상자 더미"와
      // "도시"를 가르는 지점이다 — 스카이라인에 봉우리가 하나 생긴다.
      const dist = Math.hypot(cx, cz) / HALF
      const downtown = Math.pow(1 - clamp01(dist * 1.15), 2.0)

      if (rng() < 0.05 + dist * 0.06) continue // 공원·광장

      const split = rng() < 0.34 ? 1 : rng() < 0.6 ? 2 : 4
      const cols = split === 4 ? 2 : split
      const rows = split === 4 ? 2 : 1
      const plotW = interior / cols
      const plotD = interior / rows

      for (let a = 0; a < cols; a++) {
        for (let b = 0; b < rows; b++) {
          if (split > 1 && rng() < 0.12) continue // 주차장·공터

          const px = cx - interior / 2 + plotW * (a + 0.5)
          const pz = cz - interior / 2 + plotD * (b + 0.5)
          const margin = 1.1 + rng() * 1.6
          const w = Math.max(plotW - margin * 2, 3)
          const d = Math.max(plotD - margin * 2, 3)

          // 층 수에서 높이를 만든다 — 창 격자가 층고와 맞아떨어져야 창이
          // 반 칸 잘린 채 옥상에 걸리지 않는다.
          const lowFloors = 2 + Math.floor(rng() * 4)
          const towerFloors = Math.floor(Math.pow(rng(), 2.6) * 46 * downtown)
          const height = (lowFloors + towerFloors) * FLOOR_H
          const tint = rng()

          if (height > 46 && rng() < 0.75) {
            // 세트백: 위로 갈수록 좁아지는 단. 실루엣이 단조로운 직육면체에서
            // 벗어나 스카이라인에 층이 생긴다.
            const lower = Math.round((height * (0.52 + rng() * 0.18)) / FLOOR_H) * FLOOR_H
            push(px, pz, w, d, 0, lower, tint)
            const midW = w * (0.62 + rng() * 0.18)
            const midD = d * (0.62 + rng() * 0.18)
            const mid = Math.round(((height - lower) * (0.62 + rng() * 0.25)) / FLOOR_H) * FLOOR_H
            push(px, pz, midW, midD, lower, mid, tint)
            // 각 단 위의 파라펫 — 옥상이 칼로 자른 듯 끝나면 종이처럼 보인다.
            push(px, pz, midW + 0.5, midD + 0.5, lower + mid - 0.1, 1.1, tint)
            const capH = height - lower - mid
            if (capH > 4) push(px, pz, midW * 0.66, midD * 0.66, lower + mid, capH, tint)
            if (height > 110 && rng() < 0.5) {
              push(px, pz, 1.1, 1.1, height, 10 + rng() * 22, tint) // 첨탑
            }
          } else {
            push(px, pz, w, d, 0, height, tint)
            push(px, pz, w + 0.55, d + 0.55, height - 0.15, 1.0, tint) // 파라펫
            // 옥탑 설비: 물탱크·계단실·실외기. 위에서 내려다보는 도시에서
            // 옥상이 전부 평평하면 그 순간 모형으로 읽힌다.
            const units = 1 + Math.floor(rng() * 3)
            for (let u = 0; u < units; u++) {
              const uw = w * (0.16 + rng() * 0.2)
              const ud = d * (0.16 + rng() * 0.2)
              push(
                px + (rng() - 0.5) * (w - uw) * 0.7,
                pz + (rng() - 0.5) * (d - ud) * 0.7,
                uw, ud, height, 1.2 + rng() * 2.6, tint,
              )
            }
          }
        }
      }
    }
  }
  return n
}

function seedTraffic(rng, cars) {
  for (let i = 0; i < CARS; i++) {
    const axis = rng() < 0.5 ? 0 : 1
    const lane = Math.floor(rng() * (GRID + 1)) * BLOCK - HALF
    const dir = rng() < 0.5 ? 1 : -1
    cars.axis[i] = axis
    cars.lane[i] = lane + dir * 2.1
    cars.pos[i] = rng() * EXTENT - HALF
    cars.dir[i] = dir
    cars.speed[i] = 14 + rng() * 22
    const tail = dir < 0
    cars.color[i * 3] = 1.0
    cars.color[i * 3 + 1] = tail ? 0.22 : 0.93
    cars.color[i * 3 + 2] = tail ? 0.16 : 0.82
  }
}

export default function ProceduralCity() {
  const wrapRef = useRef(null)
  const apiRef = useRef(null)
  const [seed, setSeed] = useState(() => (Math.random() * 0xffff) | 0)
  const [night, setNight] = useState(true)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return undefined

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(58, wrap.clientWidth / wrap.clientHeight, 1, 4000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    const pixelRatio = Math.min(window.devicePixelRatio, 2)
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(wrap.clientWidth, wrap.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.92
    wrap.appendChild(renderer.domElement)

    const disposables = []
    const track = (o) => { disposables.push(o); return o }

    // ── 하늘: 별도 씬에 두고 큐브맵으로 구워 배경과 환경광(IBL)에 함께 쓴다.
    // 씬 안에 두면 GTAO의 깊이·법선 프리패스가 하늘까지 훑어 지평선에 후광이
    // 생긴다. 굽기만 하면 HDRI 파일 없이도 하늘빛이 건물을 비춘다.
    const skyUniforms = {
      uHorizon: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Color() },
    }
    const skyScene = new THREE.Scene()
    const skyGeo = track(new THREE.SphereGeometry(500, 32, 16))
    const skyMat = track(new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false,
    }))
    skyScene.add(new THREE.Mesh(skyGeo, skyMat))

    const cubeRT = track(new THREE.WebGLCubeRenderTarget(256))
    const cubeCam = new THREE.CubeCamera(1, 2000, cubeRT)
    const pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()
    let envRT = null
    const bakeSky = () => {
      cubeCam.update(renderer, skyScene)
      scene.background = cubeRT.texture
      envRT?.dispose()
      envRT = pmrem.fromScene(skyScene, 0, 1, 1500)
      scene.environment = envRT.texture
    }

    // ── 해: 그림자를 만드는 유일한 광원. 카메라를 따라다니며 그림자 카메라를
    // 시야 근처에 붙여 둔다 — 도시 전체를 한 장으로 덮으면 텍셀이 모자란다.
    const sun = new THREE.DirectionalLight(0xffffff, 3.0)
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    const SHADOW_SPAN = 420
    Object.assign(sun.shadow.camera, {
      left: -SHADOW_SPAN, right: SHADOW_SPAN, top: SHADOW_SPAN, bottom: -SHADOW_SPAN,
      near: 1, far: 1200,
    })
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.7
    scene.add(sun, sun.target)
    const sunDir = new THREE.Vector3()

    // ── 공유 유니폼
    const uniforms = {
      uNight: { value: night ? 1 : 0 },
      uTimeF: { value: 0 },
      uWindowWarm: { value: new THREE.Color('#ffcf8d') },
      uWindowCool: { value: new THREE.Color('#a8d4ff') },
      uRoomBack: { value: new THREE.Color() },
      uRoomSide: { value: new THREE.Color() },
      uRoomFloor: { value: new THREE.Color() },
      uRoomCeil: { value: new THREE.Color() },
      uInteriorDepth: { value: 3.4 },
      uAsphalt: { value: new THREE.Color() },
      uPlaza: { value: new THREE.Color() },
      uLine: { value: new THREE.Color('#c9c2a8') },
      uLampGlow: { value: new THREE.Color() },
      uFogDensity: { value: 0.0013 },
      uHazeColor: { value: new THREE.Color() },
      uHazeSun: { value: new THREE.Color() },
      uSunDirF: { value: new THREE.Vector3() },
      uHazeDensity: { value: 0.0011 },
      // 연무는 지면에 쌓인다 — 고도 60m쯤에서 절반으로 옅어진다.
      uHazeFalloff: { value: 0.011 },
      uPixelRatio: { value: pixelRatio },
    }


    // ── 지면
    const groundGeo = track(new THREE.PlaneGeometry(EXTENT * 3.2, EXTENT * 3.2))
    const groundMat = track(patchGround(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 }),
      uniforms, { block: BLOCK, roadW: ROAD_W, half: HALF },
    ))
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // ── 건물: 단위 박스 하나를 인스턴싱해 도시 전체를 드로우콜 한 번에 그린다.
    const boxGeo = track(new THREE.BoxGeometry(1, 1, 1))
    const scales = new Float32Array(MAX_TIERS * 3)
    const seeds = new Float32Array(MAX_TIERS)
    const tints = new Float32Array(MAX_TIERS)
    boxGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 3))
    boxGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
    boxGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 1))

    const buildingMat = track(patchFacade(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }),
      uniforms,
    ))
    const city = new THREE.InstancedMesh(boxGeo, buildingMat, MAX_TIERS)
    city.frustumCulled = false // 도시 전체가 한 덩어리라 잘라낼 것이 없다
    city.castShadow = true
    city.receiveShadow = true
    scene.add(city)

    const dummy = new THREE.Object3D()
    const buffers = { matrix: city.instanceMatrix.array, scales, seeds, tints, dummy }

    // ── 차량 빛점
    const carPos = new Float32Array(CARS * 3)
    const carCol = new Float32Array(CARS * 3)
    const cars = {
      axis: new Uint8Array(CARS), lane: new Float32Array(CARS), pos: new Float32Array(CARS),
      dir: new Float32Array(CARS), speed: new Float32Array(CARS), color: carCol,
    }
    const carGeo = track(new THREE.BufferGeometry())
    carGeo.setAttribute('position', new THREE.BufferAttribute(carPos, 3))
    carGeo.setAttribute('aColor', new THREE.BufferAttribute(carCol, 3))
    const carMat = track(new THREE.ShaderMaterial({
      vertexShader: CAR_VERT, fragmentShader: CAR_FRAG, uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    const traffic = new THREE.Points(carGeo, carMat)
    traffic.frustumCulled = false
    scene.add(traffic)

    const rebuild = (nextSeed) => {
      city.count = buildCity(nextSeed, buffers)
      city.instanceMatrix.needsUpdate = true
      boxGeo.attributes.aScale.needsUpdate = true
      boxGeo.attributes.aSeed.needsUpdate = true
      boxGeo.attributes.aTint.needsUpdate = true
      seedTraffic(mulberry32(nextSeed ^ 0x9e3779b9), cars)
      carGeo.attributes.aColor.needsUpdate = true
    }
    rebuild(seed)

    // ── 후처리: GTAO가 골목과 창 오목부를 어둡게 만들고, 블룸이 켜진 창을 번지게
    // 한다. AO 없이는 건물끼리 맞닿은 곳이 전부 같은 밝기라 매스가 붙어 보인다.
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const gtao = new GTAOPass(scene, camera, wrap.clientWidth, wrap.clientHeight)
    gtao.output = GTAOPass.OUTPUT.Default
    gtao.blendIntensity = 0.85
    gtao.updateGtaoMaterial({ radius: 6.5, distanceExponent: 1.4, thickness: 3.0, scale: 1.1, samples: 16 })
    composer.addPass(gtao)
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(wrap.clientWidth, wrap.clientHeight), 0.42, 0.8, 0.9,
    )
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    // ── 시점: 도시 위를 도는 완만한 비행 + 드래그 시점 + 휠 고도.
    let nightTarget = night ? 1 : 0
    let bakedNight = -1
    let flight = 0
    let altitude = 110
    let yaw = 0
    let pitch = 0
    let dragging = false
    let px = 0
    let py = 0

    const el = renderer.domElement
    const onDown = (e) => { dragging = true; px = e.clientX; py = e.clientY }
    const onMove = (e) => {
      if (!dragging) return
      yaw -= (e.clientX - px) * 0.0026
      pitch = Math.max(-0.9, Math.min(0.5, pitch - (e.clientY - py) * 0.0022))
      px = e.clientX
      py = e.clientY
    }
    const onUp = () => { dragging = false }
    const onWheel = (e) => {
      e.preventDefault()
      altitude = Math.max(26, Math.min(320, altitude + e.deltaY * 0.09))
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
      composer.setSize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const clock = new THREE.Clock()
    const eye = new THREE.Vector3()
    const look = new THREE.Vector3()
    const R = 168

    const pathAt = (s, out) => out.set(
      Math.sin(s * 0.052) * R + Math.sin(s * 0.019) * R * 0.55,
      0,
      Math.cos(s * 0.041) * R + Math.cos(s * 0.013) * R * 0.45,
    )

    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(clock.getDelta(), 0.05)
      uniforms.uTimeF.value += dt
      if (!reduced) flight += dt

      pathAt(flight, eye)
      eye.y = altitude
      pathAt(flight + 6, look)
      look.y = altitude * 0.42
      camera.position.copy(eye)
      camera.lookAt(look)
      camera.rotateY(yaw)
      camera.rotateX(pitch)

      for (let i = 0; i < CARS; i++) {
        let p = cars.pos[i] + cars.dir[i] * cars.speed[i] * (reduced ? 0 : dt)
        if (p > HALF) p -= EXTENT
        else if (p < -HALF) p += EXTENT
        cars.pos[i] = p
        const idx = i * 3
        if (cars.axis[i] === 0) { carPos[idx] = p; carPos[idx + 2] = cars.lane[i] }
        else { carPos[idx] = cars.lane[i]; carPos[idx + 2] = p }
        carPos[idx + 1] = 0.9
      }
      carGeo.attributes.position.needsUpdate = true

      // 낮/밤 보간
      const k = 1 - Math.pow(0.02, dt)
      uniforms.uNight.value += (nightTarget - uniforms.uNight.value) * k
      const t = uniforms.uNight.value
      const d = PALETTE.day
      const nn = PALETTE.night

      skyUniforms.uHorizon.value.copy(d.horizon).lerp(nn.horizon, t)
      skyUniforms.uZenith.value.copy(d.zenith).lerp(nn.zenith, t)
      skyUniforms.uSunColor.value.copy(d.sun).lerp(nn.sun, t)
      uniforms.uHazeColor.value.copy(d.haze).lerp(nn.haze, t)
      uniforms.uHazeSun.value.copy(d.hazeSun).lerp(nn.hazeSun, t)
      uniforms.uAsphalt.value.copy(d.asphalt).lerp(nn.asphalt, t)
      uniforms.uPlaza.value.copy(d.plaza).lerp(nn.plaza, t)
      uniforms.uLampGlow.value.copy(d.lamp).lerp(nn.lamp, t)
      buildingMat.color.copy(d.wall).lerp(nn.wall, t)

      // 실내 색: 낮은 무채색 사무실, 밤은 조명이 켜진 따뜻한 방.
      const room = d.room.clone().lerp(nn.room, t)
      uniforms.uRoomBack.value.copy(room)
      uniforms.uRoomSide.value.copy(room).multiplyScalar(0.78)
      uniforms.uRoomFloor.value.copy(room).multiplyScalar(0.55)
      uniforms.uRoomCeil.value.copy(room).multiplyScalar(1.15)

      // 해: 낮에는 낮게 걸어 그림자를 길게 뽑고, 밤에는 달빛 수준으로 낮춘다.
      const el2 = 0.36
      const az = 0.85
      sunDir.set(Math.cos(az) * Math.cos(el2), Math.sin(el2), Math.sin(az) * Math.cos(el2)).normalize()
      skyUniforms.uSunDir.value.copy(sunDir)
      uniforms.uSunDirF.value.copy(sunDir).negate()
      sun.color.copy(d.sun).lerp(nn.sun, t)
      sun.intensity = 3.0 * (1 - t) + 0.12 * t
      sun.target.position.set(camera.position.x, 0, camera.position.z)
      sun.position.copy(sun.target.position).addScaledVector(sunDir, 500)
      sun.target.updateMatrixWorld()

      // 환경맵은 매 프레임 굽기엔 비싸다 — 하늘색이 눈에 띄게 바뀔 때만 다시 굽는다.
      if (Math.abs(t - bakedNight) > 0.04) {
        bakedNight = t
        bakeSky()
      }

      composer.render()
    }
    bakeSky()
    tick()

    apiRef.current = {
      rebuild,
      setNight: (on) => { nightTarget = on ? 1 : 0 },
    }

    return () => {
      apiRef.current = null
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('wheel', onWheel)
      envRT?.dispose()
      pmrem.dispose()
      gtao.dispose()
      bloom.dispose()
      composer.dispose()
      for (const o of disposables) o.dispose?.()
      renderer.dispose()
      wrap.removeChild(renderer.domElement)
    }
    // 시드/낮밤은 apiRef를 통해 명령형으로 전달한다 — 씬을 다시 세우지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { apiRef.current?.rebuild(seed) }, [seed])
  useEffect(() => { apiRef.current?.setNight(night) }, [night])

  const hex = `0x${(seed & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`

  return (
    <div className="exp-wrap" ref={wrapRef}>
      <span className="exp-hint">
        드래그로 시점 · 휠로 고도 · 시드를 바꾸면 도시가 통째로 다시 지어집니다
      </span>
      <div className="exp-controls">
        <span className="exp-btn" style={{ pointerEvents: 'none' }}>SEED {hex}</span>
        <input
          className="exp-range"
          type="range"
          min="0"
          max="1023"
          value={seed & 0x3ff}
          aria-label="시드"
          style={{ width: 150 }}
          onChange={(e) => setSeed(Number(e.target.value))}
        />
        <button className="exp-btn" type="button" onClick={() => setSeed((Math.random() * 0xffff) | 0)}>
          새 도시
        </button>
        <button
          className={`exp-btn${night ? ' active' : ''}`}
          type="button"
          onClick={() => setNight((v) => !v)}
        >
          {night ? '밤' : '낮'}
        </button>
      </div>
    </div>
  )
}
