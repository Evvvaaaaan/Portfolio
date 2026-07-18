import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TilesRenderer, GlobeControls, WGS84_RADIUS } from '3d-tiles-renderer'
import { GoogleCloudAuthPlugin, TilesFadePlugin, UpdateOnChangePlugin } from '3d-tiles-renderer/plugins'
import { loadLandDots } from './landDots.js'
import { latLonToDirection } from './sphereFrame.js'
import { computeFlightFrame } from './flightPath.js'
import { LANDMARKS } from './landmarks.js'
import landMaskUrl from '../../assets/earth-land-mask.png'
import '../shared/exp.css'
import './EarthExplorer.css'

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
    let getLandmarkDir = (landmark) => latLonToDirection(landmark.lat, landmark.lon, new THREE.Vector3())

    const teardownTiles = () => {
      if (tilesControls) { tilesControls.dispose(); tilesControls = null }
      if (tiles) { tiles.dispose(); tiles = null }
    }

    const activateFallback = (noticeText) => {
      teardownTiles()
      mode = 'fallback'
      activeControls = controls
      activeRadius = GLOBE_R
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

      tilesControls = new GlobeControls(scene, camera, renderer.domElement)
      tilesControls.setEllipsoid(tiles.ellipsoid, tiles.group)
      activeControls = tilesControls
      activeRadius = WGS84_RADIUS
      getLandmarkDir = (landmark) => {
        const target = new THREE.Vector3()
        tiles.ellipsoid.getCartographicToPosition(
          landmark.lat * (Math.PI / 180),
          landmark.lon * (Math.PI / 180),
          0,
          target,
        )
        return target.normalize()
      }
      camera.position.set(0, WGS84_RADIUS * 0.4, WGS84_RADIUS * 2.6)
      currentDir = new THREE.Vector3(0, 0.4, 2.6).normalize()
    } else {
      buildFallbackGlobe()
    }

    const flyTo = (landmark) => {
      const toDir = getLandmarkDir(landmark)
      if (reducedMotion) {
        const frame = computeFlightFrame(toDir, toDir, 1, activeRadius)
        camera.position.copy(frame.position)
        camera.up.copy(frame.up)
        camera.lookAt(frame.lookAt)
        activeControls.target.copy(frame.lookAt)
        currentDir = toDir
        return
      }
      flightRef.current = {
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

    let attributionFrameCount = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)

      const flight = flightRef.current
      if (flight) {
        const elapsed = performance.now() - flight.startedAt
        const progress = Math.min(1, elapsed / flight.durationMs)
        const frame = computeFlightFrame(flight.fromDir, flight.toDir, progress, activeRadius)
        camera.position.copy(frame.position)
        camera.up.copy(frame.up)
        camera.lookAt(frame.lookAt)
        activeControls.target.copy(frame.lookAt)
        if (progress >= 1) flightRef.current = null
      }

      if (mode === 'tiles' && tiles) {
        const updatePlugin = tiles.getPluginByName('UPDATE_ON_CHANGE_PLUGIN')
        if (!updatePlugin || updatePlugin.doTilesNeedUpdate()) {
          tiles.update()
        }
        attributionFrameCount += 1
        if (attributionFrameCount % 30 === 0) {
          const attributions = tiles.getAttributions([])
          const text = attributions.find((a) => a.type === 'string')?.value ?? null
          setNotice((prev) => (prev && prev.startsWith('위성 타일을 불러올 수 없어') ? prev : text))
        }
      } else if (globe) {
        globe.rotateY(0.0006)
        if (dotPoints) dotPoints.rotation.y = globe.rotation.y
      }

      activeControls.update()
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
