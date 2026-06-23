import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import '../shared/exp.css'
import './SolarSystem.css'

// ── 물리 단위: 거리 AU, 시간 day, 질량 태양질량 ──
// GM(태양) = 4π²/365.25² → 지구가 1 AU에서 정확히 365.25일에 공전
const GM0 = (4 * Math.PI * Math.PI) / (365.25 * 365.25)
const AU_PER_DAY_TO_KMS = 1731.46 // 1 AU/day = 1731.46 km/s
const DT = 0.2                    // 적분 간격 (일)

// 실제 천문 데이터: a(궤도 긴반지름 AU), e(이심률), m(태양질량 단위)
const BODIES = [
  {
    id: 'sun', name: '태양', en: 'Sun', color: 0xffc94d, vr: 2.6, m: 1,
    desc: '태양계 전체 질량의 99.86%를 차지하는 항성. 중심핵에서 매초 약 6억 톤의 수소를 헬륨으로 융합하며 그 에너지로 행성들을 비춥니다. 모든 행성은 태양의 중력(만유인력)에 붙들려 공전합니다.',
    rows: [['반지름', '696,340 km'], ['질량', '1.989×10³⁰ kg'], ['표면 온도', '약 5,500°C'], ['나이', '약 46억 년']],
  },
  {
    id: 'mercury', name: '수성', en: 'Mercury', color: 0x9c8f86, vr: 0.55, m: 1.66e-7, a: 0.387, e: 0.206, startDeg: 25,
    desc: '태양에 가장 가까운 행성. 대기가 거의 없어 낮에는 430°C, 밤에는 -180°C에 이르는 극단적인 일교차를 보입니다. 이심률이 0.206으로 행성 중 가장 찌그러진 타원 궤도를 돕니다.',
    rows: [['평균 거리', '0.39 AU'], ['이심률', '0.206'], ['반지름', '2,440 km'], ['질량', '3.30×10²³ kg'], ['공전 주기', '88일'], ['평균 속도', '47.4 km/s']],
  },
  {
    id: 'venus', name: '금성', en: 'Venus', color: 0xe6c07a, vr: 0.85, m: 2.45e-6, a: 0.723, e: 0.007, startDeg: 80,
    desc: '두꺼운 이산화탄소 대기의 온실효과로 표면 온도가 465°C에 달하는, 태양계에서 가장 뜨거운 행성. 자전 방향이 다른 행성과 반대이며 자전(243일)이 공전(225일)보다 느립니다.',
    rows: [['평균 거리', '0.72 AU'], ['이심률', '0.007'], ['반지름', '6,052 km'], ['질량', '4.87×10²⁴ kg'], ['공전 주기', '225일'], ['평균 속도', '35.0 km/s']],
  },
  {
    id: 'earth', name: '지구', en: 'Earth', color: 0x4d8fd1, vr: 0.9, m: 3.0e-6, a: 1.0, e: 0.017, startDeg: 140,
    desc: '현재까지 생명이 확인된 유일한 행성. 액체 상태의 물과 자기장, 적절한 대기를 갖추고 있습니다. 태양에서 평균 1 AU(약 1억 5천만 km) 떨어져 365.25일에 한 바퀴 공전합니다.',
    rows: [['평균 거리', '1.00 AU'], ['이심률', '0.017'], ['반지름', '6,371 km'], ['질량', '5.97×10²⁴ kg'], ['공전 주기', '365일'], ['평균 속도', '29.8 km/s']],
  },
  {
    id: 'mars', name: '화성', en: 'Mars', color: 0xc1592f, vr: 0.7, m: 3.23e-7, a: 1.524, e: 0.093, startDeg: 200,
    desc: '산화철 먼지로 붉게 보이는 행성. 태양계에서 가장 큰 화산(올림푸스 몬스, 높이 21km)과 협곡이 있으며, 과거에 액체 상태의 물이 흘렀던 흔적이 발견되었습니다.',
    rows: [['평균 거리', '1.52 AU'], ['이심률', '0.093'], ['반지름', '3,390 km'], ['질량', '6.42×10²³ kg'], ['공전 주기', '687일'], ['평균 속도', '24.1 km/s']],
  },
  {
    id: 'jupiter', name: '목성', en: 'Jupiter', color: 0xc9a06b, vr: 2.1, m: 9.55e-4, a: 5.203, e: 0.048, startDeg: 290,
    desc: '태양계에서 가장 큰 행성. 질량이 나머지 행성을 모두 합친 것의 2.5배라서 태양조차 목성의 인력에 미세하게 흔들립니다(시뮬레이션에도 반영됨). 대적점은 300년 넘게 지속되는 폭풍입니다.',
    rows: [['평균 거리', '5.20 AU'], ['이심률', '0.048'], ['반지름', '69,911 km'], ['질량', '1.90×10²⁷ kg'], ['공전 주기', '11.9년'], ['평균 속도', '13.1 km/s']],
  },
  {
    id: 'saturn', name: '토성', en: 'Saturn', color: 0xd8c08a, vr: 1.8, m: 2.86e-4, a: 9.537, e: 0.054, startDeg: 340, ring: true,
    desc: '얼음과 암석 조각으로 이루어진 거대한 고리를 가진 행성. 밀도가 물보다 낮아 거대한 바다가 있다면 뜰 수 있을 정도입니다. 80개가 넘는 위성을 거느리고 있습니다.',
    rows: [['평균 거리', '9.54 AU'], ['이심률', '0.054'], ['반지름', '58,232 km'], ['질량', '5.68×10²⁶ kg'], ['공전 주기', '29.5년'], ['평균 속도', '9.7 km/s']],
  },
  {
    id: 'uranus', name: '천왕성', en: 'Uranus', color: 0x8fd1d4, vr: 1.3, m: 4.37e-5, a: 19.19, e: 0.047, startDeg: 60,
    desc: '자전축이 98° 기울어져 사실상 누워서 공전하는 얼음 거인. 대기의 메탄이 붉은 빛을 흡수해 청록색으로 보입니다. 한 계절이 약 21년씩 지속됩니다.',
    rows: [['평균 거리', '19.2 AU'], ['이심률', '0.047'], ['반지름', '25,362 km'], ['질량', '8.68×10²⁵ kg'], ['공전 주기', '84년'], ['평균 속도', '6.8 km/s']],
  },
  {
    id: 'neptune', name: '해왕성', en: 'Neptune', color: 0x4666d1, vr: 1.25, m: 5.15e-5, a: 30.07, e: 0.009, startDeg: 180,
    desc: '관측이 아니라 수학적 계산(천왕성 궤도의 섭동)으로 먼저 발견된 행성. 시속 2,100km의 태양계에서 가장 빠른 바람이 붑니다. 태양 빛이 도달하는 데 4시간이 걸립니다.',
    rows: [['평균 거리', '30.1 AU'], ['이심률', '0.009'], ['반지름', '24,622 km'], ['질량', '1.02×10²⁶ kg'], ['공전 주기', '165년'], ['평균 속도', '5.4 km/s']],
  },
]

