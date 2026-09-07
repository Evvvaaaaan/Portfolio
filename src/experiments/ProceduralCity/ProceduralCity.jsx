import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import '../shared/exp.css'

// 에셋 없이 도시 한 채를 코드로 짓는다. 지오메트리는 단위 박스 하나뿐이고,
// 도로망·필지 분할·건물 매스·창문 불빛·차량 흐름이 전부 시드 하나에서
// 결정론적으로 파생된다. 시드가 같으면 언제 열어도 같은 도시가 선다.

const GRID = 24            // 한 변의 블록 수
const BLOCK = 28           // 블록 피치(도로 중심 간 거리)
const ROAD_W = 10          // 도로 폭 (보도 포함)
const EXTENT = GRID * BLOCK
const HALF = EXTENT / 2
const MAX_TIERS = 5200     // 인스턴스 상한 — 재생성 때 버퍼를 다시 만들지 않는다
const CARS = 2400
const FLOOR_H = 2.2        // 창문 행 간격 = 층고
const WINDOW_W = 1.7       // 창문 열 간격

// mulberry32: 32비트 시드 하나로 결정론적 난수열을 만든다.
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

// 셰이더가 공유하는 상수 — JS의 배치 규칙과 어긋나면 도로 위에 건물이 선다.
const SHARED_GLSL = /* glsl */ `
  const float BLOCK = ${BLOCK.toFixed(1)};
  const float ROAD_W = ${ROAD_W.toFixed(1)};
  const float HALF = ${HALF.toFixed(1)};

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
`

const BUILDING_VERT = /* glsl */ `
  attribute vec3 aScale;
  attribute float aSeed;
  attribute float aTint;

  varying vec3 vLocal;
  varying vec3 vScale;
  varying vec3 vNrm;
  varying vec3 vView;
  varying float vSeed;
  varying float vTint;
  varying float vDepth;

  void main() {
    // 박스는 축 정렬이라 인스턴스 행렬에 회전이 없다 — 법선은 그대로 월드 법선이다.
    vNrm = normal;
    vLocal = position * aScale;
    vScale = aScale;
    vSeed = aSeed;
    vTint = aTint;

    vec4 world = instanceMatrix * vec4(position, 1.0);
    vView = normalize(cameraPosition - world.xyz);
    vec4 mv = modelViewMatrix * world;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const BUILDING_FRAG = /* glsl */ `
  precision highp float;
  ${SHARED_GLSL}

  uniform vec3 uWallDay;
  uniform vec3 uWallNight;
  uniform vec3 uWindowWarm;
  uniform vec3 uWindowCool;
  uniform vec3 uGlassDay;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyTint;
  uniform vec3 uNightFill;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uNight;
  uniform float uTime;

  varying vec3 vLocal;
  varying vec3 vScale;
  varying vec3 vNrm;
  varying vec3 vView;
  varying float vSeed;
  varying float vTint;
  varying float vDepth;

  void main() {
    vec3 n = normalize(vNrm);
    float roof = step(0.5, abs(n.y));

    vec3 wall = mix(uWallDay, uWallNight, uNight);
    // 건물마다 콘크리트 톤을 조금씩 흔든다 — 같은 회색이 반복되면 렌더가 아니라
    // 프로그램 출력처럼 보인다.
    wall *= 0.82 + vTint * 0.36;

    // 벽면 좌표: u는 벽을 따라간 거리, v는 지면으로부터의 높이.
    float u = abs(n.x) > 0.5 ? vLocal.z : vLocal.x;
    float v = vLocal.y + vScale.y * 0.5;

    vec2 cell = vec2(floor(u / ${WINDOW_W.toFixed(1)}), floor(v / ${FLOOR_H.toFixed(1)}));
    vec2 f = vec2(fract(u / ${WINDOW_W.toFixed(1)}), fract(v / ${FLOOR_H.toFixed(1)}));
    float pane = step(0.20, f.x) * step(f.x, 0.80) * step(0.32, f.y) * step(f.y, 0.82);
    pane *= 1.0 - roof;

    float h = hash21(cell + vec2(vSeed, vSeed * 1.7));
    // 밤에만 창이 켜진다. 낮에는 같은 격자가 어두운 유리로 읽힌다.
    // 절반 넘게 켜 두면 건물이 통째로 빛나는 덩어리가 되어 매스가 사라진다.
    float lit = step(0.62, h) * pane * uNight;
    // 켜진 창도 밝기가 제각각이어야 격자가 아니라 창으로 읽힌다.
    float bright = 0.45 + 0.55 * hash21(cell * 3.7 - vSeed);
    // 극히 일부 창만 아주 느리게 점멸시킨다 — 도시가 정지 화면이 아니라는 신호.
    float blink = 0.55 + 0.45 * sin(uTime * 1.7 + h * 90.0);
    lit *= bright * mix(1.0, blink, step(0.97, h));
    // 1층은 상가 — 밤이면 거의 다 켜져 거리에 빛이 깔린다.
    lit = max(lit, step(v, ${FLOOR_H.toFixed(1)}) * pane * uNight * 0.8);

    vec3 windowColor = mix(uWindowWarm, uWindowCool, step(0.88, hash21(cell * 1.9 + vSeed)));

    // 낮의 창은 하늘을 담은 어두운 유리.
    vec3 albedo = mix(wall, uGlassDay, pane * (1.0 - uNight) * 0.75);

    float ndl = max(dot(n, uSunDir), 0.0);
    float skyDome = 0.5 + 0.5 * n.y;
    // 밤에는 태양 대신 하늘 전체가 약한 광원이 된다. 앰비언트를 낮과 같은
    // 배율로 두면 벽이 완전히 검정이 되어 창문 격자만 허공에 뜬다 — 건물이
    // 덩어리로 읽히려면 밤 전용 채움광이 필요하다.
    vec3 ambient = mix(
      uSkyTint * (0.62 + 0.53 * skyDome),
      uNightFill * (0.95 + 0.5 * skyDome),
      uNight
    );
    vec3 color = albedo * (ambient + uSunColor * ndl * mix(1.05, 0.10, uNight));

    // 시선에 비스듬한 면일수록 하늘빛을 얹어 모서리를 살린다 — 밤에 건물과
    // 건물이 겹쳐도 실루엣이 분리돼 보인다.
    float rim = pow(1.0 - abs(dot(n, normalize(vView))), 2.2);
    color += uNightFill * rim * uNight * 0.55;

    color += windowColor * lit * 1.35;

    float fog = 1.0 - exp(-vDepth * uFogDensity);
    gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
  }
