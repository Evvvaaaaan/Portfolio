import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TilesRenderer, WGS84_RADIUS } from '3d-tiles-renderer'
import { GoogleCloudAuthPlugin, TilesFadePlugin, UpdateOnChangePlugin } from '3d-tiles-renderer/plugins'
import { loadLandDots } from './landDots.js'
import { latLonToDirection } from './sphereFrame.js'
import { computeFlightFrame } from './flightPath.js'
import { LANDMARKS } from './landmarks.js'
import landMaskUrl from '../../assets/earth-land-mask.png'
import '../shared/exp.css'
import './EarthExplorer.css'

const DEG = Math.PI / 180

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

// tiles 모드 랜드마크 탐색: 착지 대상(도시 지표점)을 중심으로 OrbitControls가
// 돈다. 드래그=대상 주위 회전, 휠=대상으로 다가가기/멀어지기. 지표 위
// TILES_LANDING_HEIGHT 고도에서 접선 방향으로 TILES_LANDING_BACK 물러난 지점에
// 착지해 건물을 비스듬히(약 30° 부감) 입체로 내려다본다. GlobeControls의
// 지표-근처 회전 폭주 없이 예측 가능하게 둘러볼 수 있다.
const TILES_LANDING_HEIGHT = 420 // 지표 위 고도(m)
const TILES_LANDING_BACK = 760 // 접선 방향으로 물러난 거리(m) → 약 30° 부감
const TILES_CLOSE_MIN = 45 // 착지 후 최소 줌 거리(대상에서 m) — 거의 거리 수준
const TILES_CLOSE_MAX = 220000 // 착지 후 최대 줌 거리(대상에서 m) — 광역 조망

const GLOBE_R = 1

function makeGlowTexture(size, color) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(c)
}