// 시각화 거리 압축: 실제 비율(해왕성=지구의 30배)은 화면에 담기 어려워 √r로 압축
const renderRadius = (rAU) => 12 * Math.sqrt(rAU)

function makeGlowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,235,180,0.9)')
  g.addColorStop(0.25, 'rgba(255,195,90,0.45)')
  g.addColorStop(0.6, 'rgba(255,150,50,0.12)')
  g.addColorStop(1, 'rgba(255,120,30,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

function makeLabelTexture(text) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const ctx = c.getContext('2d')
  ctx.font = '500 30px "SUIT", "Pretendard", monospace, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.shadowColor = 'rgba(0,0,0,0.8)'
  ctx.shadowBlur = 6
  ctx.fillText(text, 128, 32)
  return new THREE.CanvasTexture(c)
}

const speedFromRaw = (raw) => Math.pow(raw / 100, 2) * 1460 // 일/초 (최대 4년/초)
const speedLabel = (d) => {
  if (d <= 0) return '정지'
  if (d < 1) return `${(d * 24).toFixed(1)}시간/초`
  if (d < 365) return `${Math.round(d)}일/초`
  return `${(d / 365.25).toFixed(1)}년/초`
}

export default function SolarSystem() {
  const wrapRef = useRef()
  const [selId, setSelId] = useState(null)
  const [speedRaw, setSpeedRaw] = useState(35)
  const [gMul, setGMul] = useState(1)
  const [bright, setBright] = useState(1)
  const [paused, setPaused] = useState(false)

  const paramsRef = useRef({ speed: speedFromRaw(35), g: 1, bright: 1, paused: false })
  const selRef = useRef(null)
  const apiRef = useRef({})
  const elapsedRef = useRef()
  const liveDistRef = useRef()
  const liveSpeedRef = useRef()
  const liveStateRef = useRef()

  useEffect(() => {
    const wrap = wrapRef.current
    let raf

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, wrap.clientWidth / wrap.clientHeight, 0.1, 4000)
    camera.position.set(0, 62, 98)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setClearColor(0x010104)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(wrap.clientWidth, wrap.clientHeight)
    wrap.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.minDistance = 8
    controls.maxDistance = 600

    scene.add(new THREE.AmbientLight(0x223344, 0.55))
    const sunLight = new THREE.PointLight(0xfff0d5, 1.7, 0, 0)
    scene.add(sunLight)

    // 황도면 참고 그리드
    const grid = new THREE.PolarGridHelper(95, 8, 6, 64, 0x1a2440, 0x131b30)
    grid.material.transparent = true
    grid.material.opacity = 0.4
    scene.add(grid)

    // 배경 별
    const starN = 1600
    const starPos = new Float32Array(starN * 3)
    for (let i = 0; i < starN; i++) {
      const v = new THREE.Vector3(
        Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1
      ).normalize().multiplyScalar(500 + Math.random() * 900)
      starPos[i * 3] = v.x; starPos[i * 3 + 1] = v.y; starPos[i * 3 + 2] = v.z
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    const starMat = new THREE.PointsMaterial({ color: 0xc8d4ea, size: 1.6, transparent: true, opacity: 0.55, sizeAttenuation: false })
    scene.add(new THREE.Points(starGeo, starMat))

    const glowTex = makeGlowTexture()
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    sunGlow.scale.setScalar(22)
    scene.add(sunGlow)

    // ── 천체 생성 ──
    const TRAIL_MAX = 420
    const bodies = BODIES.map((def) => {
      const isSun = def.id === 'sun'
      const mat = isSun
        ? new THREE.MeshBasicMaterial({ color: def.color })
        : new THREE.MeshLambertMaterial({ color: def.color })
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.vr, 32, 32), mat)
      scene.add(mesh)

      if (def.ring) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(def.vr * 1.4, def.vr * 2.3, 48),
          new THREE.MeshBasicMaterial({ color: 0xcdb27e, side: THREE.DoubleSide, transparent: true, opacity: 0.42 })
        )
        ring.rotation.x = Math.PI / 2 - 0.42
        mesh.add(ring)
      }

      // 클릭 판정용 투명 히트 영역 (작은 행성도 쉽게 선택되도록)
      const pick = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(def.vr * 2.6, 2.2), 8, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      )
      pick.userData.id = def.id
      scene.add(pick)

      const labelTex = makeLabelTexture(def.name)
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, opacity: 0.85, depthWrite: false }))
      label.scale.set(7, 1.75, 1)
      scene.add(label)

      let trail = null
      if (!isSun) {
        const trailArr = new Float32Array(TRAIL_MAX * 3)
        const trailGeo = new THREE.BufferGeometry()
        trailGeo.setAttribute('position', new THREE.BufferAttribute(trailArr, 3))
        trailGeo.setDrawRange(0, 0)
        const line = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: def.color, transparent: true, opacity: 0.45 }))
        line.frustumCulled = false
        scene.add(line)
        trail = { arr: trailArr, geo: trailGeo, count: 0, last: new THREE.Vector3(1e9, 0, 0) }
      }

      return {
        def, m: def.m,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        mesh, pick, label, trail,
      }
    })

    // 초기 조건: 각 행성을 근일점에 배치, v = √(GM(1+e)/(a(1-e))) → 실제 타원 궤도
    const initBodies = () => {
      const mom = new THREE.Vector3()
      for (const b of bodies) {
        if (b.def.id === 'sun') continue
        const { a, e, startDeg } = b.def
        const th = (startDeg * Math.PI) / 180
        const rp = a * (1 - e)
        const vp = Math.sqrt((GM0 * (1 + e)) / (a * (1 - e)))
        b.pos.set(rp * Math.cos(th), 0, rp * Math.sin(th))
        b.vel.set(-vp * Math.sin(th), 0, vp * Math.cos(th))
        mom.addScaledVector(b.vel, b.m)
      }
      const sun = bodies[0]
      sun.pos.set(0, 0, 0)
      sun.vel.copy(mom).multiplyScalar(-1) // 전체 운동량 0 → 계가 떠내려가지 않음
      simDays = 0
    }

    const clearTrails = () => {
      for (const b of bodies) {
        if (!b.trail) continue
        b.trail.count = 0
        b.trail.geo.setDrawRange(0, 0)
        b.trail.last.set(1e9, 0, 0)
      }
    }

    apiRef.current = { reset: () => { initBodies(); clearTrails() }, clearTrails }

    // ── N체 중력 적분 (leapfrog KDK) — 모든 천체 쌍의 만유인력 포함 ──
    const n = bodies.length
    const accs = bodies.map(() => new THREE.Vector3())
    const d = new THREE.Vector3()
    const computeAcc = (G) => {
      for (let i = 0; i < n; i++) accs[i].set(0, 0, 0)
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          d.subVectors(bodies[j].pos, bodies[i].pos)
          const r2 = d.lengthSq() + 1e-8
          const inv = G / (Math.sqrt(r2) * r2)
          accs[i].addScaledVector(d, inv * bodies[j].m)
          accs[j].addScaledVector(d, -inv * bodies[i].m)
        }
      }
    }
    const step = (dt, G) => {
      computeAcc(G)
      for (let i = 0; i < n; i++) {
        bodies[i].vel.addScaledVector(accs[i], dt / 2)
        bodies[i].pos.addScaledVector(bodies[i].vel, dt)
      }
      computeAcc(G)
      for (let i = 0; i < n; i++) bodies[i].vel.addScaledVector(accs[i], dt / 2)
    }

    let simDays = 0
    let pendingDays = 0
    initBodies()

    // ── 클릭으로 행성 선택 ──
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let downX = 0, downY = 0
    const onDown = (e) => { downX = e.clientX; downY = e.clientY }
    const onUp = (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObjects(bodies.map(b => b.pick))
      if (hits.length) {
        const id = hits[0].object.userData.id
        selRef.current = id
        setSelId(id)
      }
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const renderPos = new THREE.Vector3()
    const targetPos = new THREE.Vector3()
    const clock = new THREE.Clock()

    const tick = () => {
      const frameDt = Math.min(clock.getDelta(), 0.05)
      const { speed, g, bright: b, paused: isPaused } = paramsRef.current

      // 시간 배속만큼 시뮬레이션 진행 (프레임당 최대 600 스텝)
      if (!isPaused && speed > 0) {
        pendingDays = Math.min(pendingDays + speed * frameDt, 600 * DT)
        let steps = Math.floor(pendingDays / DT)
        pendingDays -= steps * DT
        const G = GM0 * g
        while (steps-- > 0) {
          step(DT, G)
          simDays += DT
        }
      }

      // 천체 렌더 위치 갱신 (√r 압축 좌표계)
      for (const body of bodies) {
        const r = body.pos.length()
        if (r > 1e-6) {
          renderPos.copy(body.pos).multiplyScalar(renderRadius(r) / r)
        } else {
          renderPos.set(0, 0, 0)
        }
        body.mesh.position.copy(renderPos)
        body.pick.position.copy(renderPos)
        body.label.position.set(renderPos.x, renderPos.y + body.def.vr + 2.1, renderPos.z)

        if (body.trail && renderPos.distanceTo(body.trail.last) > 0.5) {
          const tr = body.trail
          if (tr.count >= TRAIL_MAX) {
            tr.arr.copyWithin(0, 3)
            tr.count = TRAIL_MAX - 1
          }
          tr.arr[tr.count * 3] = renderPos.x
          tr.arr[tr.count * 3 + 1] = renderPos.y
          tr.arr[tr.count * 3 + 2] = renderPos.z
          tr.count++
          tr.last.copy(renderPos)
          tr.geo.attributes.position.needsUpdate = true
          tr.geo.setDrawRange(0, tr.count)
        }
      }

      // 태양 밝기
      sunLight.intensity = 1.7 * b
      sunGlow.scale.setScalar(22 * (0.55 + b * 0.45))
      sunGlow.material.opacity = Math.min(1, 0.55 + b * 0.4)
      sunGlow.position.copy(bodies[0].mesh.position)
      sunLight.position.copy(bodies[0].mesh.position)

      // 선택된 천체로 카메라 타겟 이동 + 실시간 수치 갱신
      const sel = bodies.find(x => x.def.id === selRef.current)
      targetPos.copy(sel ? sel.mesh.position : new THREE.Vector3())
      controls.target.lerp(targetPos, 0.06)

      if (sel && sel.def.id !== 'sun' && liveDistRef.current) {
        const distAU = sel.pos.distanceTo(bodies[0].pos)
        const relV = sel.vel.distanceTo(bodies[0].vel) * AU_PER_DAY_TO_KMS
        liveDistRef.current.textContent = `${distAU.toFixed(3)} AU`
        liveSpeedRef.current.textContent = `${relV.toFixed(1)} km/s`
        if (liveStateRef.current) {
          // 궤도 에너지로 탈출 여부 판정: E = v²/2 − GM/r
          const E = (sel.vel.distanceToSquared(bodies[0].vel)) / 2 - (GM0 * g) / distAU
          liveStateRef.current.textContent = E >= 0 ? '⚠ 탈출 궤도 (쌍곡선)' : '안정 궤도 (타원)'
          liveStateRef.current.className = `ss-state ${E >= 0 ? 'escape' : 'stable'}`
        }
      }

      if (elapsedRef.current) {
        const years = Math.floor(simDays / 365.25)
        const days = Math.floor(simDays % 365.25)
        elapsedRef.current.textContent = `${years}년 ${days}일`
      }

      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      controls.dispose()
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          if (o.material.map) o.material.map.dispose()
          o.material.dispose()
        }
      })
      renderer.dispose()
      wrap.removeChild(renderer.domElement)
    }
  }, [])

  const sel = BODIES.find(b => b.id === selId)
  const speed = speedFromRaw(speedRaw)

  return (
    <div className="exp-wrap" ref={wrapRef}>
      <span className="exp-hint">행성을 클릭해 정보를 보고 · 드래그/휠로 시점을 움직여보세요</span>

      <div className="ss-controls">
        <div className="ss-ctl-row">
          <label>시간 배속</label>
          <input
            className="exp-range"
            type="range" min="0" max="100" value={speedRaw}
            onChange={e => {
              const v = +e.target.value
              setSpeedRaw(v)
              paramsRef.current.speed = speedFromRaw(v)
            }}
          />
          <span className="ss-ctl-val">{speedLabel(speed)}</span>
        </div>
        <div className="ss-ctl-row">
          <label>태양 인력</label>
          <input
            className="exp-range"
            type="range" min="0.25" max="4" step="0.05" value={gMul}
            onChange={e => {
              const v = +e.target.value
              setGMul(v)
              paramsRef.current.g = v
            }}
          />
          <span className="ss-ctl-val">×{gMul.toFixed(2)}</span>
        </div>
        <div className="ss-ctl-row">
          <label>태양 밝기</label>
          <input
            className="exp-range"
            type="range" min="0.2" max="3" step="0.05" value={bright}
            onChange={e => {
              const v = +e.target.value
              setBright(v)
              paramsRef.current.bright = v
            }}
          />
          <span className="ss-ctl-val">×{bright.toFixed(2)}</span>
        </div>
        {gMul !== 1 && (
          <p className="ss-ctl-note">
            {gMul < 0.5
              ? '인력이 절반 이하 — 행성들이 탈출 궤도로 흩어집니다'
              : gMul < 1
                ? '인력 감소 — 궤도가 바깥쪽으로 길어집니다'
                : '인력 증가 — 궤도가 안쪽으로 조여듭니다'}
          </p>
        )}
        <div className="ss-ctl-btns">
          <button onClick={() => { const p = !paused; setPaused(p); paramsRef.current.paused = p }}>
            {paused ? '▶ 재생' : '⏸ 일시정지'}
          </button>
          <button onClick={() => apiRef.current.reset?.()}>↺ 리셋</button>
          <button onClick={() => apiRef.current.clearTrails?.()}>✕ 궤적 지우기</button>
        </div>
        <div className="ss-elapsed">경과 시간 <span ref={elapsedRef}>0년 0일</span></div>
      </div>

      {sel && (
        <div className="ss-info" key={sel.id}>
          <button className="ss-info-close" onClick={() => { setSelId(null); selRef.current = null }}>×</button>
          <h3>{sel.name} <em>{sel.en}</em></h3>
          <p className="ss-info-desc">{sel.desc}</p>
          <dl className="ss-info-rows">
            {sel.rows.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          {sel.id !== 'sun' && (
            <div className="ss-live">
              <div className="ss-live-title">실시간 시뮬레이션</div>
              <dl className="ss-info-rows">
                <div><dt>태양과의 거리</dt><dd ref={liveDistRef}>—</dd></div>
                <div><dt>현재 공전 속도</dt><dd ref={liveSpeedRef}>—</dd></div>
              </dl>
              <div className="ss-state stable" ref={liveStateRef}>안정 궤도 (타원)</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
