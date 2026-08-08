# Evan System Phase 4 — 미니맵 + 오토파일럿 투어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 항성계 지도(미니맵)로 어느 정거장이든 한 번에 이동하게 하고, 네비바 오토파일럿 버튼으로 30초 자동 투어를 재생·인터럽트할 수 있게 한다.

**Architecture:** 좌표 계산과 투어 스케줄은 three·DOM에 의존하지 않는 순수 모듈로 분리해 vitest로 검증하고, React 컴포넌트는 그 순수 모듈을 읽어 그리기만 한다. 미니맵은 WebGL 두 번째 뷰포트가 아니라 SVG 오버레이다 — GPU 비용이 없고, 정거장 버튼을 진짜 `<button>`으로 만들 수 있어 키보드·스크린리더가 그대로 동작한다. 미니맵 클릭과 오토파일럿은 둘 다 카메라를 직접 조종하지 않고 **스크롤을 움직인다** — 카메라 레일·도킹 패널·네비바가 이미 스크롤에 물려 있으므로, 스크롤 하나만 움직이면 나머지가 전부 따라온다.

**Tech Stack:** React 19, three.js 0.184 (명령형), Lenis 1.3 (부드러운 스크롤), vitest 4 (환경 `node`), Playwright 1.60.

## Global Constraints

