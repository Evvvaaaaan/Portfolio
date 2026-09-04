import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Link } from 'react-router-dom'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { createScene } from './scene/createScene.js'
import { buildProbe } from './scene/buildProbe.js'
import { createOverlays } from './scene/overlays.js'
import { PARTS, FOCUS_PART } from './scene/parts.js'
import { PHASES, TOTAL_VH, sampleCam, phaseOpacity } from './scroll/phases.js'
import './ProbeSequence.css'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

// 부팅 오버레이를 붙잡아 두는 시간. 씬 구성은 동기적으로 끝나므로 이건
// 다운로드 대기가 아니라 의도된 도입부다 — 진행률을 가장하지 않는다.
const BOOT_MS = 700

export default function ProbeSequence() {
  const canvasRef = useRef(null)
  const scrollRef = useRef(null)
  const copyRefs = useRef([])
  const labelRefs = useRef({})
  const [ready, setReady] = useState(false)

  // 좁은 화면에서는 렌더를 가볍게 하고, 3D 공간에 떠 있는 부품 라벨 대신
  // 부품 목록을 카피 안에 직접 싣는다. 390px 폭에서는 라벨 여섯 개가 서로
  // 겹쳐 읽을 수 없다.
  const isNarrow = useMediaQuery('(max-width: 768px)')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // 부팅 중에는 스크롤을 잠근다. App의 전역 overflow 이펙트는 pathname이
  // 바뀔 때만 돌기 때문에 여기서 건드려도 서로 덮어쓰지 않는다.
  useEffect(() => {
    if (ready) return undefined
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [ready])

  useEffect(() => {
    const canvas = canvasRef.current
    const scrollEl = scrollRef.current
    if (!canvas || !scrollEl) return undefined

    const simple = isNarrow
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const view = createScene(canvas, { simple })
    const probe = buildProbe({ simple })
    view.scene.add(probe.root)
    const overlays = createOverlays({ glow: !simple })
    overlays.setAspect(view.aspect)

    const onResize = () => overlays.setAspect(view.resize())
    window.addEventListener('resize', onResize)

    const focusGroup = probe.parts.get(FOCUS_PART)
    const cam = {}
    const ndc = new THREE.Vector3()
    const anchor = new THREE.Vector3()
    let t = 0
    let raf = 0
    let last = 0

    function frame(now) {
      raf = requestAnimationFrame(frame)
      if (document.hidden) return

      // 스크롤 진행값. 컨테이너의 화면상 위치에서 직접 읽으므로 Lenis가
      // 이미 부드럽게 만든 스크롤과 한 프레임도 어긋나지 않는다.
      const rect = scrollEl.getBoundingClientRect()
      const range = rect.height - window.innerHeight
      const raw = range <= 0 ? 0 : clamp(-rect.top / range, 0, 1)

      // 감쇠는 프레임 간격에 맞춰 계산한다. 첫 프레임이거나 탭이 백그라운드에
      // 있다 돌아와 프레임이 끊긴 뒤에는 따라잡지 않고 곧바로 스냅한다 —
      // 안 그러면 탭으로 돌아올 때마다 시퀀스가 처음부터 다시 훑고 지나간다.
      const dt = last ? now - last : 0
      last = now
      if (reduced || dt <= 0 || dt > 200) {
        t = raw
      } else {
        t += (raw - t) * (1 - Math.pow(1 - 0.12, dt / 16.67))
      }

      sampleCam(t, cam)

      // 부품 분해와 포커스 페이드
      probe.parts.forEach((g) => {
        g.position.copy(g.userData.home).addScaledVector(g.userData.explode, cam.explode)
        const dim = g === focusGroup ? 0 : cam.focus
        const opacity = 1 - dim * 0.88
        for (const m of g.userData.mats) m.opacity = opacity
      })

      // 카메라 — 원점을 도는 구면 궤도. 포커스 구간에서는 대상 부품을 본다.
      let ty = cam.ty
      if (cam.focus > 0 && focusGroup) {
        anchor.copy(focusGroup.position).add(focusGroup.userData.anchor)
        ty = cam.ty + (anchor.y - cam.ty) * cam.focus
      }
      // 세로로 긴 화면에서는 같은 거리로도 가로가 훨씬 좁게 잡힌다. 붐이
      // 잘리지 않도록 종횡비에 따라 카메라를 물린다.
      const d = cam.dist * clamp(1.35 / view.aspect, 1, 2.2)
      const ce = Math.cos(cam.elev)
      view.camera.position.set(
        Math.sin(cam.azim) * ce * d,
        Math.sin(cam.elev) * d + ty,
        Math.cos(cam.azim) * ce * d,
      )
      view.camera.lookAt(0, ty, 0)

      overlays.set(cam)

      for (let i = 0; i < PHASES.length; i++) {
        const el = copyRefs.current[i]
        if (!el) continue
        const o = phaseOpacity(PHASES[i], t)
        el.style.opacity = o
        el.style.visibility = o < 0.01 ? 'hidden' : 'visible'
      }

      // 부품 라벨 — 월드 좌표를 화면에 투영해 DOM을 따라 붙인다.
      const labelAlpha = simple ? 0 : clamp((cam.explode - 0.55) / 0.45, 0, 1) * (1 - cam.focus)
      const w = window.innerWidth
      const h = window.innerHeight
      for (const meta of PARTS) {
        const el = labelRefs.current[meta.id]
        const g = probe.parts.get(meta.id)
        if (!el || !g) continue
        if (labelAlpha < 0.01) {
          el.style.opacity = 0
          continue
        }
        ndc.copy(g.position).add(g.userData.anchor).project(view.camera)
        let x = (ndc.x * 0.5 + 0.5) * w
        let y = (-ndc.y * 0.5 + 0.5) * h
        // 부품 위에 글자가 얹히지 않도록 화면 중심에서 바깥쪽으로 밀어낸다.
        // 정중앙에 있는 bus는 밀 방향이 없으므로 아래로 내린다.
        const dx = x - w / 2
        const dy = y - h / 2
        const len = Math.hypot(dx, dy)
        const push = 92
        if (len < 24) {
          y += push
        } else {
          x += (dx / len) * push
          y += (dy / len) * push
        }
        x = clamp(x, 150, w - 150)
        y = clamp(y, 100, h - 100)
        el.style.opacity = ndc.z > 1 ? 0 : labelAlpha
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`
      }

      view.renderer.render(view.scene, view.camera)
      view.renderer.autoClear = false
      view.renderer.render(overlays.scene, overlays.camera)
      view.renderer.autoClear = true
    }

    frame()
    const bootTimer = setTimeout(() => setReady(true), reduced ? 0 : BOOT_MS)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(bootTimer)
      window.removeEventListener('resize', onResize)
      view.scene.remove(probe.root)
      probe.dispose()
      overlays.dispose()
      view.dispose()
    }
  }, [isNarrow])

  return (
    <div className="probe">
      <canvas ref={canvasRef} className="probe-canvas" aria-hidden="true" />

      <p className="probe-sr">
        스크롤에 따라 심우주 탐사선 한 대가 가까워지고, 여섯 개의 부품으로 분해되었다가 다시
        조립되는 3차원 장면입니다. 아래 텍스트가 각 단계를 순서대로 설명합니다.
      </p>

      <div className="probe-labels" aria-hidden="true" hidden={isNarrow}>
        {PARTS.map((p) => (
          <div
            key={p.id}
            className="probe-label"
            ref={(el) => {
              labelRefs.current[p.id] = el
            }}
          >
            <span className="probe-label__name">{p.label}</span>
            <span className="probe-label__spec">{p.spec}</span>
            <span className="probe-label__maps">{p.maps}</span>
          </div>
        ))}
      </div>

      {/* 카피는 스크롤 컨테이너 밖의 고정 레이어에 둔다. 섹션 안에 sticky로
          넣으면 구간 끝에서 아직 불투명한 채로 화면 밖으로 밀려 올라가
          탐사선 위를 지나간다. 노출은 오직 불투명도가 결정해야 한다. */}
      <div className="probe-copies">
        {PHASES.map((ph, i) => (
          <section
            key={ph.num}
            className="probe-copy"
            data-align={ph.align}
            ref={(el) => {
              copyRefs.current[i] = el
            }}
          >
            <span className="probe-copy__kicker">
              <b>{ph.num}</b> {ph.kicker}
            </span>
            <h2 className="probe-copy__head">{ph.head}</h2>
            {ph.sub && <p className="probe-copy__sub">{ph.sub}</p>}
            {ph.showParts && isNarrow && (
              <ul className="probe-partlist">
                {PARTS.map((p) => (
                  <li key={p.id}>
                    <b>{p.label}</b>
                    <span>{p.maps}</span>
                  </li>
                ))}
              </ul>
            )}
            {ph.cta && (
              <div className="probe-cta">
                <Link to="/#projects">프로젝트 보기</Link>
                <a href="mailto:vmfhrmfoald36@gmail.com">연락하기</a>
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="probe-scroll" ref={scrollRef} aria-hidden="true">
        {PHASES.map((ph) => (
          <div
            key={ph.num}
            className="probe-phase"
            style={{ height: `${((ph.to - ph.from) * TOTAL_VH).toFixed(2)}vh` }}
          />
        ))}
      </div>

      <div className={`probe-boot${ready ? ' probe-boot--out' : ''}`} aria-hidden={ready}>
        <svg viewBox="0 0 240 240" aria-hidden="true">
          <circle cx="120" cy="120" r="112" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1.5" />
          <circle
            className="probe-boot__arc"
            cx="120"
            cy="120"
            r="112"
            fill="none"
            stroke="#e8c063"
            strokeWidth="2"
            strokeLinecap="round"
            transform="rotate(-90 120 120)"
          />
        </svg>
        <div className="probe-boot__text">
          <span>Systems check</span>
          <b>ACQUIRING SIGNAL</b>
        </div>
      </div>
    </div>
  )
}