`

const GROUND_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying float vDepth;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mv = viewMatrix * world;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const GROUND_FRAG = /* glsl */ `
  precision highp float;
  ${SHARED_GLSL}

  uniform vec3 uAsphalt;
  uniform vec3 uPlaza;
  uniform vec3 uLine;
  uniform vec3 uLampGlow;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uNight;

  varying vec3 vWorld;
  varying float vDepth;

  void main() {
    vec2 g = mod(vWorld.xz + HALF, BLOCK);
    float dx = min(g.x, BLOCK - g.x);
    float dz = min(g.y, BLOCK - g.y);
    float dRoad = min(dx, dz);

    // 도로 → 보도 → 필지 순으로 밝기가 한 단계씩 올라간다.
    float road = 1.0 - smoothstep(ROAD_W * 0.5 - 1.2, ROAD_W * 0.5 + 0.4, dRoad);
    float curb = smoothstep(ROAD_W * 0.5 - 1.4, ROAD_W * 0.5 - 0.2, dRoad)
               * (1.0 - smoothstep(ROAD_W * 0.5 + 0.6, ROAD_W * 0.5 + 2.0, dRoad));

    vec3 color = mix(uPlaza, uAsphalt, road);
    color = mix(color, uPlaza * 1.35, curb * 0.7);

    // 중앙 파선 — 교차로에서는 끊는다.
    float alongX = step(dz, dx);
    float along = alongX > 0.5 ? vWorld.x : vWorld.z;
    float dash = step(0.55, fract(along / 9.0));
    float center = (1.0 - smoothstep(0.0, 0.55, dRoad)) * dash * road;
    float crossing = step(min(dx, dz), ROAD_W * 0.5) * step(max(dx, dz), ROAD_W * 0.5);
    color = mix(color, uLine, center * (1.0 - crossing) * 0.75);

    // 밤에는 가로등 빛웅덩이가 도로를 따라 이어진다.
    float lampBeat = smoothstep(0.35, 1.0, sin(along * 0.22) * 0.5 + 0.5);
    color += uLampGlow * road * uNight * (0.25 + 0.55 * lampBeat);

    float fog = 1.0 - exp(-vDepth * uFogDensity);
    gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
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
    // 낮에는 헤드라이트가 잘 보이지 않는다 — 아주 흐리게만 남긴다.
    float strength = mix(0.28, 1.5, uNight);
    gl_FragColor = vec4(vColor * strength, a * strength * (1.0 - fog));
  }