- **R3F(`@react-three/fiber`)를 쓰지 않는다.** 패키지에 설치돼 있지만 이 코드베이스의 3D는 전부 명령형 three.js다. 새 코드도 명령형이어야 한다.
- **아트 디렉션:** 배경은 "검은 우주 + 떠다니는 별"이다. 새 UI가 이 룩을 덮거나 밝기를 올리면 안 된다.
- **vitest 환경은 `node`다.** 단위 테스트 파일에서 `document`, `window`, `sessionStorage`를 쓸 수 없다. DOM이 필요한 검증은 Playwright e2e로 간다.
- **i18n 4개 로케일(`en`, `ko`, `ja`, `zh`) 전부**에 문구를 넣는다. 하나라도 빠지면 `src/i18n/translations.test.js` 계열 검증에서 잡혀야 한다.
- **기존 기능 무손실:** 4개 모드(Terminal/Speedrun/Destruction/Inspect), 해시 내비게이션(`#about` 등), Lab/Guestbook 라우트가 그대로 동작해야 한다.
- **데스크톱 판별 미디어쿼리 문자열은 정확히 `(min-width: 769px) and (min-height: 701px)`** 다. 다른 값을 쓰면 App.jsx·SpaceBackground.jsx의 스테이지 게이트와 어긋난다.
- **정거장 순서는 `STATIONS`가 유일한 진실**이다: `home`(0), `about`(1), `skills`(2), `projects`(3), `contact`(4), `footer`(5). 인덱스를 하드코딩하지 말고 `STATIONS`에서 찾는다.
- **스크롤 진행도 = `window.scrollY / window.innerHeight`.** 데스크톱 메인은 섹션당 정확히 100vh인 슬라이드덱이라 이 식이 곧 정거장 인덱스다.
- 커밋 메시지는 영어, 코드 주석은 이 코드베이스 관례대로 한국어.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/components/Minimap/minimapLayout.js` (신규) | 월드 좌표(XZ) → 0~100 SVG 좌표 변환, 궤도 반지름, 정거장 버튼 목록, 카메라 마커 위치. 순수. |
| `src/components/Minimap/minimapLayout.test.js` (신규) | 위 모듈 단위 테스트. |
| `src/components/Minimap/Minimap.jsx` (신규) | SVG 지도 + 정거장 버튼 렌더, 스크롤 구독, 클릭 시 이동. |
| `src/components/Minimap/Minimap.css` (신규) | 미니맵 스타일. |
| `src/components/Navbar/autopilot.js` (신규) | 30초 투어 스케줄 생성. 순수 (타이머·DOM 미의존). |
| `src/components/Navbar/autopilot.test.js` (신규) | 위 모듈 단위 테스트. |
| `src/components/Navbar/useAutopilot.js` (신규) | 스케줄을 타이머로 재생하고 사용자 입력에 인터럽트되는 훅. |
| `src/hooks/useMediaQuery.js` (신규) | App.jsx의 로컬 `useMediaQuery`를 추출 — Navbar도 같은 데스크톱 판정을 써야 한다. |
| `src/components/Navbar/Navbar.jsx` (수정) | 오토파일럿 토글 버튼 + aria-live 공지 추가. |
| `src/App.jsx` (수정) | 로컬 `useMediaQuery` 제거하고 훅 import, 메인+데스크톱에서 `<Minimap />` 렌더. |
| `src/i18n/translations.js` (수정) | `nav.autopilot`, `nav.autopilotStop`, `nav.autopilotOn`, `nav.autopilotOff`, `minimap.label`, `minimap.home` — 4개 로케일. |
| `src/i18n/translations.test.js` (수정) | 새 키들의 4개 로케일 파리티 검증. |
| `e2e/minimap.spec.js` (신규) | 미니맵 렌더·클릭 이동·마커 추종. |
| `e2e/autopilot.spec.js` (신규) | 투어 시작·진행·인터럽트. |

## 비범위 (Out of Scope)

- 스펙 §7의 "진입 → 이력서 다운로드 2클릭 이내"는 이 플랜에서 별도 작업으로 만들지 않는다. 이력서는 다운로드 링크가 아니라 리드 폼(`ResumeModal`)이며 이는 기존 제품 결정이다. 미니맵이 About을 1클릭으로 만들어 주므로 "미니맵 → About → Resume 버튼"이 폼까지 2클릭이 된다.
- 프로젝트 위성 클릭 → 상세 페이지 진입(스펙 §3.5)은 Phase 6 폴리시 범위다.

---

### Task 1: 미니맵 좌표 모듈

**Files:**
- Create: `src/components/Minimap/minimapLayout.js`
- Test: `src/components/Minimap/minimapLayout.test.js`

**Interfaces:**
- Consumes: `src/components/SpaceBackground/system.js`의 `PLANETS`(`{id, color, radius, orbitRadius, azimuthDeg, ring?}[]`)와 `planetPosition(planet) → [x, 0, z]`; `src/components/SpaceBackground/rail.js`의 `STATIONS`(`{id, position:[x,y,z], target:[x,y,z]}[]`, 길이 6)와 `computeRailPose(progress, reduced) → { position:[x,y,z], target:[x,y,z] }`.
- Produces: `MAP_SIZE`(number, 100), `WORLD_RADIUS`(number, 600), `SUN_POINT`(`{x, y}`), `projectToMap(worldXYZ) → {x, y}`, `MAP_ORBITS`(`{id, r}[]`), `MAP_STATIONS`(`{id, stationIndex, color, x, y}[]`, 길이 5), `cameraMarker(progress, reduced) → {x, y}`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/Minimap/minimapLayout.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { PLANETS, planetPosition } from '../SpaceBackground/system.js'
import { STATIONS } from '../SpaceBackground/rail.js'
import {
  MAP_SIZE,
  WORLD_RADIUS,
  SUN_POINT,
  projectToMap,
  MAP_ORBITS,
  MAP_STATIONS,
  cameraMarker,
} from './minimapLayout.js'

const inside = (p) =>
  p.x >= 0 && p.x <= MAP_SIZE && p.y >= 0 && p.y <= MAP_SIZE

describe('projectToMap', () => {
  it('원점(항성)은 지도 정중앙이다', () => {
    expect(projectToMap([0, 0, 0])).toEqual({ x: 50, y: 50 })
    expect(SUN_POINT).toEqual({ x: 50, y: 50 })
  })

  it('월드 반경 끝이 지도 가장자리로 간다', () => {
    expect(projectToMap([WORLD_RADIUS, 0, 0]).x).toBeCloseTo(MAP_SIZE, 6)
    expect(projectToMap([0, 0, -WORLD_RADIUS]).y).toBeCloseTo(0, 6)
  })

  it('y(높이)는 무시한다 — 위에서 내려다본 XZ 평면 지도다', () => {
    expect(projectToMap([120, 0, -80])).toEqual(projectToMap([120, 999, -80]))
  })
})

describe('MAP_ORBITS', () => {
  it('행성 수만큼 있고 궤도 반지름 순으로 커진다', () => {
    expect(MAP_ORBITS).toHaveLength(PLANETS.length)
    const radii = MAP_ORBITS.map((o) => o.r)
    expect(radii).toEqual([...radii].sort((a, b) => a - b))
  })

  it('가장 바깥 궤도도 지도 안에 들어온다', () => {
    expect(Math.max(...MAP_ORBITS.map((o) => o.r))).toBeLessThan(MAP_SIZE / 2)
  })
})

describe('MAP_STATIONS', () => {
  it('항성(home) + 행성 4개 = 5개다 — footer는 대응하는 지형지물이 없어 버튼이 없다', () => {
    expect(MAP_STATIONS).toHaveLength(1 + PLANETS.length)
    expect(MAP_STATIONS.map((s) => s.id)).toEqual([
      'home',
      ...PLANETS.map((p) => p.id),
    ])
  })

  it('stationIndex가 STATIONS 순서와 일치한다 — 인덱스 하드코딩 금지', () => {
    for (const s of MAP_STATIONS) {
      expect(s.stationIndex).toBe(STATIONS.findIndex((st) => st.id === s.id))
      expect(s.stationIndex).toBeGreaterThanOrEqual(0)
    }
  })

  it('home은 정중앙, 행성은 각자 궤도 반지름만큼 떨어져 있다', () => {
    const home = MAP_STATIONS[0]
    expect({ x: home.x, y: home.y }).toEqual(SUN_POINT)
    for (const p of PLANETS) {
      const s = MAP_STATIONS.find((m) => m.id === p.id)
      const d = Math.hypot(s.x - SUN_POINT.x, s.y - SUN_POINT.y)
      expect(d).toBeCloseTo((p.orbitRadius * (MAP_SIZE / 2)) / WORLD_RADIUS, 6)
    }
  })

  it('색은 #rrggbb 6자리 문자열이다 — SVG fill에 그대로 들어간다', () => {
    for (const s of MAP_STATIONS) {
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('모든 버튼이 지도 안에 있다', () => {
    for (const s of MAP_STATIONS) expect(inside(s)).toBe(true)
  })
})

describe('cameraMarker', () => {
  it('progress=0은 home 정거장 카메라 위치를 투영한 점이다', () => {
    expect(cameraMarker(0)).toEqual(projectToMap(STATIONS[0].position))
  })

  it('마지막 정거장(footer)에서도 지도 밖으로 나가지 않는다 — WORLD_RADIUS를 이만큼 잡은 이유', () => {
    const last = cameraMarker(STATIONS.length - 1)
    expect(last).toEqual(projectToMap(STATIONS[STATIONS.length - 1].position))
    expect(inside(last)).toBe(true)
  })

  it('레일 전 구간에서 지도 밖으로 나가지 않는다', () => {
    for (let p = 0; p <= STATIONS.length - 1; p += 0.05) {
      expect(inside(cameraMarker(p))).toBe(true)
    }
  })

  it('reduced=true면 가장 가까운 정거장으로 스냅한다 (레일과 동일 계약)', () => {
    expect(cameraMarker(1.4, true)).toEqual(projectToMap(STATIONS[1].position))
    expect(cameraMarker(1.6, true)).toEqual(projectToMap(STATIONS[2].position))
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/components/Minimap/minimapLayout.test.js`
Expected: FAIL — `Failed to resolve import "./minimapLayout.js"`

