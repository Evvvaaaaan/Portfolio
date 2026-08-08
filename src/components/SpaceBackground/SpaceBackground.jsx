import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { computeTransitionIntensity } from './transitionIntensity.js'
// sectionTint 제거됨 — 전체 배경 순수 검정 통일
import { createWarpStreaks } from './warpStreaks.js'
import { createPostFX } from './postfx.js'
import {
  shouldPlayArrival,
  beginArrival,
  concludeArrival,
  computeArrivalIntensity,
} from './arrivalSequence.js'
import { WARP_BOOST_EVENT, computeBoostIntensity } from './warpBoost.js'
import { createEvanSystem } from './evanSystem.js'
import { computeRailPose } from './rail.js'
import { computeGrade, hoursFromDate } from './timeOfDay.js'
import { projects } from '../../data/projects.js'
import { GRID_VERT, GRID_FRAG } from './introVisuals.glsl.js'
import {
  computeIntroState, shouldPlayIntro, hasSeenIntro, markIntroSeen,
} from './introSequence.js'

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

export default function SpaceBackground({ warpEnabled = false, stageEnabled = false }) {
  const ref = useRef(null)
  const warpEnabledRef = useRef(warpEnabled)
  const stageEnabledRef = useRef(stageEnabled)

  useEffect(() => {
    warpEnabledRef.current = warpEnabled
  }, [warpEnabled])

  useEffect(() => {
    stageEnabledRef.current = stageEnabled
  }, [stageEnabled])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    } catch (err) {
      // WebGL 사용 불가 — 배경 없이 DOM 콘텐츠만으로 동작한다 (스펙 5.4).
      // HardwareAccelNotice가 별도로 사용자에게 안내한다.
      // 도착 시퀀스는 반드시 종결돼야 하는 계약(arrivalSequence.js) — 여기서
      // 리턴해도 Hero가 영원히 기다리지 않도록 'skipped'로 마무리한다.
      console.warn('[SpaceBackground] WebGL renderer 생성 실패:', err)
      concludeArrival('skipped')
      return
    }
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 1)

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

    // Evan System: 스테이지가 켜질 때 1회 생성. SpaceBackground는 라우트가
    // 바뀌어도 언마운트되지 않으므로 메인 재방문 시 재사용된다.
    let evanSystem = null
    const satelliteColors = projects.slice(0, 3).map((p) => p.accent)
    const ensureSystem = () => {
      if (!evanSystem) {
        evanSystem = createEvanSystem({ satelliteColors })
        scene.add(evanSystem.group)
        // 인트로가 없는 경로에서는 곧바로 완성 상태로 시작한다. 인트로가
        // 있으면 첫 tick이 곧 setBuild(0)으로 덮어쓴다.
        evanSystem.setBuild(1)
        evanSystem.setOrbitDraw(1)
        // 시간대 라이팅: 방문 시각으로 씬의 색온도를 한 번 정한다. 매 프레임
        // 다시 계산하지 않는 이유 — 사람이 한 자리에서 한 시간을 보내지
        // 않으므로 변화가 보이지 않고, 프레임마다 유니폼을 쓰는 비용만 남는다.
        evanSystem.setGrade(computeGrade(hoursFromDate(new Date())))
      }
      evanSystem.group.visible = true
    }

    // 청사진 그리드: 인트로 동안만 화면 전체에 깔리는 오버레이. 클립 공간에
    // 직접 그리므로 전용 씬+카메라로 분리해 메인 씬의 깊이 정렬과 섞이지 않게 한다.
    const gridScene = new THREE.Scene()
    const gridCamera = new THREE.Camera()
    const gridUniforms = {
      uOpacity: { value: 0 },
      uAspect: { value: window.innerWidth / window.innerHeight },
      uLineColor: { value: new THREE.Color(0x6db5ff) },
    }
    const gridGeo = new THREE.PlaneGeometry(2, 2)
    const gridMat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      uniforms: gridUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    gridScene.add(new THREE.Mesh(gridGeo, gridMat))

    let scrollPercent = 0
    let scrollPercentSmooth = 0
    let intensitySmooth = 0
    // 스테이지 모드 스크롤 진행도 스무딩. 첫 프레임 점프 방지를 위해 실제
    // scrollY로 초기화한다 (스크롤 복원 리로드 대응).
    let progressSmooth = window.scrollY / window.innerHeight

    // 메인 페이지의 데스크톱 슬라이드덱(섹션마다 정확히 100vh)에서만 섹션 전환
    // 구간 가속을 쓴다. warpEnabled는 App.jsx에서 "메인 페이지 && 데스크톱"일
    // 때만 true로 내려오며, 라우트 변경이나 리사이즈에 반응해 갱신된다
    // (warpEnabledRef를 통해 항상 최신 값을 읽는다). 그 외(다른 라우트, 모바일)는
    // 섹션 높이가 100vh로 고정되지 않으므로 기존 페이지 전체 기준
    // (scrollPercentSmooth) 줌을 그대로 유지한다.
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // 첫 방문 인트로: 청사진이 그려지고 점화되어 실체화된 뒤에야 도착 워프가
    // 시작된다. 재방문(세션 기억)·reduced-motion·모바일은 건너뛰고 Phase 1과
    // 동일하게 동작한다.
    const introActive = shouldPlayIntro({
      stageEnabled: stageEnabledRef.current,
      reducedMotion,
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
      seen: hasSeenIntro(),
    })
    let introStartT = null
    let introSeenMarked = false
    let introDone = !introActive
    // 세션 마크는 여기서 바로 남기지 않는다 — React StrictMode 개발 모드는
    // 마운트 직후 곧바로 정리하고 재마운트하는데, 버려지는 첫 인스턴스도 동기
    // tick 1회는 실행한다. 여기서 바로 markIntroSeen()을 부르면 버려지는
    // 인스턴스가 세션 플래그를 태워버려 실제로 살아남는 인스턴스가 인트로를
    // 못 보게 된다. tick 안에서 진짜로 이어지는 프레임(두 번째 이후)에만
    // 마크한다.

    // 첫 로딩 도착 시퀀스: 조건 충족 시 고속 워프에서 시작해 감속-정착한다.
    // SpaceBackground는 라우트가 바뀌어도 언마운트되지 않으므로 이 판정은
    // 페이지 로드당 정확히 1회다. 재생하지 않는 경우에도 반드시 'skipped'로
    // 종결해 Hero가 기다리지 않게 한다.
    let arrivalActive = shouldPlayArrival({
      warpEnabled: warpEnabledRef.current,
      reducedMotion,
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
    })
    let arrivalStartT = null
    if (arrivalActive && !introActive) {
      beginArrival()
      arrivalStartT = 0
    } else if (!arrivalActive) {
      concludeArrival('skipped')
    }

    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      scrollPercent = maxScroll > 0 ? window.scrollY / maxScroll : 0
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    let id
    const clock = new THREE.Clock()
    // Lab 진입 부스트: 이벤트 수신 시점부터 타임라인을 재생한다.
    // 진행 중인 도착 시퀀스가 있으면 즉시 종결한다 (우선순위: 부스트 >
    // 도착 시퀀스 > 스크롤 워프).
    let boostStartT = null
    const onWarpBoost = () => {
      boostStartT = clock.getElapsedTime()
      if (arrivalActive) {
        arrivalActive = false
        concludeArrival('done')
      }
    }
    window.addEventListener(WARP_BOOST_EVENT, onWarpBoost)
    const tick = () => {
      id = requestAnimationFrame(tick)
      const t = clock.getElapsedTime()

      // --- 인트로 구동 (첫 방문에만 진입)
      if (!introDone) {
        if (introStartT === null) {
          introStartT = t
        } else if (!introSeenMarked) {
          introSeenMarked = true
          markIntroSeen()
        }
        const intro = computeIntroState((t - introStartT) * 1000)
        // 그리드는 스테이지(메인 데스크톱)에서만 의미가 있다. 인트로 도중
        // 라우트를 옮기면 SpaceBackground는 살아 있으므로, 게이트가 없으면
        // 다른 페이지 위에 격자가 그대로 남는다.
        gridUniforms.uOpacity.value = stageEnabledRef.current ? intro.gridOpacity : 0
        if (stageEnabledRef.current) {
          ensureSystem()
          evanSystem.setBuild(intro.buildProgress)
          evanSystem.setOrbitDraw(intro.drawProgress)
        }
        if (intro.done) {
          introDone = true
          gridUniforms.uOpacity.value = 0
          // 스테이지 밖(라우트 이동 등)에서 인트로가 끝나도 완성 상태는 반드시
          // 확정한다 — 안 그러면 메인으로 돌아왔을 때 중간 빌드에 얼어붙는다.
          // evanSystem은 스테이지가 한 번도 켜진 적 없으면 null일 수 있다.
          evanSystem?.setBuild(1)
          evanSystem?.setOrbitDraw(1)
          // 실체화가 끝난 순간 도착 워프로 넘긴다 — 점화의 여파가 그대로
          // 카메라 돌입으로 이어져 한 동작처럼 읽힌다.
          if (arrivalActive) {
            beginArrival()
            arrivalStartT = t
          }
        }
      }

      // Smooth out scroll progress
      scrollPercentSmooth += (scrollPercent - scrollPercentSmooth) * 0.05

      // 도착 시퀀스 중에는 스크롤이 아니라 타임라인이 intensity를 직접
      // 구동한다 (스무딩 없이 — 감속 곡선 자체가 이미 ease-out).
      // 도중에 라우트가 바뀌면(warp off) 즉시 종결하고 기존 리셋을 따른다.
      if (arrivalActive && !warpEnabledRef.current) {
        arrivalActive = false
        concludeArrival('done')
      }
      if (boostStartT !== null) {
        // 부스트는 warpEnabled와 무관하게 끝까지 재생 — 라우트가 /gallery로
        // 바뀌어도 해제 곡선이 이어져 도착 후 자연 감속한다.
        const boost = computeBoostIntensity((t - boostStartT) * 1000)
        intensitySmooth = boost.intensity
        if (boost.phase === 'done') boostStartT = null
      } else if (!introDone) {
        // 인트로가 아직 진행 중이면 워프 세기를 0으로 눌러 둔다 — 인트로 동안
        // 별이 흐르면 설계도 은유가 깨진다.
        intensitySmooth = 0
      } else if (arrivalActive) {
        const arrival = computeArrivalIntensity((t - (arrivalStartT ?? 0)) * 1000)
        intensitySmooth = arrival.intensity
        if (arrival.done) {
          arrivalActive = false
          concludeArrival('done')
        }
      } else {
        const targetIntensity = (warpEnabledRef.current && !reducedMotion)
          ? computeTransitionIntensity(window.scrollY, window.innerHeight)
          : 0
        // 상승(가속 진입)은 빠르게 따라가 정점을 놓치지 않고, 하강(감속)은 훨씬
        // 천천히 풀어 효과가 스크롤 속도와 무관하게 충분히 오래 느껴지도록
        // 비대칭 스무딩을 쓴다. 대칭(k=0.14 고정)이었을 때는 빠른 스크롤에서
        // 전체 효과가 몇백 ms 안에 끝나 버려 거의 체감되지 않았다.
        if (!warpEnabledRef.current) {
          // 라우트 이동 등으로 워프가 꺼지면 잔류 왜곡/스트릭 없이 즉시 리셋.
          intensitySmooth = 0
        } else {
          const smoothingRate = targetIntensity > intensitySmooth ? 0.18 : 0.025
          intensitySmooth += (targetIntensity - intensitySmooth) * smoothingRate
        }
      }

      // 부스트 중에는 라우트와 무관하게 intensity가 카메라를 구동해야 한다.
      const zoomDriver = (warpEnabledRef.current || boostStartT !== null)
        ? intensitySmooth
        : scrollPercentSmooth

      const stageOn = stageEnabledRef.current
      if (stageOn) ensureSystem()
      else if (evanSystem) evanSystem.group.visible = false

      if (stageOn && evanSystem) {
        // --- 스테이지 모드: 스크롤 진행도 → 레일 포즈.
        // 슬라이드덱이 섹션당 정확히 100vh이므로 진행도 = scrollY/vh.
        const progress = window.scrollY / window.innerHeight
        // 도착 시퀀스와 무관하게 레일이 카메라를 소유한다 — 시퀀스의
        // 워프감은 스트릭+포스트FX(intensity)가 담당한다.
        progressSmooth += (progress - progressSmooth) * (reducedMotion ? 1 : 0.08)
        const pose = computeRailPose(progressSmooth, reducedMotion)
        camera.position.set(pose.position[0], pose.position[1], pose.position[2])
        camera.lookAt(pose.target[0], pose.target[1], pose.target[2])
        camera.fov = Math.min(150, 60 + Math.pow(intensitySmooth, 1.5) * 45)
        camera.updateProjectionMatrix()

        // 별은 카메라와 독립적으로 아주 느리게만 회전 (스크롤 소용돌이는
        // 카메라 이동으로 대체됨).
        starsPoints.rotation.set(
          Math.sin(t * 0.003) * 0.04,
          t * 0.005,
          0,
        )
        // 스트릭은 카메라를 감싸야 도착/부스트 워프가 화면에 보인다.
        streaks.object3d.position.copy(camera.position)
        streaks.object3d.rotation.copy(camera.rotation)
        streaks.update(intensitySmooth)

        // reduced-motion: 셰이더 시간(난류·성운 흐름)만 0으로 고정한다 —
        // 위치/자세를 구동하는 t는 그대로 흘려보내 "형태는 유지" 제약을
        // 지킨다. 성운은 카메라 위치를 그대로 넘겨 매 프레임 카메라에
        // 고정시킨다(far plane 클리핑·패럴랙스 오차 방지).
        evanSystem.update(t, reducedMotion ? 0 : t, camera.position)
      } else {
        // --- 기존 워프/배경 모드 (변경 없음: 아래는 기존 코드 그대로)
        starsPoints.rotation.z = scrollPercentSmooth * 1.8
        starsPoints.rotation.y = t * 0.005 + scrollPercentSmooth * 0.15
        starsPoints.rotation.x = Math.sin(t * 0.003) * 0.04 + scrollPercentSmooth * 0.08
        streaks.object3d.position.set(0, 0, 0)
        streaks.object3d.rotation.copy(starsPoints.rotation)
        streaks.update(intensitySmooth)
        camera.position.z = 400 - Math.pow(zoomDriver, 1.2) * 360
        camera.position.x = 0
        camera.position.y = 0
        camera.lookAt(0, 0, 0)
        camera.fov = Math.min(150, 75 + Math.pow(zoomDriver, 1.5) * 45)
        camera.updateProjectionMatrix()
      }

      if (postfx) {
        // reduced-motion에서는 그레인 시간을 고정해 매 프레임 요동치지 않게 한다.
        postfx.render(intensitySmooth, reducedMotion ? 0 : t)
      } else {
        renderer.render(scene, camera)
      }

      // 그리드는 항상 마지막에 덧그린다 — 포스트FX 블룸이 격자를 번지게 하면
      // 도면이 아니라 안개처럼 보인다.
      if (stageEnabledRef.current && gridUniforms.uOpacity.value > 0.001) {
        renderer.autoClear = false
        renderer.render(gridScene, gridCamera)
        renderer.autoClear = true
      }
    }
    tick()

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      postfx?.setSize(window.innerWidth, window.innerHeight)
      gridUniforms.uAspect.value = window.innerWidth / window.innerHeight
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener(WARP_BOOST_EVENT, onWarpBoost)
      streaks.dispose()
      gridGeo.dispose()
      gridMat.dispose()
      starGeo.dispose()
      starMat.dispose()
      starTexture.dispose()
      evanSystem?.dispose()
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