`

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
  varying vec3 vDir;
  void main() {
    float t = clamp(vDir.y * 1.6 + 0.06, 0.0, 1.0);
    gl_FragColor = vec4(mix(uHorizon, uZenith, pow(t, 0.75)), 1.0);
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

      // 가끔 한 블록을 통째로 비워 공원·광장을 만든다.
      if (rng() < 0.05 + dist * 0.06) continue

      // 필지 분할: 1 / 2 / 4 등분.
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

          // 저층 스프롤 위에, 도심일수록 드물게 타워가 솟는다.
          const lowRise = 7 + rng() * 12
          const tower = Math.pow(rng(), 2.6) * 150 * downtown
          const height = lowRise + tower
          const tint = rng()

          if (height > 46 && rng() < 0.75) {
            // 세트백: 위로 갈수록 좁아지는 단. 실루엣이 단조로운 직육면체에서
            // 벗어나 스카이라인에 층이 생긴다.
            const lower = height * (0.52 + rng() * 0.18)
            push(px, pz, w, d, 0, lower, tint)
            const midW = w * (0.62 + rng() * 0.18)
            const midD = d * (0.62 + rng() * 0.18)
            const mid = (height - lower) * (0.62 + rng() * 0.25)
            push(px, pz, midW, midD, lower, mid, tint)
            const capH = height - lower - mid
            if (capH > 4) push(px, pz, midW * 0.66, midD * 0.66, lower + mid, capH, tint)
            // 첨탑: 가장 높은 몇 채에만.
            if (height > 110 && rng() < 0.5) {
              push(px, pz, 1.1, 1.1, height, 10 + rng() * 22, tint)
            }
          } else {
            push(px, pz, w, d, 0, height, tint)
            // 옥탑(설비층) — 저층 지붕이 전부 평평하면 위에서 볼 때 밋밋하다.
            if (rng() < 0.5) {
              push(px, pz, w * 0.3, d * 0.3, height, 1.4 + rng() * 2.2, tint)
            }
          }
        }
      }
    }
  }
  return n
}

// 차량: 도로 격자를 따라 흐르는 빛점. 방향에 따라 헤드라이트(흰빛)와
// 테일라이트(붉은빛)로 나뉘어 흐름이 두 줄로 보인다.
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
    cars.color[i * 3] = tail ? 1.0 : 1.0
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
    wrap.appendChild(renderer.domElement)

    // --- 낮/밤 팔레트. 한 프레임에 하나씩 보간해 토글이 컷이 아니라 전환이 된다.
    const PALETTE = {
      day: {
        horizon: new THREE.Color('#b9c6d8'), zenith: new THREE.Color('#5d84bd'),
        fog: new THREE.Color('#aebfd3'), sky: new THREE.Color('#8ea6c4'),
        asphalt: new THREE.Color('#3c4048'), plaza: new THREE.Color('#6c7078'),
        lamp: new THREE.Color('#000000'),
      },
      night: {
        horizon: new THREE.Color('#28324a'), zenith: new THREE.Color('#070a14'),
        fog: new THREE.Color('#1c2334'), sky: new THREE.Color('#4a5c84'),
        asphalt: new THREE.Color('#161b26'), plaza: new THREE.Color('#20252f'),
        lamp: new THREE.Color('#5c4520'),
      },
    }

    const uniforms = {
      uNight: { value: night ? 1 : 0 },
      uTime: { value: 0 },
      uFogDensity: { value: 0.0027 },
      uFogColor: { value: new THREE.Color() },
      uSkyTint: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0.42, 0.78, 0.46).normalize() },
      uSunColor: { value: new THREE.Color('#ffe6c4') },
      uWallDay: { value: new THREE.Color('#9aa2ad') },
      uWallNight: { value: new THREE.Color('#39424f') },
      uNightFill: { value: new THREE.Color('#4a5c84') },
      uWindowWarm: { value: new THREE.Color('#ffcb7a') },
      uWindowCool: { value: new THREE.Color('#8fd0ff') },
      uGlassDay: { value: new THREE.Color('#4c5f7a') },
      uAsphalt: { value: new THREE.Color() },
      uPlaza: { value: new THREE.Color() },
      uLine: { value: new THREE.Color('#c9c2a8') },
      uLampGlow: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uPixelRatio: { value: pixelRatio },
    }

    // --- 하늘: 큰 구 안쪽에 그린 수직 그라디언트.
    const skyGeo = new THREE.SphereGeometry(1800, 24, 12)
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { uHorizon: uniforms.uHorizon, uZenith: uniforms.uZenith },
      side: THREE.BackSide,
      depthWrite: false,
    })
    scene.add(new THREE.Mesh(skyGeo, skyMat))

    // --- 지면: 도로 격자를 셰이더가 직접 그린다 (텍스처 없음).
    const groundGeo = new THREE.PlaneGeometry(EXTENT * 3.2, EXTENT * 3.2)
    const groundMat = new THREE.ShaderMaterial({
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      uniforms,
    })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    scene.add(ground)

    // --- 건물: 단위 박스 하나를 인스턴싱해 도시 전체를 드로우콜 한 번에 그린다.
    const boxGeo = new THREE.BoxGeometry(1, 1, 1)
    const scales = new Float32Array(MAX_TIERS * 3)
    const seeds = new Float32Array(MAX_TIERS)
    const tints = new Float32Array(MAX_TIERS)
    boxGeo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 3))
    boxGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
    boxGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 1))

    const buildingMat = new THREE.ShaderMaterial({
      vertexShader: BUILDING_VERT,
      fragmentShader: BUILDING_FRAG,
      uniforms,
    })
    const city = new THREE.InstancedMesh(boxGeo, buildingMat, MAX_TIERS)
    city.frustumCulled = false // 도시 전체가 한 덩어리라 잘라낼 것이 없다
    scene.add(city)

    const dummy = new THREE.Object3D()
    const buffers = {
      matrix: city.instanceMatrix.array,
      scales, seeds, tints, dummy,
    }

    // --- 차량 빛점
    const carPos = new Float32Array(CARS * 3)
    const carCol = new Float32Array(CARS * 3)
    const cars = {
      axis: new Uint8Array(CARS),
      lane: new Float32Array(CARS),
      pos: new Float32Array(CARS),
      dir: new Float32Array(CARS),
      speed: new Float32Array(CARS),
      color: carCol,
    }
    const carGeo = new THREE.BufferGeometry()
    carGeo.setAttribute('position', new THREE.BufferAttribute(carPos, 3))
    carGeo.setAttribute('aColor', new THREE.BufferAttribute(carCol, 3))
    const carMat = new THREE.ShaderMaterial({
      vertexShader: CAR_VERT,
      fragmentShader: CAR_FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
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

    // --- 시점: 도시 위를 도는 완만한 비행 + 드래그 시점 + 휠 고도.
    let nightTarget = night ? 1 : 0
    let flight = 0
    let altitude = 124
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
      pitch -= (e.clientY - py) * 0.0022
      pitch = Math.max(-0.9, Math.min(0.5, pitch))
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
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const clock = new THREE.Clock()
    const eye = new THREE.Vector3()
    const look = new THREE.Vector3()
    const R = 168

    // 비행 경로: 반지름이 서로 다른 두 원을 겹쳐 같은 자리를 반복하지 않는다.
    const pathAt = (s, out) => out.set(
      Math.sin(s * 0.052) * R + Math.sin(s * 0.019) * R * 0.55,
      0,
      Math.cos(s * 0.041) * R + Math.cos(s * 0.013) * R * 0.45,
    )

    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      // 탭 복귀 같은 스톨에서 도시가 순간이동하지 않도록 프레임 간격을 자른다.
      const dt = Math.min(clock.getDelta(), 0.05)
      uniforms.uTime.value += dt

      if (!reduced) flight += dt

      pathAt(flight, eye)
      eye.y = altitude
      pathAt(flight + 6, look)
      look.y = altitude * 0.42
      camera.position.copy(eye)
      camera.lookAt(look)
      camera.rotateY(yaw)
      camera.rotateX(pitch)

      // 차량 이동: 도로를 따라 흐르고 끝에 닿으면 반대편에서 다시 들어온다.
      for (let i = 0; i < CARS; i++) {
        let p = cars.pos[i] + cars.dir[i] * cars.speed[i] * (reduced ? 0 : dt)
        if (p > HALF) p -= EXTENT
        else if (p < -HALF) p += EXTENT
        cars.pos[i] = p
        const idx = i * 3
        if (cars.axis[i] === 0) {
          carPos[idx] = p
          carPos[idx + 2] = cars.lane[i]
        } else {
          carPos[idx] = cars.lane[i]
          carPos[idx + 2] = p
        }
        carPos[idx + 1] = 0.9
      }
      carGeo.attributes.position.needsUpdate = true

      // 낮/밤 보간
      const k = 1 - Math.pow(0.02, dt)
      uniforms.uNight.value += (nightTarget - uniforms.uNight.value) * k
      const t = uniforms.uNight.value
      const d = PALETTE.day
      const nn = PALETTE.night
      uniforms.uFogColor.value.copy(d.fog).lerp(nn.fog, t)
      uniforms.uSkyTint.value.copy(d.sky).lerp(nn.sky, t)
      uniforms.uAsphalt.value.copy(d.asphalt).lerp(nn.asphalt, t)
      uniforms.uPlaza.value.copy(d.plaza).lerp(nn.plaza, t)
      uniforms.uLampGlow.value.copy(d.lamp).lerp(nn.lamp, t)
      uniforms.uHorizon.value.copy(d.horizon).lerp(nn.horizon, t)
      uniforms.uZenith.value.copy(d.zenith).lerp(nn.zenith, t)

      renderer.render(scene, camera)
    }
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
      skyGeo.dispose()
      skyMat.dispose()
      groundGeo.dispose()
      groundMat.dispose()
      boxGeo.dispose()
      buildingMat.dispose()
      carGeo.dispose()
      carMat.dispose()
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