- [ ] **Step 3: 모듈을 구현한다**

`src/components/Minimap/minimapLayout.js`:

```js
// 미니맵 좌표 변환 (순수 — three·DOM 미의존, 단위 테스트 대상).
// 항성계를 위에서 내려다본 XZ 평면을 0~100 정사각 뷰박스에 담는다.
import { PLANETS, planetPosition } from '../SpaceBackground/system.js'
import { STATIONS, computeRailPose } from '../SpaceBackground/rail.js'

// 뷰박스 한 변(SVG 사용자 단위). 정사각이라 종횡비 왜곡이 없다.
export const MAP_SIZE = 100

// 지도가 담아야 하는 월드 반경. 기준은 가장 바깥 궤도(425)가 아니라 가장 먼
// 정거장인 footer 카메라(z=560)다 — 마커가 지도 밖으로 나가면 "현재 위치"라는
// 미니맵의 유일한 기능이 깨진다. 600은 거기에 약간의 여백을 더한 값이다.
export const WORLD_RADIUS = 600

const SCALE = MAP_SIZE / 2 / WORLD_RADIUS

export const SUN_POINT = { x: MAP_SIZE / 2, y: MAP_SIZE / 2 }

// 높이(y)는 버린다 — 위에서 내려다본 평면도이므로 XZ만 쓴다.
export function projectToMap([x, , z]) {
  return { x: MAP_SIZE / 2 + x * SCALE, y: MAP_SIZE / 2 + z * SCALE }
}

export const MAP_ORBITS = PLANETS.map((p) => ({
  id: p.id,
  r: p.orbitRadius * SCALE,
}))

// three의 숫자 색(0x6db5ff)을 SVG fill이 그대로 먹을 수 있는 형태로.
function toHex(color) {
  return '#' + color.toString(16).padStart(6, '0')
}

// 지도 버튼이 되는 정거장. footer는 우주에 대응하는 지형지물이 없어 버튼을
// 두지 않는다 — 대신 카메라 마커가 footer 구간에도 계속 따라간다.
export const MAP_STATIONS = [
  {
    id: 'home',
    stationIndex: STATIONS.findIndex((s) => s.id === 'home'),
    color: '#ffd9a0',
    ...SUN_POINT,
  },
  ...PLANETS.map((p) => ({
    id: p.id,
    stationIndex: STATIONS.findIndex((s) => s.id === p.id),
    color: toHex(p.color),
    ...projectToMap(planetPosition(p)),
  })),
]

export function cameraMarker(progress, reduced = false) {
  return projectToMap(computeRailPose(progress, reduced).position)
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/components/Minimap/minimapLayout.test.js`
Expected: PASS (전부 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/components/Minimap/minimapLayout.js src/components/Minimap/minimapLayout.test.js
git commit -m "feat(minimap): world-to-map projection and station layout"
```

---

### Task 2: 미니맵 컴포넌트

**Files:**
- Create: `src/components/Minimap/Minimap.jsx`, `src/components/Minimap/Minimap.css`, `e2e/minimap.spec.js`
- Modify: `src/App.jsx`, `src/i18n/translations.js`

**Interfaces:**
- Consumes: Task 1의 `MAP_SIZE`, `MAP_ORBITS`, `MAP_STATIONS`, `SUN_POINT`, `cameraMarker(progress, reduced)`; `src/components/SpaceBackground/rail.js`의 `STATIONS`; `src/hooks/useLenis.js`의 `getLenis() → Lenis | null`; `src/context/LangContext.jsx`의 `useLang() → { lang, setLang, t }`.
- Produces: default export `Minimap` (props 없음). DOM 계약 — 루트는 `nav.minimap`, 정거장 버튼은 `button.minimap-btn`(접근성 이름 = 섹션 이름), 카메라 마커는 `circle.minimap-marker`. Task 5의 e2e가 이 선택자에 의존한다.

- [ ] **Step 1: i18n 문구를 넣는다**

`src/i18n/translations.js`의 각 로케일 객체에서 `nav: { ... }` **블록 바로 다음 줄**에 `minimap` 블록을 추가한다. 네 로케일 모두에 넣는다 (파일 안에 `nav:` 가 네 번 나온다 — 전부).

`en`:
```js
    minimap: { label: 'System map', home: 'Home' },
```
`ko`:
```js
    minimap: { label: '항성계 지도', home: '홈' },
```
`ja`:
```js
    minimap: { label: '星系マップ', home: 'ホーム' },
```
`zh`:
```js
    minimap: { label: '星系地图', home: '首页' },
```

- [ ] **Step 2: 컴포넌트를 쓴다**

`src/components/Minimap/Minimap.jsx`:

```jsx
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
```

- [ ] **Step 3: 스타일을 쓴다**

`src/components/Minimap/Minimap.css`:

```css
/* 미니맵: 좌하단 고정 원형 패널. 네비바(z-index 100)보다 아래, 모드
   오버레이(z-index 2100)보다 훨씬 아래에 둔다. */
.minimap {
  position: fixed;
  left: 24px;
  bottom: 24px;
  width: 148px;
  height: 148px;
  z-index: 50;
  border-radius: 50%;
  background: rgba(7, 11, 20, 0.55);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(109, 181, 255, 0.16);
}

.minimap-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.minimap-orbit {
  fill: none;
  stroke: rgba(109, 181, 255, 0.2);
  stroke-width: 0.4;
}

.minimap-dot { opacity: 0.85; }
.minimap-dot--on { opacity: 1; }

/* 현재 카메라 위치. 흰 점 + 옅은 링 — 검은 우주 톤을 밝히지 않는 최소 표시. */
.minimap-marker {
  fill: #fff;
  stroke: rgba(255, 255, 255, 0.45);
  stroke-width: 1.4;
}

.minimap-buttons {
  position: absolute;
  inset: 0;
  list-style: none;
  margin: 0;
  padding: 0;
}

/* left/top이 0~100 퍼센트로 들어온다 — 뷰박스가 0~100 정사각이라 SVG 좌표와
   퍼센트가 1:1로 맞는다. */
.minimap-buttons li {
  position: absolute;
  transform: translate(-50%, -50%);
}

.minimap-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.18s;
}

