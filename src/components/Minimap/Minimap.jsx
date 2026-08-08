import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../context/LangContext'
import { getLenis } from '../../hooks/useLenis'
import { STATIONS } from '../SpaceBackground/rail.js'
import {
  MAP_SIZE,
  MAP_ORBITS,
  MAP_STATIONS,
  SUN_POINT,
  cameraMarker,
} from './minimapLayout.js'
import './Minimap.css'

const MAX_PROGRESS = STATIONS.length - 1

export default function Minimap() {
  const { t } = useLang()
  const [marker, setMarker] = useState(() => cameraMarker(0))
  const [active, setActive] = useState(0)
  const frameRef = useRef(0)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const read = () => {
      frameRef.current = 0
      // 데스크톱 메인은 섹션당 정확히 100vh인 슬라이드덱이라 이 값이 곧
      // 정거장 인덱스다 (SpaceBackground의 레일 구동식과 동일).
      const raw = window.scrollY / window.innerHeight
      const progress = Math.min(Math.max(raw, 0), MAX_PROGRESS)
      setMarker(cameraMarker(progress, reduced))
      setActive(Math.round(progress))
    }
    // 스크롤 이벤트는 프레임당 여러 번 올 수 있다 — rAF로 접어 setState가
    // 한 프레임에 한 번만 일어나게 한다.
    const onScroll = () => {
      if (frameRef.current) return
      frameRef.current = requestAnimationFrame(read)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    read()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  // 카메라를 직접 옮기지 않고 스크롤을 옮긴다 — 레일·도킹 패널·네비바가 이미
  // 스크롤에 물려 있어서 이것 하나로 전부 따라온다. Lenis가 자기 rAF에서
  // 스크롤을 소유하므로 네이티브 scrollTo는 Lenis가 있는 동안 쓰면 안 된다.
  const go = (stationIndex) => {
    const top = stationIndex * window.innerHeight
    const lenis = getLenis()
    if (lenis) lenis.scrollTo(top, { duration: 0.9 })
    else window.scrollTo({ top, behavior: 'smooth' })
  }

  const labelOf = (id) => (id === 'home' ? t.minimap.home : t.nav[id])

  return (
    <nav className="minimap" aria-label={t.minimap.label}>
      <svg
        className="minimap-svg"
        viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
        aria-hidden="true"
      >
        {MAP_ORBITS.map((o) => (
          <circle
            key={o.id}
            className="minimap-orbit"
            cx={SUN_POINT.x}
            cy={SUN_POINT.y}
            r={o.r}
          />
        ))}
        {MAP_STATIONS.map((s) => (
          <circle
            key={s.id}
            className={`minimap-dot ${active === s.stationIndex ? 'minimap-dot--on' : ''}`}
            cx={s.x}
            cy={s.y}
            r={s.id === 'home' ? 3.4 : 2.2}
            fill={s.color}
          />
        ))}
        <circle className="minimap-marker" cx={marker.x} cy={marker.y} r="1.7" />
      </svg>
      <ul className="minimap-buttons">
        {MAP_STATIONS.map((s) => (
          <li key={s.id} style={{ left: `${s.x}%`, top: `${s.y}%` }}>
            <button
              type="button"
              className={`minimap-btn ${active === s.stationIndex ? 'minimap-btn--on' : ''}`}
              aria-current={active === s.stationIndex ? 'true' : undefined}
              title={labelOf(s.id)}
              onClick={() => go(s.stationIndex)}
            >
              {/* 지도 위에 5개 라벨을 겹쳐 쓰면 읽을 수 없다 — 눈에는 SVG 점이
                  보이고, 스크린리더·키보드에는 이 텍스트가 이름이 된다. */}
              <span className="minimap-btn-label">{labelOf(s.id)}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
