import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { computeTransitionIntensity } from './transitionIntensity.js'
import { computeSectionTint } from './sectionTint.js'
import { createWarpStreaks } from './warpStreaks.js'
import { createPostFX } from './postfx.js'

function createStarTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64

  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.18, 'rgba(255, 255, 255, 0.92)')
  gradient.addColorStop(0.42, 'rgba(210, 225, 255, 0.35)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

export default function SpaceBackground({ warpEnabled = false }) {
  const ref = useRef(null)
  const warpEnabledRef = useRef(warpEnabled)

  useEffect(() => {
    warpEnabledRef.current = warpEnabled
  }, [warpEnabled])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x0a0a0f, 1)
    const clearColor = new THREE.Color(0x0a0a0f)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000)
    camera.position.z = 400

    // 포스트프로세싱은 데스크톱 전용 (스펙: 모바일은 중간 수준 유지).
    // 데스크톱 판별은 App.jsx의 useMediaQuery와 동일 조건을 독립 계산한다.
    // 워프 왜곡 패스는 intensity=0이면 무효과이므로 메인 페이지가 아닐 때는
    // 블룸만 남는다.
    const isDesktop = window.matchMedia('(min-width: 769px) and (min-height: 701px)').matches
    const postfx = isDesktop
      ? createPostFX(renderer, scene, camera, window.innerWidth, window.innerHeight)
      : null

    // Stars: tiny soft sprites with depth variation, so they read as distant light.
    const STARS = 6500
    const sPos = new Float32Array(STARS * 3)
    const sCol = new Float32Array(STARS * 3)

    for (let i = 0; i < STARS; i++) {
      sPos[i * 3]     = (Math.random() - 0.5) * 2600
      sPos[i * 3 + 1] = (Math.random() - 0.5) * 2600
      sPos[i * 3 + 2] = -900 + Math.random() * 1500

      const brightness = 0.42 + Math.random() * 0.58
      const warmth = Math.random()
      sCol[i * 3] = brightness * (warmth > 0.82 ? 1 : 0.92)
      sCol[i * 3 + 1] = brightness * (warmth > 0.82 ? 0.93 : 0.96)
      sCol[i * 3 + 2] = brightness
    }

    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3))
    starGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3))
    const starTexture = createStarTexture()
    const starMat = new THREE.PointsMaterial({
      size: 2.1,
      map: starTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      alphaTest: 0.02,
    })
    
    const starsPoints = new THREE.Points(starGeo, starMat)
    scene.add(starsPoints)

    // 하이퍼스페이스 스트릭: 워프 전환 정점에서만 나타난다 (데스크톱 전용 연출
    // 이지만 게이트는 intensity가 담당 — 모바일/other 라우트는 intensity=0).
    const streaks = createWarpStreaks({ count: 400 })
    scene.add(streaks.object3d)

    let scrollPercent = 0
    let scrollPercentSmooth = 0
    let intensitySmooth = 0

    // 메인 페이지의 데스크톱 슬라이드덱(섹션마다 정확히 100vh)에서만 섹션 전환
    // 구간 가속을 쓴다. warpEnabled는 App.jsx에서 "메인 페이지 && 데스크톱"일
    // 때만 true로 내려오며, 라우트 변경이나 리사이즈에 반응해 갱신된다
    // (warpEnabledRef를 통해 항상 최신 값을 읽는다). 그 외(다른 라우트, 모바일)는
    // 섹션 높이가 100vh로 고정되지 않으므로 기존 페이지 전체 기준
    // (scrollPercentSmooth) 줌을 그대로 유지한다.
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      scrollPercent = maxScroll > 0 ? window.scrollY / maxScroll : 0
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    let id
    const clock = new THREE.Clock()
    const tick = () => {
      id = requestAnimationFrame(tick)
      const t = clock.getElapsedTime()
      
      // Smooth out scroll progress
      scrollPercentSmooth += (scrollPercent - scrollPercentSmooth) * 0.05

      // 메인 페이지 데스크톱 슬라이드덱 + 모션 허용 시: 섹션 전환 구간마다
      // 0→1→0으로 반복되는 세기. 그 외에는 0으로 고정하고 zoomDriver가
      // 기존 값을 쓰게 한다.
      const targetIntensity = (warpEnabledRef.current && !reducedMotion)
        ? computeTransitionIntensity(window.scrollY, window.innerHeight)
        : 0
      // 상승(가속 진입)은 빠르게 따라가 정점을 놓치지 않고, 하강(감속)은 훨씬
      // 천천히 풀어 효과가 스크롤 속도와 무관하게 충분히 오래 느껴지도록
      // 비대칭 스무딩을 쓴다. 대칭(k=0.14 고정)이었을 때는 빠른 스크롤에서
      // 전체 효과가 몇백 ms 안에 끝나 버려 거의 체감되지 않았다.
      const smoothingRate = targetIntensity > intensitySmooth ? 0.18 : 0.025
      intensitySmooth += (targetIntensity - intensitySmooth) * smoothingRate

      // 스트릭은 별필드와 같은 회전을 따라가 한 몸처럼 보이게 한다.
      streaks.object3d.rotation.copy(starsPoints.rotation)
      streaks.update(intensitySmooth)

      const zoomDriver = warpEnabledRef.current ? intensitySmooth : scrollPercentSmooth

      // 1. Vortex rotation: spin the stars on Z axis as we scroll down
      starsPoints.rotation.z = scrollPercentSmooth * 1.8

      // Y/X slow rotation + scroll drift
      starsPoints.rotation.y = t * 0.005 + scrollPercentSmooth * 0.15
      starsPoints.rotation.x = Math.sin(t * 0.003) * 0.04 + scrollPercentSmooth * 0.08

      // 2. Camera flies deep into the starfield (Z: 400 down to 40)
      // We use a power curve so the zoom feels like it accelerates (sucked-in feeling)
      camera.position.z = 400 - Math.pow(zoomDriver, 1.2) * 360

      // 3. Field of View Expansion: creates an edge-stretching warp speed optical illusion
      camera.fov = 75 + Math.pow(zoomDriver, 1.5) * 45
      camera.updateProjectionMatrix()

      // 섹션별 우주 좌표 틴트: 메인 데스크톱 슬라이드덱에서만 의미가 있다.
      // (다른 라우트는 섹션이 100vh 고정이 아니므로 기본색 유지)
      if (warpEnabledRef.current) {
        const [r, g, b] = computeSectionTint(window.scrollY, window.innerHeight)
        clearColor.setRGB(r, g, b)
      } else {
        clearColor.set(0x0a0a0f)
      }
      renderer.setClearColor(clearColor, 1)

      if (postfx) {
        postfx.render(intensitySmooth)
      } else {
        renderer.render(scene, camera)
      }
    }
    tick()

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      postfx?.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll)
      streaks.dispose()
      starGeo.dispose()
      starMat.dispose()
      starTexture.dispose()
      postfx?.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <canvas
      ref={ref}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  )
}