.minimap-btn:hover { border-color: rgba(255, 255, 255, 0.45); }
.minimap-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.minimap-btn--on { border-color: rgba(255, 255, 255, 0.7); }

.minimap-btn-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .minimap { width: 118px; height: 118px; left: 16px; bottom: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .minimap-btn { transition: none; }
}
```

- [ ] **Step 4: App.jsx에 연결한다**

`src/App.jsx` 상단 import 블록에서 `HardwareAccelNotice` import 바로 아래에 추가:

```jsx
import Minimap from './components/Minimap/Minimap'
```

그리고 `AppContent`의 return 안, `{isMainPage && <ModeLayer />}` 줄 **바로 위**에 추가:

```jsx
        {isMainPage && isDesktop && <Minimap />}
```

(`isMainPage`와 `isDesktop`은 `AppContent` 안에 이미 있는 변수다. 미니맵은 데스크톱 슬라이드덱의 정거장 좌표에 의존하므로 모바일에서는 렌더하지 않는다.)

- [ ] **Step 5: 단위 테스트·빌드가 깨지지 않았는지 확인한다**

Run: `npm test`
Expected: PASS — 기존 테스트 전부 통과 (이 태스크는 새 단위 테스트를 추가하지 않는다; DOM 검증은 Step 6의 e2e가 맡는다)

Run: `npm run build`
Expected: 정상 종료 (`built in ...`). "Some chunks are larger than 600 kB" 경고는 이 브랜치 이전부터 있던 것이라 무시한다.

- [ ] **Step 6: e2e 스펙을 쓴다**

`e2e/minimap.spec.js`:

```js
import { test, expect } from '@playwright/test'

// 인트로/도착 시퀀스가 끝난 뒤에 조작해야 우리가 만든 스크롤과 시퀀스가
// 겹치지 않는다. 시퀀스 종료 신호는 Hero의 대기 클래스가 떨어지는 것이다.
// 이 대기만으로 최대 20초를 쓸 수 있어, 호출하는 테스트는 test.slow()로
// 기본 30초 타임아웃을 늘려 둔다 (소프트웨어 렌더링에서 마운트가 느리다).
async function settle(page) {
  await expect(page.locator('section.hero')).not.toHaveClass(
    /hero--awaiting-arrival/,
    { timeout: 20000 },
  )
}

test('데스크톱 메인에 미니맵이 뜨고 정거장 버튼이 5개다', async ({ page }) => {
  await page.goto('/')
  const map = page.locator('nav.minimap')
  await expect(map).toBeVisible()
  await expect(map.locator('button.minimap-btn')).toHaveCount(5)
})

test('정거장 버튼을 누르면 그 섹션 위치로 스크롤한다', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await settle(page)
  const vh = await page.evaluate(() => window.innerHeight)
  // skills는 STATIONS에서 인덱스 2 — 스크롤 목표는 2 * 뷰포트 높이.
  await page
    .getByRole('navigation', { name: 'System map' })
    .getByRole('button', { name: 'Skills' })
    .click()
  await page.waitForFunction(
    (h) => Math.abs(window.scrollY - h * 2) < 8,
    vh,
    { timeout: 8000 },
  )
})

test('스크롤하면 카메라 마커가 따라 움직인다', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await settle(page)
  const marker = page.locator('circle.minimap-marker')
  const before = await marker.getAttribute('cy')
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 3))
  await expect
    .poll(async () => marker.getAttribute('cy'), { timeout: 8000 })
    .not.toBe(before)
})

test('미니맵은 모바일 뷰포트에서는 렌더하지 않는다', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 500, height: 900 } })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('nav.minimap')).toHaveCount(0)
  await context.close()
})
```

- [ ] **Step 7: e2e를 돌린다**

Run: `npx playwright test e2e/minimap.spec.js`
Expected: 4 passed

- [ ] **Step 8: 커밋**

```bash
git add src/components/Minimap/Minimap.jsx src/components/Minimap/Minimap.css \
        src/App.jsx src/i18n/translations.js e2e/minimap.spec.js
