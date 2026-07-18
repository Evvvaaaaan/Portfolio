import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadLandDots } from './landDots.js'
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

    // 폴백 지구본: 어두운 구체 + 육지 도트 매트릭스 (방명록과 같은 기법)
    const globeGeo = new THREE.SphereGeometry(GLOBE_R, 48, 48)
    const globeMat = new THREE.MeshBasicMaterial({ color: 0x0a1420, transparent: true, opacity: 0.92 })
    disposables.push(globeGeo, globeMat)
    const globe = new THREE.Mesh(globeGeo, globeMat)
    scene.add(globe)

    const dotTex = makeGlowTexture(32, 'rgba(140,200,255,1)')
    disposables.push(dotTex)
    let dotPoints = null
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

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 1.3
    controls.maxDistance = 6
    controls.rotateSpeed = 0.5

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

    const tick = () => {
      raf = requestAnimationFrame(tick)
      globe.rotateY(0.0006)
      if (dotPoints) dotPoints.rotation.y = globe.rotation.y
      controls.update()
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
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
    </div>
  )
}
