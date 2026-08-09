import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../context/LangContext'
import { subscribeSatellites, getSatellites } from '../SpaceBackground/satelliteOverlay.js'
import './ProjectSatellites.css'

// pendingSlug: 진행 중인 전환이 있으면 그 slug (없으면 null) — 부모
// (AppContent)가 소유한다. LabTransition을 이 컴포넌트 안에 두면, isMainPage가
// 바뀔 때 ProjectSatellites 자체가 통째로 언마운트되면서 전환 오버레이(화이트
// 플래시 포함)도 재생 중에 함께 뜯겨나간다 — 그래서 여기서는 어떤 위성이
// 선택됐는지만 onSelect로 보고하고, 실제 전환 재생은 부모가 맡는다.
export default function ProjectSatellites({ pendingSlug, onSelect }) {
  const { t } = useLang()
  // 어떤 위성이 화면에 있는지(= 버튼을 몇 개, 어떤 이름으로 그릴지)만 React
  // 상태로 두고, 좌표는 상태에 넣지 않는다 — 매 프레임 setState하면 60fps로
  // 리렌더가 돈다. slug와 title을 함께 담는 이유: 렌더 중에 getSatellites()를
  // 읽으면 구독 없이 외부 가변 상태를 읽는 셈이라 동시성 모드에서 찢어질 수
  // 있다. 렌더에 필요한 값은 전부 상태 안에 있어야 한다.
  const [shown, setShown] = useState([])
  const nodesRef = useRef(new Map())
  // 마지막으로 publish된 좌표 — 새로 마운트되는 버튼이 다음 publish까지
  // (0,0)에 그려지는 것을 막기 위해 ref 콜백에서 바로 쓴다.
  const lastPosRef = useRef(new Map())

  useEffect(() => {
    const apply = (list) => {
      const nextVisible = list.filter((s) => s.visible)
      for (const s of nextVisible) {
        lastPosRef.current.set(s.slug, { x: s.x, y: s.y })
      }
      // 목록의 구성(slug 또는 제목)이 바뀔 때만 리렌더한다.
      setShown((prev) => {
        const same =
          prev.length === nextVisible.length &&
          prev.every((p, i) => p.slug === nextVisible[i].slug && p.title === nextVisible[i].title)
        return same ? prev : nextVisible.map((s) => ({ slug: s.slug, title: s.title }))
      })
      // 좌표는 DOM에 직접 쓴다 — React를 거치지 않아 프레임 비용이 없다.
      for (const s of nextVisible) {
        const el = nodesRef.current.get(s.slug)
        if (el) el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) translate(-50%, -50%)`
      }
    }
    apply(getSatellites())
    return subscribeSatellites(apply)
  }, [])

  const open = (slug) => {
    // 이미 전환 중이면 두 번째 클릭은 무시한다 — 두 전환이 겹치면 라우트가
    // 두 번 바뀐다.
    if (pendingSlug) return
    onSelect(slug)
  }

  return (
    <div className="project-satellites" aria-label={t.satellites.label} role="group">
      {shown.map(({ slug, title }) => (
        <button
          key={slug}
          type="button"
          ref={(el) => {
            if (el) {
              nodesRef.current.set(slug, el)
              // ref 콜백은 커밋 중 페인트 전에 실행된다 — 마지막으로 알려진
              // 좌표를 여기서 바로 써야 첫 페인트가 (0,0)이 아니라 제자리에서
              // 시작한다 (다음 publish까지 기다리면 1~2프레임 코너 플래시).
              const pos = lastPosRef.current.get(slug)
              if (pos) el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`
            } else {
              nodesRef.current.delete(slug)
            }
          }}
          className="satellite-btn"
          onClick={() => open(slug)}
        >
          <span className="satellite-btn-ring" aria-hidden="true" />
          <span className="satellite-btn-label">{t.satellites.open.replace('{title}', title)}</span>
          <span className="satellite-btn-name" aria-hidden="true">{title}</span>
        </button>
      ))}
    </div>
  )
}