git commit -m "feat(minimap): corner system map with click-to-travel stations"
```

---

### Task 3: 오토파일럿 투어 스케줄

**Files:**
- Create: `src/components/Navbar/autopilot.js`
- Test: `src/components/Navbar/autopilot.test.js`

**Interfaces:**
- Consumes: 없음 (완전 독립 순수 모듈).
- Produces: 상수 `TOUR_LEG_MS`(3000), `TOUR_DWELL_MS`(2000), `TOUR_STEP_MS`(5000), `TOUR_TOTAL_MS`(30000); `buildTourSchedule({ stationCount, reduced }) → { stationIndex, startMs, legMs, dwellMs }[]`; `tourTotalMs({ stationCount, reduced }) → number`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/Navbar/autopilot.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  TOUR_LEG_MS,
  TOUR_DWELL_MS,
  TOUR_STEP_MS,
  TOUR_TOTAL_MS,
  buildTourSchedule,
  tourTotalMs,
} from './autopilot.js'

describe('투어 상수', () => {
  it('한 정거장 = 이동 + 정차', () => {
    expect(TOUR_STEP_MS).toBe(TOUR_LEG_MS + TOUR_DWELL_MS)
  })

  it('기본 6개 정거장 투어가 스펙이 못박은 30초다', () => {
    expect(TOUR_TOTAL_MS).toBe(30000)
    expect(tourTotalMs()).toBe(TOUR_TOTAL_MS)
  })
})

describe('buildTourSchedule', () => {
  it('정거장 수만큼 스텝을 만들고 0부터 순서대로 방문한다', () => {
    const s = buildTourSchedule()
    expect(s).toHaveLength(6)
    expect(s.map((x) => x.stationIndex)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('첫 스텝은 0ms에 시작하고, 시작 시각이 단조 증가한다', () => {
    const s = buildTourSchedule()
    expect(s[0].startMs).toBe(0)
    for (let i = 1; i < s.length; i++) {
      expect(s[i].startMs).toBeGreaterThan(s[i - 1].startMs)
    }
  })

  it('마지막 스텝이 끝나는 시각이 곧 투어 총 길이다', () => {
    const s = buildTourSchedule()
    const last = s[s.length - 1]
    expect(last.startMs + last.legMs + last.dwellMs).toBe(tourTotalMs())
  })

  it('reduced-motion이면 이동을 컷으로 바꾼다 — legMs=0, 정차는 그대로', () => {
    const s = buildTourSchedule({ reduced: true })
    for (const step of s) {
      expect(step.legMs).toBe(0)
      expect(step.dwellMs).toBe(TOUR_DWELL_MS)
    }
    expect(tourTotalMs({ reduced: true })).toBe(6 * TOUR_DWELL_MS)
  })

  it('정거장 수가 달라져도 식이 따라온다 — STATIONS가 늘어도 하드코딩이 깨지지 않는다', () => {
    const s = buildTourSchedule({ stationCount: 3 })
    expect(s).toHaveLength(3)
    expect(tourTotalMs({ stationCount: 3 })).toBe(3 * TOUR_STEP_MS)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/components/Navbar/autopilot.test.js`
Expected: FAIL — `Failed to resolve import "./autopilot.js"`

- [ ] **Step 3: 모듈을 구현한다**

`src/components/Navbar/autopilot.js`:

```js
// 오토파일럿 투어 스케줄 (순수 — 타이머·DOM·Lenis 미의존).
// 정거장마다 "이동(leg) → 정차(dwell)" 한 세트를 재생한다. 스펙이 못박은
// 30초는 6개 정거장 × 5초에서 나온다.
export const TOUR_LEG_MS = 3000
export const TOUR_DWELL_MS = 2000
export const TOUR_STEP_MS = TOUR_LEG_MS + TOUR_DWELL_MS
export const TOUR_TOTAL_MS = 30000

// reduced-motion에서는 카메라 이동을 단순 컷으로 대체한다(스펙 5.4).
// 정차 시간은 그대로 남겨 각 섹션을 읽을 시간은 뺏지 않는다.
function legFor(reduced) {
  return reduced ? 0 : TOUR_LEG_MS
}

export function buildTourSchedule({ stationCount = 6, reduced = false } = {}) {
  const legMs = legFor(reduced)
  const stepMs = legMs + TOUR_DWELL_MS
  return Array.from({ length: stationCount }, (_, i) => ({
    stationIndex: i,
    startMs: i * stepMs,
    legMs,
    dwellMs: TOUR_DWELL_MS,
  }))
}

export function tourTotalMs({ stationCount = 6, reduced = false } = {}) {
  return stationCount * (legFor(reduced) + TOUR_DWELL_MS)
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/components/Navbar/autopilot.test.js`
Expected: PASS (전부 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/components/Navbar/autopilot.js src/components/Navbar/autopilot.test.js
git commit -m "feat(autopilot): 30-second station tour schedule"
```

---

### Task 4: 오토파일럿 재생 훅 + 네비바 버튼

**Files:**
- Create: `src/hooks/useMediaQuery.js`, `src/components/Navbar/useAutopilot.js`, `e2e/autopilot.spec.js`
- Modify: `src/App.jsx`, `src/components/Navbar/Navbar.jsx`, `src/components/Navbar/Navbar.css`, `src/i18n/translations.js`

**Interfaces:**
- Consumes: Task 3의 `buildTourSchedule({ stationCount, reduced })`, `tourTotalMs({ stationCount, reduced })`; `src/components/SpaceBackground/rail.js`의 `STATIONS`; `src/hooks/useLenis.js`의 `getLenis()`.
- Produces: `useMediaQuery(query) → boolean`; `useAutopilot(buttonRef) → { running: boolean, start(): void, stop(): void }`. DOM 계약 — 토글 버튼은 `button.autopilot-btn`, 접근성 이름은 `Autopilot`(정지 중) / `Stop tour`(재생 중), `aria-pressed`가 상태를 반영한다.

- [ ] **Step 1: `useMediaQuery`를 훅 파일로 추출한다**

App.jsx에 이미 있는 로컬 `useMediaQuery`를 Navbar도 써야 한다 — 같은 미디어쿼리 문자열을 두 번 적어 두면 한쪽만 고쳐질 때 스테이지 게이트와 버튼 표시가 어긋난다.

`src/hooks/useMediaQuery.js` (신규):

```js
import { useEffect, useState } from 'react'

// 데스크톱 슬라이드덱/스테이지 게이트가 쓰는 미디어쿼리를 여러 컴포넌트가
// 공유한다 — 조건 문자열이 갈라지면 스테이지는 켜졌는데 UI는 안 뜨는 식으로
// 조용히 어긋난다.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const listener = () => setMatches(media.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])

  return matches
}
```

`src/App.jsx`에서 로컬 `function useMediaQuery(query) { ... }` 정의(현재 74~87행)를 **통째로 삭제**하고, import 블록 끝(`import Minimap ...` 다음 줄)에 추가:

```jsx
import { useMediaQuery } from './hooks/useMediaQuery'
```

(`MainPage`와 `AppContent`의 호출부는 그대로 둔다 — 이름과 시그니처가 같다.)

- [ ] **Step 2: i18n 문구를 넣는다**

`src/i18n/translations.js`의 각 로케일 `nav` 블록에 키 4개를 추가한다 (기존 키는 건드리지 않는다).

`en`:
```js
      autopilot: 'Autopilot', autopilotStop: 'Stop tour',
      autopilotOn: 'Autopilot tour started', autopilotOff: 'Autopilot tour stopped',
