import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../../context/LangContext'
import { subscribeSatellites, getSatellites } from '../SpaceBackground/satelliteOverlay.js'
import LabTransition from '../LabTransition/LabTransition.jsx'
import './ProjectSatellites.css'

export default function ProjectSatellites() {
  const { t } = useLang()
  const navigate = useNavigate()
  // 어떤 위성이 화면에 있는지(= 버튼을 몇 개, 어떤 이름으로 그릴지)만 React
  // 상태로 두고, 좌표는 상태에 넣지 않는다 — 매 프레임 setState하면 60fps로
  // 리렌더가 돈다. slug와 title을 함께 담는 이유: 렌더 중에 getSatellites()를
  // 읽으면 구독 없이 외부 가변 상태를 읽는 셈이라 동시성 모드에서 찢어질 수
  // 있다. 렌더에 필요한 값은 전부 상태 안에 있어야 한다.
  const [shown, setShown] = useState([])
  const [pending, setPending] = useState(null)
  const nodesRef = useRef(new Map())

  useEffect(() => {
    const apply = (list) => {
      const nextVisible = list.filter((s) => s.visible)
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
    if (pending) return
    setPending(slug)
  }

  return (
    <>
      <div className="project-satellites" aria-label={t.satellites.label} role="group">
        {shown.map(({ slug, title }) => (
          <button
            key={slug}
            type="button"
            ref={(el) => {
              if (el) nodesRef.current.set(slug, el)
              else nodesRef.current.delete(slug)
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
      {pending && (
        // origin은 LabTransition이 시각적으로 쓰지 않는다 — 확대 기준은
        // window.scrollY에서 직접 계산한다(LabTransition.jsx의 주석 참조).
        // Navbar와의 계약 때문에 시그니처에만 남아 있어 null로 넘겨도 안전하다.
        <LabTransition
          origin={null}
          onNavigate={() => navigate(`/projects/${pending}`)}
          onDone={() => setPending(null)}
        />
      )}
    </>
  )
}
