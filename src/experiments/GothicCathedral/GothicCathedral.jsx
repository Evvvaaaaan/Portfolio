import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { buildCathedral } from './scene/cathedral.js'
import '../shared/exp.css'

// 규칙에서 자라는 대성당. 지오메트리는 build/cathedral.js가 만들고, 여기서는
// 빛을 맡는다 — 해의 각도, 스테인드글라스가 만드는 색 광선, 그리고 건물이
// 땅에서 솟아오르는 시공 애니메이션.

const mulberry32 = (seed) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PALETTES = [
  ['#c2352f', '#2f5bc4', '#2f9c6a', '#e0a52e', '#8a4bb8'],
  ['#d94f3d', '#2b6fb5', '#f0c04a', '#4aa88a', '#b8455f'],
  ['#8f2f4a', '#3660b8', '#c9a227', '#2f8f7a', '#6a3fa0'],
]

// 빛기둥: 창 개구부를 태양 방향으로 밀어낸 각기둥. 굴절이나 볼륨 렌더링 없이
// 가산 합성만으로 "먼지 속을 지나는 빛"이 된다. 끝으로 갈수록 옅어지도록
// 정점 알파를 직접 넣는다.
const SHAFT_VERT = /* glsl */ `
  attribute float aFade;
  varying float vFade;
  void main() {
    vFade = aFade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SHAFT_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uStrength;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(uColor * uStrength * vFade, vFade * uStrength);
  }
`

// 창 사각형을 태양 방향으로 밀어 만든 기둥. 옆면 네 장이면 충분하다 —
// 안쪽에서 보든 밖에서 보든 실루엣이 같다.
function shaftGeometry(win, sunDir, length) {
  const half = win.width / 2
  const up = new THREE.Vector3(0, 1, 0)
  const across = win.axis === 'z'
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 0, 1)

  const corners = [
    win.center.clone().addScaledVector(across, -half).addScaledVector(up, -win.height / 2),
    win.center.clone().addScaledVector(across, half).addScaledVector(up, -win.height / 2),
    win.center.clone().addScaledVector(across, half).addScaledVector(up, win.height / 2),
    win.center.clone().addScaledVector(across, -half).addScaledVector(up, win.height / 2),
  ]
  const far = corners.map((c) => c.clone().addScaledVector(sunDir, length))

  const pos = []
  const fade = []
  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    const a2 = far[i]
    const b2 = far[(i + 1) % 4]
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, b2.x, b2.y, b2.z)
    pos.push(a.x, a.y, a.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z)
    fade.push(1, 1, 0, 1, 0, 0)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1))
  return geo
}

// 창이 바닥에 남기는 색 얼룩. 광선보다 이쪽이 "빛이 실제로 닿았다"는 신호를
// 더 강하게 준다 — 해 각도를 돌리면 이 얼룩이 바닥을 가로지른다.
function patchGeometry(win, sunDir) {
  if (Math.abs(sunDir.y) < 0.05) return null
  const half = win.width / 2
  const up = new THREE.Vector3(0, 1, 0)
  const across = win.axis === 'z' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
  const pos = []
  const fade = []
  const corners = [
    win.center.clone().addScaledVector(across, -half).addScaledVector(up, -win.height / 2),
    win.center.clone().addScaledVector(across, half).addScaledVector(up, -win.height / 2),
    win.center.clone().addScaledVector(across, half).addScaledVector(up, win.height / 2),
    win.center.clone().addScaledVector(across, -half).addScaledVector(up, win.height / 2),
  ].map((c) => {
    const t = (0.06 - c.y) / sunDir.y
    return c.clone().addScaledVector(sunDir, t)
  })
  const [a, b, c, d] = corners
  // 빗각이 커지면 사각형이 실처럼 눌린다 — 빛 얼룩이 아니라 선으로 보이므로 버린다.
  const e1 = a.distanceTo(b)
  const e2 = b.distanceTo(c)
  if (Math.max(e1, e2) / Math.max(Math.min(e1, e2), 0.001) > 9) return null
  pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  pos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z)
  for (let i = 0; i < 6; i++) fade.push(1)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1))
  return geo
}