```
`ko`:
```js
      autopilot: '오토파일럿', autopilotStop: '투어 중지',
      autopilotOn: '오토파일럿 투어를 시작했습니다', autopilotOff: '오토파일럿 투어를 중지했습니다',
```
`ja`:
```js
      autopilot: 'オートパイロット', autopilotStop: 'ツアー停止',
      autopilotOn: 'オートパイロットツアーを開始しました', autopilotOff: 'オートパイロットツアーを停止しました',
```
`zh`:
```js
      autopilot: '自动巡航', autopilotStop: '停止巡览',
      autopilotOn: '自动巡航已开始', autopilotOff: '自动巡航已停止',
```

- [ ] **Step 3: 재생 훅을 쓴다**

`src/components/Navbar/useAutopilot.js`:

```js
import { useCallback, useEffect, useRef, useState } from 'react'
import { getLenis } from '../../hooks/useLenis'
import { STATIONS } from '../SpaceBackground/rail.js'
import { buildTourSchedule, tourTotalMs } from './autopilot.js'

// 사용자의 진짜 입력만 인터럽트로 친다. 'scroll'은 절대 넣으면 안 된다 —
// 오토파일럿 자신의 Lenis 애니메이션이 매 프레임 scroll을 쏘므로, 넣는 순간
// 투어가 시작하자마자 스스로를 멈춘다.
const INTERRUPT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown']

export function useAutopilot(buttonRef) {
  const [running, setRunning] = useState(false)
  const timersRef = useRef([])

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id)
    timersRef.current = []
  }, [])

  const stop = useCallback(() => {
    clearTimers()
    setRunning(false)
  }, [clearTimers])

  const start = useCallback(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const opts = { stationCount: STATIONS.length, reduced }
    clearTimers()
    setRunning(true)
    for (const step of buildTourSchedule(opts)) {
      timersRef.current.push(
        setTimeout(() => {
          // 카메라가 아니라 스크롤을 움직인다 — 레일·도킹 패널·네비바가 모두
          // 스크롤에 물려 있으므로 이것 하나로 전부 따라온다.
          const top = step.stationIndex * window.innerHeight
          const lenis = getLenis()
          if (lenis) {
            if (step.legMs > 0) lenis.scrollTo(top, { duration: step.legMs / 1000 })
            else lenis.scrollTo(top, { immediate: true })
          } else {
            window.scrollTo({ top, behavior: step.legMs > 0 ? 'smooth' : 'auto' })
          }
        }, step.startMs),
      )
    }
    timersRef.current.push(setTimeout(stop, tourTotalMs(opts)))
  }, [clearTimers, stop])

  useEffect(() => {
    if (!running) return
    // 투어를 시작시킨 바로 그 클릭의 pointerdown이 곧장 인터럽트로 잡히지
    // 않도록 다음 매크로태스크에 리스너를 건다. 그 뒤에도 토글 버튼 자신에서
    // 나온 입력은 무시한다 — 정지는 버튼의 onClick이 맡는다.
    let detach = () => {}
    const attachId = setTimeout(() => {
      const onInterrupt = (e) => {
        if (buttonRef.current?.contains(e.target)) return
        stop()
      }
      for (const type of INTERRUPT_EVENTS) {
        window.addEventListener(type, onInterrupt, { passive: true })
      }
      detach = () => {
        for (const type of INTERRUPT_EVENTS) {
          window.removeEventListener(type, onInterrupt)
        }
      }
    }, 0)
    return () => {
      clearTimeout(attachId)
      detach()
    }
  }, [running, stop, buttonRef])

  // 언마운트(라우트 이동 등)에서 예약된 스크롤이 살아남으면 다른 페이지를
  // 제멋대로 스크롤한다.
  useEffect(() => clearTimers, [clearTimers])

  return { running, start, stop }
}
```

- [ ] **Step 4: 네비바에 버튼을 붙인다**

`src/components/Navbar/Navbar.jsx`의 import 블록에 추가:

```jsx
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useAutopilot } from './useAutopilot'
```

(`useRef`는 파일 첫 줄에서 이미 import 하고 있다.)

`LangSwitcher` 함수 정의가 끝난 **바로 다음**에 새 컴포넌트를 추가:

```jsx
function AutopilotButton() {
  const { t } = useLang()
  const btnRef = useRef(null)
  const { running, start, stop } = useAutopilot(btnRef)
  const label = running ? t.nav.autopilotStop : t.nav.autopilot

  // 라이브 영역은 "내용이 바뀔 때" 읽힌다. 첫 렌더부터 문구가 들어 있으면
  // 아무도 아무것도 하지 않았는데 "투어를 중지했습니다"가 읽힐 수 있으므로
  // 최초 렌더는 비워 두고, 실제 상태 전이에서만 문구를 채운다.
  const firstRenderRef = useRef(true)
  const [announced, setAnnounced] = useState('')
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }
    setAnnounced(running ? t.nav.autopilotOn : t.nav.autopilotOff)
  }, [running, t])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`nav-icon-btn autopilot-btn ${running ? 'autopilot-btn--on' : ''}`}
        aria-pressed={running}
        title={label}
        onClick={() => (running ? stop() : start())}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <polygon points="10 8 16 12 10 16" fill="currentColor" stroke="none" />
        </svg>
        <span className="nav-icon-btn-label">{label}</span>
      </button>
      {/* 투어 시작/중지는 화면이 스스로 움직이는 변화라 시각 외 사용자에게는
          아무 신호가 없다 — 상태를 소리로도 알린다. */}
      <p className="autopilot-status" role="status">{announced}</p>
    </>
  )
}
```

`Navbar` 함수 본문에서 `const navigate = useNavigate()` 바로 아래에 추가:

```jsx
  const isDesktop = useMediaQuery('(min-width: 769px) and (min-height: 701px)')
