import { useEffect, useRef, useState } from 'react'
import '../shared/exp.css'
import './VideoWall.css'

// 같은 페이지 한 장을 여러 타일로 찢어 붙인 옥외 전광판. 큰 가상 캔버스
// (COLS*TILE_W × ROWS*TILE_H) 크기로 iframe을 띄운 뒤, 타일마다 각자 다른
// 위치로 잘라 보여주면 합쳐서 한 그림이 된다 — 다만 각 타일은 독립된
// 브라우징 컨텍스트라 애니메이션 위상이 타일마다 미세하게 어긋난다. 그
// 이음매가 진짜 전광판처럼 보이게 만드는 지점이라 굳이 동기화하지 않는다.

const COLS = 3
const ROWS = 2
const TILE_W = 420
const TILE_H = 260
const TILE_COUNT = COLS * ROWS
const ROUTE = '/'

// 타일은 아무도 스크롤하지 않는다(pointer-events: none). 그런데도 페이지가
// 자기 스크롤바(index.css, 폭 4px 흰색)를 그리면 마지막 열 오른쪽 끝에 흰
// 막대가 한 줄 서서 전광판의 이음매를 깬다 — scrolling="no"로 아예 없앤다.

const MOUNT_STAGGER_MS = 140
const REFRESH_MIN_MS = 5000
const REFRESH_JITTER_MS = 6000

export default function VideoWall() {
  const [mountedCount, setMountedCount] = useState(0)
  const [refreshKeys, setRefreshKeys] = useState(() => Array(TILE_COUNT).fill(0))
  const wrapRef = useRef(null)

  // 타일을 한꺼번에 띄우면 같은 앱 번들을 N번 동시에 부팅하는 셈이라 첫
  // 프레임이 버벅인다. 순서대로 하나씩 붙인다.
  useEffect(() => {
    if (mountedCount >= TILE_COUNT) return
    const id = setTimeout(() => setMountedCount((c) => c + 1), MOUNT_STAGGER_MS)
    return () => clearTimeout(id)
  }, [mountedCount])

  // 가끔 한 칸이 스스로 새로고침된다 — 실제 전광판 패널 하나가 리셋되는 느낌.
  useEffect(() => {
    let id
    const scheduleNext = () => {
      const delay = REFRESH_MIN_MS + Math.random() * REFRESH_JITTER_MS
      id = setTimeout(() => {
        const tile = Math.floor(Math.random() * TILE_COUNT)
        setRefreshKeys((keys) => keys.map((k, i) => (i === tile ? k + 1 : k)))
        scheduleNext()
      }, delay)
    }
    scheduleNext()
    return () => clearTimeout(id)
  }, [])

  const onPointerMove = (e) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width - 0.5
    const ny = (e.clientY - rect.top) / rect.height - 0.5
    wrap.style.setProperty('--tilt-x', `${(-ny * 10).toFixed(2)}deg`)
    wrap.style.setProperty('--tilt-y', `${(nx * 14).toFixed(2)}deg`)
  }

  const onPointerLeave = () => {
    const wrap = wrapRef.current
    if (!wrap) return
    wrap.style.setProperty('--tilt-x', '0deg')
    wrap.style.setProperty('--tilt-y', '0deg')
  }

  return (
    <div
      className="video-wall-exp"
      ref={wrapRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div className="vw-caption">
        <span>Live jumbotron</span>
        <strong>{TILE_COUNT} independent panels, one page</strong>
      </div>

      <div className="vw-grid" style={{ '--cols': COLS, '--tile-w': `${TILE_W}px`, '--tile-h': `${TILE_H}px` }}>
        {Array.from({ length: TILE_COUNT }, (_, i) => {
          const col = i % COLS
          const row = Math.floor(i / COLS)
          const mounted = i < mountedCount
          return (
            <div className="vw-tile" key={i}>
              {mounted ? (
                <iframe
                  key={refreshKeys[i]}
                  className="vw-tile-frame"
                  src={ROUTE}
                  title={`Evan portfolio — panel ${i + 1}`}
                  loading="eager"
                  scrolling="no"
                  style={{
                    width: `${COLS * TILE_W}px`,
                    height: `${ROWS * TILE_H}px`,
                    transform: `translate(${-col * TILE_W}px, ${-row * TILE_H}px)`,
                  }}
                />
              ) : (
                <div className="vw-tile-pending" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