export default function GothicCathedral() {
  const wrapRef = useRef(null)
  const apiRef = useRef(null)
  const [seed, setSeed] = useState(() => (Math.random() * 0xffff) | 0)
  const [sunAz, setSunAz] = useState(0.62)
  const [inside, setInside] = useState(true)
  const [building, setBuilding] = useState(true)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return undefined

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, wrap.clientWidth / wrap.clientHeight, 0.3, 900)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(wrap.clientWidth, wrap.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    // 시공 애니메이션은 전역 클리핑면 하나로 만든다 — 부재마다 상태를 들고
    // 있을 필요 없이, 잘리는 높이만 올리면 건물이 땅에서 자라난다.
    const buildPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)
    renderer.clippingPlanes = [buildPlane]
    wrap.appendChild(renderer.domElement)

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    // 유리만 밝게 빛나면 되므로 threshold를 높여 돌은 건드리지 않는다.
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(wrap.clientWidth, wrap.clientHeight), 0.42, 0.7, 0.86,
    )
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    const disposables = []

    // 하늘: 위아래 그라디언트 한 장. 돌의 색이 이 하늘에서 나온다.
    const skyGeo = new THREE.SphereGeometry(600, 24, 16)
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color('#213a5e') },
        uBottom: { value: new THREE.Color('#c9a17a') },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `precision highp float; uniform vec3 uTop; uniform vec3 uBottom; varying vec3 vDir;
        void main(){ float t = clamp(vDir.y * 1.3 + 0.35, 0.0, 1.0); gl_FragColor = vec4(mix(uBottom, uTop, pow(t, 0.8)), 1.0); }`,
      side: THREE.BackSide,
      depthWrite: false,
      clippingPlanes: [], // 하늘은 시공 클리핑에서 제외한다
    })
    scene.add(new THREE.Mesh(skyGeo, skyMat))
    disposables.push(skyGeo, skyMat)

    scene.add(new THREE.HemisphereLight(0x9ab6dd, 0x8a755a, 1.2))
    const sun = new THREE.DirectionalLight(0xffe6c2, 3.1)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 260
    const shadowCam = sun.shadow.camera
    shadowCam.left = -70; shadowCam.right = 70; shadowCam.top = 70; shadowCam.bottom = -70
    scene.add(sun)
    scene.add(sun.target)
    // 실내가 완전히 검지 않도록 아주 약한 채움광 — 촛불 정도의 온도.
    const warmFill = new THREE.PointLight(0xffb066, 45, 110, 2)
    scene.add(warmFill)

    // ── 성당 본체 (시드로 다시 짓는다)
    let cathedral = null
    const shaftGroup = new THREE.Group()
    scene.add(shaftGroup)
    const shaftMats = []

    const clearShafts = () => {
      for (const child of [...shaftGroup.children]) {
        child.geometry.dispose()
        shaftGroup.remove(child)
      }
      for (const m of shaftMats) m.dispose()
      shaftMats.length = 0
    }

    let sunDir = new THREE.Vector3()
    let buildY = 0

    const rebuildShafts = () => {
      clearShafts()
      if (!cathedral) return
      for (const win of cathedral.windows) {
        // 해를 등진 창은 빛이 들어오지 않는다.
        const inward = win.axis === 'z'
          ? new THREE.Vector3(0, 0, -win.sign)
          : new THREE.Vector3(-win.sign, 0, 0)
        if (sunDir.dot(inward) < 0.08) continue

        const mat = new THREE.ShaderMaterial({
          vertexShader: SHAFT_VERT,
          fragmentShader: SHAFT_FRAG,
          uniforms: {
            uColor: { value: new THREE.Color(win.color) },
            uStrength: { value: 0 },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          clippingPlanes: [],
        })
        shaftMats.push(mat)

        const beam = new THREE.Mesh(shaftGeometry(win, sunDir, win.rose ? 70 : 46), mat)
        beam.userData = { win, kind: 'beam' }
        shaftGroup.add(beam)

        const patchGeo = patchGeometry(win, sunDir)
        if (patchGeo) {
          const patch = new THREE.Mesh(patchGeo, mat)
          patch.userData = { win, kind: 'patch' }
          shaftGroup.add(patch)
        }
      }
    }

    const rebuild = (s) => {
      if (cathedral) {
        scene.remove(cathedral.group)
        cathedral.dispose()
      }
      const rng = mulberry32(s)
      cathedral = buildCathedral({
        bays: 6 + Math.floor(rng() * 3),
        bayLen: 6.8 + rng() * 1.2,
        naveW: 12 + rng() * 3,
        aisleW: 6 + rng() * 1.4,
        pierH: 14 + rng() * 3,
        vaultRise: 0.55 + rng() * 0.22,
        palette: PALETTES[Math.floor(rng() * PALETTES.length)],
        rng,
      })
      scene.add(cathedral.group)
      rebuildShafts()
    }

    const applySun = (az) => {
      const el = 0.62
      sunDir.set(-Math.cos(az) * Math.cos(el), -Math.sin(el), -Math.sin(az) * Math.cos(el)).normalize()
      const L = cathedral?.dims.L ?? 50
      sun.position.set(L / 2, 0, 0).addScaledVector(sunDir, -170)
      sun.target.position.set(L / 2, 12, 0)
      sun.target.updateMatrixWorld()
      rebuildShafts()
    }

    rebuild(seed)
    applySun(sunAz)

    // ── 시점: 드래그 궤도 + 휠 거리. 실내/실외는 목표점과 거리로 전환한다.
    let yaw = Math.PI / 2
    let pitch = 0.14
    let dist = 95
    let walkX = 9
    let targetInside = inside
    let dragging = false
    let px = 0
    let py = 0
    const el = renderer.domElement
    const onDown = (e) => { dragging = true; px = e.clientX; py = e.clientY }
    const onMove = (e) => {
      if (!dragging) return
      yaw -= (e.clientX - px) * 0.005
      // 실내는 1인칭 시선이라 위로 끌면 위를 봐야 하고, 실외는 대상을 끄는
      // 궤도라 반대다. 같은 부호를 쓰면 한쪽이 반드시 거꾸로 느껴진다.
      const dy = (e.clientY - py) * 0.004
      pitch = Math.max(-1.2, Math.min(1.35, pitch + (targetInside ? -dy : dy)))
      px = e.clientX
      py = e.clientY
    }
    const onUp = () => { dragging = false }
    const onWheel = (e) => {
      e.preventDefault()
      // 실내에서는 신랑을 따라 걷고, 실외에서는 건물과의 거리를 조절한다.
      if (targetInside) walkX += e.deltaY * -0.03
      else dist = Math.max(45, Math.min(260, dist + e.deltaY * 0.12))
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
    let buildTarget = 1
    let buildProgress = reduced ? 1 : 0
    let autoBuild = true
    const camPos = new THREE.Vector3()
    const camAim = new THREE.Vector3()
    let raf = 0

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(clock.getDelta(), 0.05)

      const dims = cathedral.dims
      const fullH = dims.towerH + 30

      if (autoBuild && buildProgress < buildTarget) {
        buildProgress = Math.min(buildTarget, buildProgress + dt * 0.17)
      }
      buildY = fullH * buildProgress
      buildPlane.constant = buildY

      // 빛기둥은 창이 다 세워진 뒤에야 켜진다.
      for (const child of shaftGroup.children) {
        const win = child.userData.win
        const on = THREE.MathUtils.smoothstep(buildY, win.revealY, win.revealY + 3)
        const base = child.userData.kind === 'patch' ? 0.13 : 0.05
        child.material.uniforms.uStrength.value = on * base * (targetInside ? 1 : 0.7)
        child.visible = on > 0.01
      }

      if (targetInside) {
        // 신랑 한가운데를 걷는다. 성당 내부는 궤도로 도는 것보다 서서 올려다볼
        // 때 비례가 읽힌다 — 기둥이 시야를 지나가고 볼트가 머리 위로 닫힌다.
        walkX = Math.max(3, Math.min(dims.L - 3, walkX))
        camPos.set(walkX, 6.5, 0)
        camera.position.lerp(camPos, reduced ? 1 : 1 - Math.pow(0.004, dt))
        camAim.set(
          camera.position.x + Math.sin(yaw) * Math.cos(pitch),
          camera.position.y + Math.sin(pitch),
          camera.position.z + Math.cos(yaw) * Math.cos(pitch),
        )
        camera.lookAt(camAim)
      } else {
        camAim.set(dims.L * 0.5, dims.naveCrown * 0.42, 0)
        camPos.set(
          camAim.x + Math.sin(yaw) * Math.cos(pitch) * dist,
          camAim.y + Math.sin(pitch) * dist + 14,
          camAim.z + Math.cos(yaw) * Math.cos(pitch) * dist,
        )
        camera.position.lerp(camPos, reduced ? 1 : 1 - Math.pow(0.004, dt))
        camera.lookAt(camAim)
      }

      warmFill.position.set(dims.L * 0.5, 10, 0)
      warmFill.intensity = targetInside ? 60 : 12

      composer.render()
    }
    tick()

    apiRef.current = {
      rebuild: (s) => { rebuild(s); applySun(sunAz) },
      setSun: (az) => applySun(az),
      setInside: (v) => {
        targetInside = v
        if (v) { yaw = Math.PI / 2; pitch = 0.14; walkX = 9 }
        else { yaw = 2.5; pitch = 0.2; dist = 95 }
      },
      setBuilding: (v) => {
        autoBuild = v
        buildTarget = 1
        if (!v) buildProgress = 1
      },
      restart: () => { buildProgress = 0; autoBuild = true },
    }

    return () => {
      apiRef.current = null
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('wheel', onWheel)
      clearShafts()
      cathedral?.dispose()
      for (const d of disposables) d.dispose?.()
      bloom.dispose()
      composer.dispose()
      renderer.dispose()
      wrap.removeChild(renderer.domElement)
    }
    // 시드·해·시점은 apiRef로 넘긴다 — 씬을 다시 세우지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { apiRef.current?.rebuild(seed) }, [seed])
  useEffect(() => { apiRef.current?.setSun(sunAz) }, [sunAz])
  useEffect(() => { apiRef.current?.setInside(inside) }, [inside])
  useEffect(() => { apiRef.current?.setBuilding(building) }, [building])

  return (
    <div className="exp-wrap" ref={wrapRef}>
      <span className="exp-hint">
        드래그로 둘러보고 · 휠로 거리 · 해를 돌리면 스테인드글라스가 바닥을 가로지릅니다
      </span>
      <div className="exp-controls">
        <button
          className="exp-btn"
          type="button"
          onClick={() => { setBuilding(true); apiRef.current?.restart() }}
        >
          다시 짓기
        </button>
        <button className="exp-btn" type="button" onClick={() => setSeed((Math.random() * 0xffff) | 0)}>
          새 성당
        </button>
        <input
          className="exp-range"
          type="range"
          min="0"
          max="360"
          value={Math.round((sunAz * 180) / Math.PI)}
          aria-label="해의 방위"
          style={{ width: 130 }}
          onChange={(e) => setSunAz((Number(e.target.value) * Math.PI) / 180)}
        />
        <button
          className={`exp-btn${inside ? ' active' : ''}`}
          type="button"
          onClick={() => setInside((v) => !v)}
        >
          {inside ? '내부' : '외부'}
        </button>
      </div>
    </div>
  )
}