```

그리고 `.nav-controls` 안, `{location.pathname === '/' && <ModeMenu />}` 줄 **바로 위**에 추가:

```jsx
          {location.pathname === '/' && isDesktop && <AutopilotButton />}
```

- [ ] **Step 5: 스타일을 추가한다**

`src/components/Navbar/Navbar.css` 맨 끝에 추가:

```css
/* 오토파일럿 토글: 재생 중이면 액센트로 켜진 상태를 보여준다. */
.autopilot-btn--on {
  color: #fff;
  background: rgba(109, 181, 255, 0.16);
  border-color: rgba(109, 181, 255, 0.45);
}

/* 스크린리더 전용 상태 공지 — 화면에는 자리를 차지하지 않는다. */
.autopilot-status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
```

- [ ] **Step 6: 단위 테스트·빌드·린트를 확인한다**

Run: `npm test`
Expected: PASS — 기존 테스트 전부 통과 (`useMediaQuery` 추출로 깨지는 게 없어야 한다)

Run: `npm run build`
Expected: 정상 종료

Run: `npx eslint src/hooks/useMediaQuery.js src/components/Navbar/useAutopilot.js src/components/Navbar/Navbar.jsx src/App.jsx`
Expected: 오류 0건

- [ ] **Step 7: e2e 스펙을 쓴다**

`e2e/autopilot.spec.js`:

```js
import { test, expect } from '@playwright/test'

// 도착 시퀀스 종료 대기에만 최대 20초가 들 수 있어, 호출하는 테스트는
// test.slow()로 기본 30초 타임아웃을 늘린다.
async function settle(page) {
  await expect(page.locator('section.hero')).not.toHaveClass(
    /hero--awaiting-arrival/,
    { timeout: 20000 },
  )
}

test('오토파일럿 버튼이 데스크톱 메인에만 있다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Autopilot' })).toBeVisible()
  await page.goto('/guestbook')
  await expect(page.getByRole('button', { name: 'Autopilot' })).toHaveCount(0)
})

test('투어를 시작하면 스스로 다음 정거장으로 항행한다', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await settle(page)
  const vh = await page.evaluate(() => window.innerHeight)
  await page.getByRole('button', { name: 'Autopilot' }).click()
  await expect(page.getByRole('button', { name: 'Stop tour' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // 스텝 1(about, 인덱스 1)은 5초에 출발해 8초에 도착한다 — 여유를 두고 기다린다.
  await page.waitForFunction((h) => window.scrollY > h * 0.9, vh, { timeout: 15000 })
})

test('휠 입력이 들어오면 투어가 즉시 멈춘다', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await settle(page)
  await page.getByRole('button', { name: 'Autopilot' }).click()
  await expect(page.getByRole('button', { name: 'Stop tour' })).toBeVisible()
  await page.mouse.wheel(0, 200)
  await expect(page.getByRole('button', { name: 'Autopilot' })).toBeVisible({
    timeout: 5000,
  })
})

test('버튼을 다시 누르면 멈춘다 — 자기 클릭이 인터럽트로 잡혀 토글이 깨지지 않아야 한다', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await settle(page)
  const start = page.getByRole('button', { name: 'Autopilot' })
  await start.click()
  const stopBtn = page.getByRole('button', { name: 'Stop tour' })
  // 인터럽트 리스너가 붙은 뒤에도 버튼 자신의 클릭은 무시돼야 한다.
  await page.waitForTimeout(500)
  await expect(stopBtn).toBeVisible()
  await stopBtn.click()
  await expect(start).toHaveAttribute('aria-pressed', 'false')
})
```

- [ ] **Step 8: e2e를 돌린다**

Run: `npx playwright test e2e/autopilot.spec.js`
Expected: 4 passed

- [ ] **Step 9: 커밋**

```bash
git add src/hooks/useMediaQuery.js src/components/Navbar/useAutopilot.js \
        src/components/Navbar/Navbar.jsx src/components/Navbar/Navbar.css \
        src/App.jsx src/i18n/translations.js e2e/autopilot.spec.js