export default function EarthExplorer() {
  const wrapRef = useRef(null)
  const flyToRef = useRef(() => {})
  const flightRef = useRef(null) // { fromDir, toDir, startedAt, durationMs } | null
  const [activeLandmark, setActiveLandmark] = useState(null)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    const wrap = wrapRef.current
    let raf
    let cancelled = false
    const disposables = []

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, wrap.clientWidth / wrap.clientHeight, 0.01, 100)
    camera.position.set(0, 0.5, 2.6)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setClearColor(0x000000, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(wrap.clientWidth, wrap.clientHeight)
    wrap.appendChild(renderer.domElement)

    // 별필드
    const starTex = makeGlowTexture(32, 'rgba(255,255,255,1)')
    disposables.push(starTex)
    const STAR_COUNT = 2000
    const starPos = new Float32Array(STAR_COUNT * 3)
    for (let i = 0; i < STAR_COUNT; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(20 + Math.random() * 30)
      starPos[i * 3] = v.x
      starPos[i * 3 + 1] = v.y
      starPos[i * 3 + 2] = v.z
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    const starMat = new THREE.PointsMaterial({
      map: starTex, size: 0.12, transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })
    disposables.push(starGeo, starMat)
    scene.add(new THREE.Points(starGeo, starMat))

    // 폴백 지구본: 어두운 구체 + 육지 도트 매트릭스 (방명록과 같은 기법).
    // 타일 모드에서는 필요 없으므로 즉시 만들지 않고, 폴백이 실제로 필요할 때만
    // (키가 없을 때, 또는 타일 로드 실패로 전환될 때) buildFallbackGlobe()를
    // 호출한다.
    let globe = null
    let dotPoints = null
    const dotTex = makeGlowTexture(32, 'rgba(140,200,255,1)')
    disposables.push(dotTex)

    function buildFallbackGlobe() {
      if (globe) return // 이미 만들어져 있으면 중복 생성하지 않는다
      const globeGeo = new THREE.SphereGeometry(GLOBE_R, 48, 48)
      const globeMat = new THREE.MeshBasicMaterial({ color: 0x0a1420, transparent: true, opacity: 0.92 })
      disposables.push(globeGeo, globeMat)
      globe = new THREE.Mesh(globeGeo, globeMat)
      scene.add(globe)

      loadLandDots(landMaskUrl, { radius: GLOBE_R * 1.005, step: 2, threshold: 90 })
        .then((positions) => {
          if (cancelled) return
          const geo = new THREE.BufferGeometry()
          geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          const mat = new THREE.PointsMaterial({
            map: dotTex, size: 0.012, color: 0x8cc8ff, transparent: true, opacity: 0.85,
            depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
          })
          disposables.push(geo, mat)
          dotPoints = new THREE.Points(geo, mat)
          scene.add(dotPoints)
        })
        .catch(() => { /* 육지 마스크 로드 실패는 무시 — 빈 지구본으로도 충분 */ })
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 1.3
    controls.maxDistance = 6
    controls.rotateSpeed = 0.5

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let currentDir = new THREE.Vector3(0, 0.5, 2.6).normalize()

    const apiKey = import.meta.env.VITE_GOOGLE_TILES_KEY
    let mode = 'fallback'
    let tiles = null
    let tilesControls = null
    let activeControls = controls
    let activeRadius = GLOBE_R
    let activeUpAxis = new THREE.Vector3(0, 1, 0)
    // 폴백(단위구) 비행의 착지 고도 배수(반지름 대비).
    let activeBaseAltitude = 0.05
    let getLandmarkDir = (landmark) => latLonToDirection(landmark.lat, landmark.lon, new THREE.Vector3())
    // tiles 모드에서만 세팅 — 랜드마크의 착지 카메라 위치·시선대상·업벡터를 반환.
    let getTilesLanding = null

    const teardownTiles = () => {
      if (tilesControls) { tilesControls.dispose(); tilesControls = null }
      if (tiles) { tiles.dispose(); tiles = null }
    }

    const activateFallback = (noticeText) => {
      teardownTiles()
      mode = 'fallback'
      flightRef.current = null
      activeControls = controls
      activeRadius = GLOBE_R
      activeUpAxis = new THREE.Vector3(0, 1, 0)
      activeBaseAltitude = 0.05
      getLandmarkDir = (landmark) => latLonToDirection(landmark.lat, landmark.lon, new THREE.Vector3())
      camera.position.set(currentDir.x * GLOBE_R * 2.6, currentDir.y * GLOBE_R * 2.6, currentDir.z * GLOBE_R * 2.6)
      buildFallbackGlobe()
      setNotice(noticeText)
    }

    if (apiKey) {
      mode = 'tiles'
      tiles = new TilesRenderer()
      tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey }))
      tiles.registerPlugin(new TilesFadePlugin())
      tiles.registerPlugin(new UpdateOnChangePlugin())
      scene.add(tiles.group)
      tiles.setCamera(camera)
      tiles.setResolutionFromRenderer(camera, renderer)

      tiles.addEventListener('load-error', (e) => {
        if (e.tile !== null) return // 개별 타일 실패는 무시 — 루트 타일셋 실패만 폴백 트리거
        if (mode !== 'tiles') return
        activateFallback('위성 타일을 불러올 수 없어 정적 지구본으로 표시 중')
      })

      // 폴백용 OrbitControls는 tiles 모드에서 비활성화 — 같은 캔버스에 두 컨트롤이
      // 붙어 포인터/휠 입력을 두고 싸우면 조작이 폭주한다.
      controls.enabled = false

      // tiles 전용 OrbitControls: 지구 중심(초기) 또는 착지 지표점을 대상으로 돈다.
      tilesControls = new OrbitControls(camera, renderer.domElement)
      tilesControls.enableDamping = true
      tilesControls.dampingFactor = 0.08
      tilesControls.rotateSpeed = 0.4
      tilesControls.zoomSpeed = 0.8
      tilesControls.target.set(0, 0, 0)
      tilesControls.minDistance = WGS84_RADIUS * 1.15 // 초기: 지구 표면 아래로 못 들어가게
      tilesControls.maxDistance = WGS84_RADIUS * 6
      activeControls = tilesControls
      activeRadius = WGS84_RADIUS

      // 랜드마크 착지 지오메트리: 지표점(대상) + 그 위 비스듬한 카메라 위치 + 로컬 업.
      // ECEF 좌표(중심이 원점)에서 계산한다.
      getTilesLanding = (landmark) => {
        const target = new THREE.Vector3()
        tiles.ellipsoid.getCartographicToPosition(landmark.lat * DEG, landmark.lon * DEG, 0, target)
        target.applyMatrix4(tiles.group.matrixWorld)
        const up = new THREE.Vector3()
        tiles.ellipsoid.getPositionToNormal(target, up) // 로컬 수직(업)
        // 접선 방향(동쪽 근사) — 업과 ECEF 북(+Z)의 외적
        const tangent = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), up)
        if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0)
        tangent.normalize()
        const camPos = target.clone()
          .addScaledVector(up, TILES_LANDING_HEIGHT)
          .addScaledVector(tangent, TILES_LANDING_BACK)
        return { camPos, target, up }
      }
      camera.position.set(0, WGS84_RADIUS * 0.4, WGS84_RADIUS * 2.6)
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 0, 0)
    } else {
      buildFallbackGlobe()
    }

    const flyTo = (landmark) => {
      // tiles 모드: 지표점 중심으로 도는 OrbitControls로 넘기기 위해 카메라 위치·
      // 시선대상·업을 향해 보간한다. 비행 중엔 OrbitControls.update()를 돌리지 않는다
      // (수동 구동과 충돌). 착지하면 대상/줌 범위를 도시 규모로 좁혀 둘러보게 한다.
      if (mode === 'tiles' && getTilesLanding) {
        const { camPos, target, up } = getTilesLanding(landmark)
        if (reducedMotion) {
          camera.up.copy(up)
          camera.position.copy(camPos)
          camera.lookAt(target)
          tilesControls.target.copy(target)
          tilesControls.minDistance = TILES_CLOSE_MIN
          tilesControls.maxDistance = TILES_CLOSE_MAX
          tilesControls.update()
          return
        }
        flightRef.current = {
          kind: 'tiles',
          startPos: camera.position.clone(),
          startTarget: tilesControls.target.clone(),
          startUp: camera.up.clone(),
          endPos: camPos,
          endTarget: target,
          endUp: up,
          startedAt: performance.now(),
          durationMs: 2600,
        }
        return
      }

      // 폴백(단위구) 모드: 기존 대권 비행.
      const toDir = getLandmarkDir(landmark)
      if (reducedMotion) {
        const frame = computeFlightFrame(toDir, toDir, 1, activeRadius, { upAxis: activeUpAxis, baseAltitudeFactor: activeBaseAltitude })
        camera.position.copy(frame.position)
        camera.up.copy(frame.up)
        camera.lookAt(frame.lookAt)
        if (activeControls.target) activeControls.target.copy(frame.lookAt)
        currentDir = toDir
        return
      }
      flightRef.current = {
        kind: 'fallback',
        // 비행 시작점을 카메라의 실제 현재 방향에서 가져와 비행 중 재클릭 시 튐 방지
        fromDir: camera.position.clone().normalize(),
        toDir,
        startedAt: performance.now(),
        durationMs: 2200,
      }
      currentDir = toDir
    }
    flyToRef.current = flyTo

    const resize = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      if (mode === 'tiles' && tiles) tiles.setResolutionFromRenderer(camera, renderer)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    // tiles 모드 near/far 관리: GlobeControls를 안 쓰므로 직접 잡는다. ECEF에서
    // 지구 중심은 원점 — 카메라 고도로 near를, 지평선 접선거리로 far를 정해
    // z-fighting과 지구 클리핑(멀 때 far 밖으로 나가 안 보이는 것)을 함께 막는다.
    const _tgt = new THREE.Vector3()
    const updateTilesNearFar = () => {
      const distToCenter = camera.position.length()
      const altitude = Math.max(1, distToCenter - WGS84_RADIUS)
      const horizon = Math.sqrt(Math.max(1, distToCenter * distToCenter - WGS84_RADIUS * WGS84_RADIUS))
      camera.near = Math.max(1, altitude * 0.1)
      camera.far = horizon + altitude + 1000
      camera.updateProjectionMatrix()
    }

    let attributionFrameCount = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)

      const flight = flightRef.current
      if (flight) {
        const progress = Math.min(1, (performance.now() - flight.startedAt) / flight.durationMs)
        if (flight.kind === 'tiles') {
          const t = easeInOutCubic(progress)
          camera.position.lerpVectors(flight.startPos, flight.endPos, t)
          _tgt.copy(flight.startTarget).lerp(flight.endTarget, t)
          camera.up.copy(flight.startUp).lerp(flight.endUp, t).normalize()
          camera.lookAt(_tgt)
          tilesControls.target.copy(_tgt)
          updateTilesNearFar()
        } else {
          const frame = computeFlightFrame(flight.fromDir, flight.toDir, progress, activeRadius, { upAxis: activeUpAxis, baseAltitudeFactor: activeBaseAltitude })
          camera.position.copy(frame.position)
          camera.up.copy(frame.up)
          camera.lookAt(frame.lookAt)
          if (activeControls.target) activeControls.target.copy(frame.lookAt)
        }
        if (progress >= 1) {
          flightRef.current = null
          if (flight.kind === 'tiles') {
            // 착지 완료: 대상·업·줌 범위를 도시 규모로 확정해 OrbitControls로 인수.
            camera.up.copy(flight.endUp)
            tilesControls.target.copy(flight.endTarget)
            tilesControls.minDistance = TILES_CLOSE_MIN
            tilesControls.maxDistance = TILES_CLOSE_MAX
            tilesControls.update()
          }
        }
      }

      if (mode === 'tiles' && tiles) {
        // 비행이 끝난 뒤에만 OrbitControls가 카메라를 소유한다(비행 중엔 수동 구동).
        if (!flightRef.current) {
          activeControls.update()
          updateTilesNearFar()
        }
        camera.updateMatrixWorld()
        // tiles.update()는 내부에서 UpdateOnChangePlugin.doTilesNeedUpdate()를
        // 호출해 순회 여부를 판단한다. 외부에서 그걸 먼저 호출해 게이팅하면
        // needsUpdate 플래그·카메라 행렬 상태를 소모해버려 내부 판단이 항상
        // false가 되고 자식 타일 순회가 통째로 스킵된다 — 매 프레임 그냥 호출한다.
        tiles.update()
        attributionFrameCount += 1
        if (attributionFrameCount % 30 === 0) {
          const attributions = tiles.getAttributions([])
          const text = attributions.find((a) => a.type === 'string')?.value ?? null
          setNotice((prev) => (prev && prev.startsWith('위성 타일을 불러올 수 없어') ? prev : text))
        }
      } else {
        activeControls.update()
        if (globe) {
          globe.rotateY(0.0006)
          if (dotPoints) dotPoints.rotation.y = globe.rotation.y
        }
      }

      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      teardownTiles()
      ro.disconnect()
      controls.dispose()
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
      wrap.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="exp-wrap ee-wrap" ref={wrapRef}>
      <span className="exp-hint">드래그로 지구를 회전 · 휠로 확대/축소</span>
      <div className="ee-landmarks">
        {LANDMARKS.map((lm) => (
          <button
            key={lm.id}
            type="button"
            className={`ee-landmark-btn${activeLandmark === lm.id ? ' active' : ''}`}
            onClick={() => { setActiveLandmark(lm.id); flyToRef.current(lm) }}
          >
            {lm.name}
          </button>
        ))}
      </div>
      {notice && <div className="ee-notice">{notice}</div>}
    </div>
  )
}