git commit -m "feat(autopilot): navbar toggle that runs and interrupts the tour"
```

---

### Task 5: i18n 파리티 · reduced-motion 마감 검증

**Files:**
- Modify: `src/i18n/translations.test.js`, `e2e/minimap.spec.js`, `e2e/autopilot.spec.js`

**Interfaces:**
- Consumes: Task 2가 넣은 `translations[locale].minimap.{label, home}`, Task 4가 넣은 `translations[locale].nav.{autopilot, autopilotStop, autopilotOn, autopilotOff}`; Task 2·4의 DOM 계약(`nav.minimap`, `button.minimap-btn`, `circle.minimap-marker`, `button.autopilot-btn`).
- Produces: 없음 (검증 전용 태스크).

- [ ] **Step 1: 실패하는 i18n 파리티 테스트를 쓴다**

`src/i18n/translations.test.js` 맨 끝에 추가:

```js
describe('Phase 4 내비게이션 문구', () => {
  const NAV_KEYS = ['autopilot', 'autopilotStop', 'autopilotOn', 'autopilotOff']
  const MINIMAP_KEYS = ['label', 'home']

  for (const locale of LOCALES) {
    it(`${locale}에 오토파일럿·미니맵 문구가 모두 있다`, () => {
      for (const key of NAV_KEYS) {
        expect(typeof translations[locale].nav[key]).toBe('string')
        expect(translations[locale].nav[key].length).toBeGreaterThan(0)
      }
      for (const key of MINIMAP_KEYS) {
        expect(typeof translations[locale].minimap[key]).toBe('string')
        expect(translations[locale].minimap[key].length).toBeGreaterThan(0)
      }
    })
  }

  it('로케일마다 다른 문구를 쓴다 — 복붙 누락 방지', () => {
    const labels = LOCALES.map((l) => translations[l].nav.autopilot)
    expect(new Set(labels).size).toBe(LOCALES.length)
  })

  it('영어 버튼 이름은 e2e가 접근성 이름으로 찾는 값과 정확히 같다', () => {
    expect(translations.en.nav.autopilot).toBe('Autopilot')
    expect(translations.en.nav.autopilotStop).toBe('Stop tour')
    expect(translations.en.minimap.label).toBe('System map')
  })
})
```

- [ ] **Step 2: 테스트를 돌려 통과를 확인한다**

Run: `npx vitest run src/i18n/translations.test.js`
Expected: PASS. **FAIL이 나면 Task 2 또는 Task 4의 문구 추가가 네 로케일 중 일부에 빠진 것이다** — 빠진 로케일에 해당 태스크가 지정한 값을 그대로 채워 넣는다.

- [ ] **Step 3: reduced-motion e2e를 추가한다**

`e2e/autopilot.spec.js` 맨 끝에 추가:

```js
test('reduced-motion이면 이동 없이 컷으로 정거장을 넘긴다', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('/')
  // reduced-motion에서는 도착 시퀀스가 즉시 'skipped'로 종결된다.
  await expect(page.locator('section.hero')).not.toHaveClass(
    /hero--awaiting-arrival/,
    { timeout: 5000 },
  )
  const vh = await page.evaluate(() => window.innerHeight)
  await page.getByRole('button', { name: 'Autopilot' }).click()
  // 정차만 남아 스텝이 2초라, 3초 안에 두 번째 정거장(about)에 이미 도달한다.
  await page.waitForFunction((h) => window.scrollY >= h * 0.95, vh, { timeout: 6000 })
  await context.close()
})
```

`e2e/minimap.spec.js` 맨 끝에 추가:

```js
test('reduced-motion에서도 미니맵 이동이 동작한다', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('section.hero')).not.toHaveClass(
    /hero--awaiting-arrival/,
    { timeout: 5000 },
  )
  const vh = await page.evaluate(() => window.innerHeight)
  await page
    .getByRole('navigation', { name: 'System map' })
    .getByRole('button', { name: 'Contact' })
    .click()
  // contact는 STATIONS에서 인덱스 4.
  await page.waitForFunction((h) => Math.abs(window.scrollY - h * 4) < 8, vh, {
    timeout: 8000,
  })
  await context.close()
})
```

- [ ] **Step 4: 새 e2e 두 개를 돌린다**

Run: `npx playwright test e2e/minimap.spec.js e2e/autopilot.spec.js`
Expected: 10 passed

- [ ] **Step 5: 전체 게이트를 돌린다**

Run: `npm test`
Expected: 모든 파일 통과, 실패 0

Run: `npm run build`
Expected: 정상 종료

Run: `npx playwright test`
Expected: `e2e/destruction.spec.js`의 알려진 **기존** 실패 1건을 제외하고 전부 통과. 그 실패는 Phase 1 기준 커밋에서도 재현되는 것으로 이 브랜치와 무관하다 — 새로 깨진 스펙이 하나라도 있으면 그건 이 브랜치의 회귀이므로 보고한다.

- [ ] **Step 6: 커밋**

```bash
git add src/i18n/translations.test.js e2e/minimap.spec.js e2e/autopilot.spec.js
git commit -m "test(nav): i18n parity and reduced-motion coverage for phase 4"
```

---

## 컨트롤러 확인 사항 (구현자에게 넘기지 않는 것)

- **App.jsx의 스냅 로직과의 상호작용:** `MainPage`에는 스크롤이 멈추고 100ms 뒤 가장 가까운 정거장으로 정착시키는 디바운스가 있다(`src/App.jsx:138-152`). 오토파일럿 이동 중에는 스크롤 이벤트가 계속 나 타이머가 계속 리셋되고, 정차 중에는 이미 `idx * vh`에 정확히 있어 `Math.abs(window.scrollY - targetTop) > 1`이 거짓이라 아무 일도 하지 않는다. 즉 충돌하지 않는다 — 구현 중 이 코드를 "고치려" 들지 말 것.
- **Destruction 모드:** DOM 스냅샷은 `#home/#about/#projects/#skills/#contact` 하위 요소만 고른다(`src/modes/Destruction/snapshot.js`). 미니맵과 네비바 버튼은 그 바깥이라 영향이 없다.
- **최종 시각 QA(브라우저):** 미니맵이 검은 우주 톤을 밝히지 않는지, 도킹 패널과 겹치지 않는지(패널은 우측 도킹, 미니맵은 좌하단), 오토파일럿 30초 투어가 여섯 정거장을 다 돌고 스스로 멈추는지 눈으로 확인한다.
