# Cosmic Mirror Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a webcam face-driven Lab experiment where the visitor's face is drawn as a star portrait and opening the mouth bursts it, supernova-style, into a full-screen nebula that re-coalesces on close.

**Architecture:** Mirror the existing Hand Conductor experiment's structure exactly — a single React component with a background Canvas 2D particle engine and a `idle | camera | mouse` mode machine — but swap MediaPipe's `HandLandmarker` for `FaceLandmarker` (with blendshapes). Pure mapping logic (landmarks → anchor points, blendshapes → scene signals) is extracted into a separate `faceMap.js` module so it is unit-testable, following the codebase convention (`EarthExplorer/landmarks.test.js`, `NonEuclideanPortals/portalMath.test.js`).

**Tech Stack:** React 19, Canvas 2D, `@mediapipe/tasks-vision` (already a dependency), Vitest (unit), Vite (build).

## Global Constraints

- New experiment lives at `src/experiments/CosmicMirror/`, registered only via `src/experiments/index.js` (registry-driven; Gallery and routing pick it up automatically).
- No new npm dependencies. `@mediapipe/tasks-vision` is already installed; load MediaPipe WASM/model from the same CDN sources Hand Conductor uses.
- Canvas 2D is the rendering medium (not Three.js).
- Must fall back to a mouse mode with no blank screen when the camera is denied/unavailable, matching Hand Conductor.
- Webcam video must never leave the browser; state this in the idle UI copy (as Hand Conductor does).
- UI copy is Korean, matching sibling experiments.
- Exactly three blendshape drivers: `jawOpen` (burst), `mouthSmileLeft`/`mouthSmileRight` (warmth), `eyeBlinkLeft`/`eyeBlinkRight` (twinkle). No others.
- `numFaces: 1`. Single face only.

---

### Task 1: Face mapping module (`faceMap.js`)

Pure, dependency-free functions that turn a MediaPipe `FaceLandmarker` result into the two signals the particle engine consumes: portrait **anchor points** (from landmarks) and an **expression** object (from blendshapes). Unit-tested with Vitest.

**Files:**
- Create: `src/experiments/CosmicMirror/faceMap.js`
- Test: `src/experiments/CosmicMirror/faceMap.test.js`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `ANCHOR_INDICES: number[]` — curated FaceLandmarker mesh indices (face oval + eyes + lips).
  - `selectAnchors(landmarks: {x:number,y:number}[], W:number, H:number): {x:number,y:number}[]` — pixel coords for each anchor index, **x mirrored** (`(1 - nx) * W`) to match the mirrored preview.
  - `readExpression(blendshapes: {categoryName:string, score:number}[]): {jawOpen:number, smile:number, blink:number}` — each 0..1.
  - `JAW_OPEN_BURST: number` — burst threshold (`0.45`).
  - `isBurst(jawOpen: number): boolean` — `jawOpen > JAW_OPEN_BURST`.
  - `faceCenter(landmarks, W, H): {x:number,y:number}` — mirrored pixel coords of landmark index `1` (nose tip), the burst origin.

- [ ] **Step 1: Write the failing tests**

```js
// src/experiments/CosmicMirror/faceMap.test.js
import { describe, it, expect } from 'vitest'
import {
  ANCHOR_INDICES,
  selectAnchors,
  readExpression,
  isBurst,
  JAW_OPEN_BURST,
  faceCenter,
} from './faceMap.js'

// Build a fake 468-point landmark array where point i sits at x=i/1000, y=i/500.
const fakeLandmarks = Array.from({ length: 468 }, (_, i) => ({ x: i / 1000, y: i / 500 }))

describe('ANCHOR_INDICES', () => {
  it('is a non-empty list of in-range mesh indices', () => {
    expect(ANCHOR_INDICES.length).toBeGreaterThan(30)
    for (const i of ANCHOR_INDICES) {
      expect(Number.isInteger(i)).toBe(true)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(468)
    }
    // no duplicates
    expect(new Set(ANCHOR_INDICES).size).toBe(ANCHOR_INDICES.length)
  })
})

describe('selectAnchors', () => {
  it('mirrors x and scales to pixels for every anchor index', () => {
    const pts = selectAnchors(fakeLandmarks, 200, 100)
    expect(pts.length).toBe(ANCHOR_INDICES.length)
    const first = ANCHOR_INDICES[0]
    expect(pts[0].x).toBeCloseTo((1 - first / 1000) * 200)
    expect(pts[0].y).toBeCloseTo((first / 500) * 100)
  })
})

describe('readExpression', () => {
  it('extracts jawOpen and averages the paired shapes', () => {
    const bs = [
      { categoryName: 'jawOpen', score: 0.8 },
      { categoryName: 'mouthSmileLeft', score: 0.4 },
      { categoryName: 'mouthSmileRight', score: 0.6 },
      { categoryName: 'eyeBlinkLeft', score: 0.2 },
      { categoryName: 'eyeBlinkRight', score: 0.0 },
    ]
    const e = readExpression(bs)
    expect(e.jawOpen).toBeCloseTo(0.8)
    expect(e.smile).toBeCloseTo(0.5)
    expect(e.blink).toBeCloseTo(0.1)
  })

  it('defaults missing categories to 0', () => {
    const e = readExpression([])
    expect(e).toEqual({ jawOpen: 0, smile: 0, blink: 0 })
  })
})

describe('isBurst', () => {
  it('fires only above the threshold', () => {
    expect(isBurst(JAW_OPEN_BURST + 0.01)).toBe(true)
    expect(isBurst(JAW_OPEN_BURST - 0.01)).toBe(false)
  })
})

describe('faceCenter', () => {
  it('returns the mirrored nose-tip pixel position', () => {
    const c = faceCenter(fakeLandmarks, 200, 100)
    expect(c.x).toBeCloseTo((1 - 1 / 1000) * 200)
    expect(c.y).toBeCloseTo((1 / 500) * 100)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/experiments/CosmicMirror/faceMap.test.js`
Expected: FAIL — cannot resolve `./faceMap.js` (module does not exist yet).

- [ ] **Step 3: Write the module**

```js
// src/experiments/CosmicMirror/faceMap.js
// MediaPipe FaceLandmarker 결과 → 파티클 엔진이 쓰는 순수 신호 변환

// 얼굴 윤곽 + 눈 + 입술의 대표 메시 인덱스 (초상 앵커)
export const ANCHOR_INDICES = [
  // face oval
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
  378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
  162, 21, 54, 103, 67, 109,
  // left eye
  33, 160, 158, 133, 153, 144,
  // right eye
  362, 385, 387, 263, 373, 380,
  // outer lips
  61, 40, 37, 0, 267, 291, 321, 314, 17, 84, 91, 146,
]

const NOSE_TIP = 1

// 미러 화면 기준으로 앵커들을 픽셀 좌표로 변환
export function selectAnchors(landmarks, W, H) {
  return ANCHOR_INDICES.map((i) => ({
    x: (1 - landmarks[i].x) * W,
    y: landmarks[i].y * H,
  }))
}

export function faceCenter(landmarks, W, H) {
  return { x: (1 - landmarks[NOSE_TIP].x) * W, y: landmarks[NOSE_TIP].y * H }
}

// blendshapes 배열 → 표정 신호 세 가지 (0..1)
export function readExpression(blendshapes) {
  const get = (name) =>
    blendshapes.find((b) => b.categoryName === name)?.score ?? 0
  return {
    jawOpen: get('jawOpen'),
    smile: (get('mouthSmileLeft') + get('mouthSmileRight')) / 2,
    blink: (get('eyeBlinkLeft') + get('eyeBlinkRight')) / 2,
  }
}

export const JAW_OPEN_BURST = 0.45

export function isBurst(jawOpen) {
  return jawOpen > JAW_OPEN_BURST
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/experiments/CosmicMirror/faceMap.test.js`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/experiments/CosmicMirror/faceMap.js src/experiments/CosmicMirror/faceMap.test.js
git commit -m "feat(cosmic-mirror): face landmark/blendshape mapping module + tests"
```

---

### Task 2: Component shell — particle engine, mouse fallback, idle UI, registry

Build the `CosmicMirror` component with the background particle engine, the idle screen, the mouse fallback mode, its CSS, and the registry entry. After this task the experiment is reachable at `/gallery/cosmic-mirror`, shows in the gallery carousel, and is fully interactive in **mouse mode** (cursor gathers stars, click = supernova burst). Camera mode is wired as a state but its detection loop is added in Task 3 — selecting "카메라 시작" here should still not crash (it renders the preview chrome and, with no detection yet, simply shows the idle particle field; Task 3 fills the loop).

**Files:**
- Create: `src/experiments/CosmicMirror/CosmicMirror.jsx`
- Create: `src/experiments/CosmicMirror/CosmicMirror.css`
- Modify: `src/experiments/index.js` (add lazy import + registry object)
- Modify: `e2e/lab-gallery.spec.js:18,20` (curated-works count 12 → 13)

**Interfaces:**
- Consumes: `isBurst` is not needed here (mouse burst is explicit on click); no imports from `faceMap.js` in this task.
- Produces (refs shared with Task 3's camera effect, defined here):
  - `anchorsRef.current: {x,y}[]` — portrait target points the engine attracts particles toward. Empty array = no portrait (particles just drift).
  - `centerRef.current: {x,y}` — burst origin.
  - `burstRef.current: {t0:number}` — when `performance.now() - t0 < BURST_MS`, an outward pulse is applied. `t0: 0` means inactive.
  - `sceneRef.current: {warmth:number, dim:number}` — `warmth` 0..1 shifts star color warmer; `dim` 0..1 reduces brightness (blink twinkle).
  - Module const `BURST_MS = 550`.

- [ ] **Step 1: Write the component**

```jsx
// src/experiments/CosmicMirror/CosmicMirror.jsx
import { useEffect, useRef, useState } from 'react'
import '../shared/exp.css'
import './CosmicMirror.css'

// 웹캠 표정으로 별 초상을 그리는 실험 — MediaPipe FaceLandmarker + 마우스 폴백
// (카메라 감지 루프는 Task 3에서 채워짐)

const N = 3000
export const BURST_MS = 550
const BASE_STAR = [200, 210, 255] // 차가운 별빛
const WARM_STAR = [255, 214, 170] // 미소 시 따뜻한 색

export default function CosmicMirror() {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const overlayRef = useRef(null)

  const anchorsRef = useRef([]) // {x,y}[] 초상 목표점
  const centerRef = useRef({ x: 0, y: 0 }) // 버스트 원점
  const burstRef = useRef({ t0: 0 }) // 초신성 버스트
  const sceneRef = useRef({ warmth: 0, dim: 0 })

  const [mode, setMode] = useState('idle') // idle | camera | mouse
  const [camError, setCamError] = useState('')
  const [showPreview, setShowPreview] = useState(true)

  // 파티클 엔진 — 모든 모드에서 배경으로 동작
  useEffect(() => {
    const wrap = wrapRef.current
    const cv = canvasRef.current
    const ctx = cv.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio, 2)
    let W = 0
    let H = 0
    const resize = () => {
      W = wrap.clientWidth
      H = wrap.clientHeight
      cv.width = Math.round(W * dpr)
      cv.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const parts = new Float32Array(N * 5) // x, y, vx, vy, blend
    for (let i = 0; i < N; i++) {
      parts[i * 5] = Math.random() * wrap.clientWidth
      parts[i * 5 + 1] = Math.random() * wrap.clientHeight
    }

    let raf = 0
    let running = true
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!running) return
      ctx.fillStyle = 'rgba(4, 6, 14, 0.30)'
      ctx.fillRect(0, 0, W, H)

      const now = performance.now()
      const anchors = anchorsRef.current
      const center = centerRef.current
      const burst = burstRef.current
      const scene = sceneRef.current
      const bursting = burst.t0 > 0 && now - burst.t0 < BURST_MS
      const burstK = bursting ? 1 - (now - burst.t0) / BURST_MS : 0

      const warm = scene.warmth
      const cr = BASE_STAR[0] + (WARM_STAR[0] - BASE_STAR[0]) * warm
      const cg = BASE_STAR[1] + (WARM_STAR[1] - BASE_STAR[1]) * warm
      const cb = BASE_STAR[2] + (WARM_STAR[2] - BASE_STAR[2]) * warm
      const dimK = 1 - scene.dim * 0.6

      for (let i = 0; i < N; i++) {
        let x = parts[i * 5]
        let y = parts[i * 5 + 1]
        let vx = parts[i * 5 + 2]
        let vy = parts[i * 5 + 3]
        let blend = parts[i * 5 + 4] * 0.97

        // 은은한 유영
        vx += Math.sin(y * 0.01 + now * 0.0003) * 0.02
        vy += Math.cos(x * 0.011 + now * 0.00027) * 0.02

        // 가장 가까운 앵커로 인력 (초상 형성)
        if (anchors.length && !bursting) {
          let bx = 0
          let by = 0
          let best = 1e9
          for (const a of anchors) {
            const d2 = (a.x - x) ** 2 + (a.y - y) ** 2
            if (d2 < best) {
              best = d2
              bx = a.x
              by = a.y
            }
          }
          const dx = bx - x
          const dy = by - y
          const d = Math.hypot(dx, dy) + 1e-4
          const F = 260 / (d + 50)
          vx += (dx / d) * F
          vy += (dy / d) * F
          if (d < 90) blend = Math.min(1, blend + 0.08)
        }

        // 초신성 버스트 — 중심에서 바깥으로 밀어냄
        if (bursting) {
          const dx = x - center.x
          const dy = y - center.y
          const d = Math.hypot(dx, dy) + 1e-4
          const F = 14 * burstK
          vx += (dx / d) * F
          vy += (dy / d) * F
          blend = Math.min(1, blend + 0.05 * burstK)
        }

        vx *= 0.93
        vy *= 0.93
        x += vx
        y += vy
        if (x < 0) x += W
        if (x > W) x -= W
        if (y < 0) y += H
        if (y > H) y -= H

        parts[i * 5] = x
        parts[i * 5 + 1] = y
        parts[i * 5 + 2] = vx
        parts[i * 5 + 3] = vy
        parts[i * 5 + 4] = blend

        const k = blend
        const r = BASE_STAR[0] + (cr - BASE_STAR[0]) * k
        const g = BASE_STAR[1] + (cg - BASE_STAR[1]) * k
        const b = BASE_STAR[2] + (cb - BASE_STAR[2]) * k
        const alpha = (0.28 + blend * 0.5) * dimK
        ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`
        const s = 1.4 + blend * 0.8
        ctx.fillRect(x, y, s, s)
      }

      // 버스트 순간 중심 발광
      if (bursting) {
        const grad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, 70 * burstK + 20)
        grad.addColorStop(0, `rgba(255, 240, 210, ${0.5 * burstK})`)
        grad.addColorStop(1, 'rgba(255, 240, 210, 0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(center.x, center.y, 70 * burstK + 20, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    loop()

    const onVis = () => {
      running = !document.hidden
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', resize)
    }
  }, [])

  // 마우스 폴백 — 커서가 앵커, 클릭이 버스트
  useEffect(() => {
    if (mode !== 'mouse') return undefined
    const wrap = wrapRef.current
    const pos = (e) => {
      const r = wrap.getBoundingClientRect()
      const p = { x: e.clientX - r.left, y: e.clientY - r.top }
      anchorsRef.current = [p]
      centerRef.current = p
    }
    const onMove = (e) => pos(e)
    const onDown = (e) => {
      pos(e)
      burstRef.current = { t0: performance.now() }
    }
    wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerdown', onDown)
    return () => {
      wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerdown', onDown)
      anchorsRef.current = []
      sceneRef.current = { warmth: 0, dim: 0 }
    }
  }, [mode])

  return (
    <div className="cosmic-mirror" ref={wrapRef}>
      <canvas ref={canvasRef} className="cm-canvas" />

      {mode === 'idle' && (
        <div className="cm-overlay">
          <h2>Cosmic Mirror</h2>
          <p>
            표정으로 별 초상을 그리려면 카메라 권한이 필요합니다.
            <br />
            영상은 브라우저 밖으로 전송되지 않습니다.
          </p>
          <div className="cm-actions">
            <button type="button" className="cm-primary" onClick={() => setMode('camera')}>
              카메라 시작
            </button>
            <button type="button" onClick={() => setMode('mouse')}>
              마우스로 체험
            </button>
          </div>
          <p className="cm-hint">😮 입 벌리기 — 초신성 · 🙂 미소 — 따뜻한 성운 · 😌 깜빡임 — 별의 반짝임</p>
        </div>
      )}

      {mode === 'camera' && (
        <div className={`cm-preview${showPreview ? '' : ' hidden'}`}>
          <video ref={videoRef} muted playsInline />
          <canvas ref={overlayRef} width="160" height="120" />
          <button type="button" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? '카메라 숨기기' : '카메라 보기'}
          </button>
        </div>
      )}

      {mode === 'mouse' && (
        <div className="cm-badge">
          마우스 모드{camError ? ` — ${camError}` : ''} · 이동 — 별 모으기 · 클릭 — 초신성
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write the CSS**

```css
/* src/experiments/CosmicMirror/CosmicMirror.css */
.cosmic-mirror {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #04060e;
}

.cm-canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.cm-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
  padding: 24px;
  background: rgba(4, 6, 14, 0.55);
  backdrop-filter: blur(4px);
}

.cm-overlay h2 {
  margin: 0;
  font-size: 26px;
  letter-spacing: 0.04em;
  color: #c4b5fd;
}

.cm-overlay p {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(226, 232, 240, 0.75);
}

.cm-actions {
  display: flex;
  gap: 12px;
}

.cm-actions button {
  padding: 10px 24px;
  border-radius: 999px;
  border: 1px solid rgba(226, 232, 240, 0.3);
  background: transparent;
  color: #e2e8f0;
  font-size: 14px;
  cursor: pointer;
}

.cm-actions .cm-primary {
  border-color: #c4b5fd;
  background: rgba(196, 181, 253, 0.15);
  color: #c4b5fd;
}

.cm-actions button:hover {
  background: rgba(226, 232, 240, 0.1);
}

.cm-actions .cm-primary:hover {
  background: rgba(196, 181, 253, 0.28);
}

.cm-hint {
  font-size: 12px !important;
  color: rgba(148, 163, 184, 0.7) !important;
}

.cm-preview {
  position: absolute;
  left: 18px;
  bottom: 18px;
  width: 160px;
}

.cm-preview video,
.cm-preview canvas {
  position: absolute;
  bottom: 24px;
  left: 0;
  width: 160px;
  height: 120px;
  border-radius: 10px;
}

.cm-preview video {
  object-fit: cover;
  transform: scaleX(-1);
  border: 1px solid rgba(196, 181, 253, 0.4);
}

.cm-preview.hidden video,
.cm-preview.hidden canvas {
  display: none;
}

.cm-preview button {
  position: absolute;
  bottom: 0;
  left: 0;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(4, 6, 14, 0.7);
  color: rgba(226, 232, 240, 0.7);
  font-size: 11px;
  cursor: pointer;
}

.cm-badge {
  position: absolute;
  left: 18px;
  bottom: 18px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(6, 8, 18, 0.7);
  border: 1px solid rgba(196, 181, 253, 0.3);
  color: rgba(226, 232, 240, 0.7);
  font-size: 12px;
  pointer-events: none;
}
```

- [ ] **Step 3: Register the experiment**

In `src/experiments/index.js`, add the lazy import next to the others:

```js
const CosmicMirror = lazy(() => import('./CosmicMirror/CosmicMirror'))
```

And append this object to the end of the `experiments` array (after `non-euclidean-portals`):

```js
  {
    id: 'cosmic-mirror',
    title: 'Cosmic Mirror',
    description:
      '웹캠 속 당신의 얼굴이 별로 그린 초상이 됩니다. 입을 벌리면 초신성처럼 터져 성운으로 흩어졌다가 다물면 다시 얼굴로 모이고, 미소는 성운을 따뜻하게, 깜빡임은 별을 반짝이게 합니다. 카메라가 없으면 마우스 모드로 동작합니다.',
    tags: ['mediapipe', 'webcam', 'face'],
    color: '#c4b5fd',
    planet: 'saturn',
    planetName: 'MIRROR',
    symbol: '◐',
    fullscreen: true,
    component: CosmicMirror,
  },
```

- [ ] **Step 4: Update the gallery e2e count (12 → 13)**

In `e2e/lab-gallery.spec.js`, update the test that asserts the curated-works count:

- Line 18: `test('gallery shows 12 curated works', ...)` → `test('gallery shows 13 curated works', ...)`
- Line 20: `await expect(page.locator('.carousel-card')).toHaveCount(12)` → `toHaveCount(13)`

- [ ] **Step 5: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: lint clean (no errors), build exits 0. The new component and registry entry compile; the lazy chunk for `CosmicMirror` is emitted.

- [ ] **Step 6: Verify mouse mode end-to-end in the browser**

Run: `npm run dev`, open `http://localhost:5173/gallery/cosmic-mirror`, click "마우스로 체험".
Confirm by observation: moving the pointer gathers/brightens stars toward the cursor; clicking fires a visible outward supernova burst with a central glow; the badge reads "마우스 모드 … 클릭 — 초신성". No console errors.

- [ ] **Step 7: Commit**

```bash
git add src/experiments/CosmicMirror/CosmicMirror.jsx src/experiments/CosmicMirror/CosmicMirror.css src/experiments/index.js e2e/lab-gallery.spec.js
git commit -m "feat(cosmic-mirror): particle engine, mouse fallback, idle UI, registry"
```

---

### Task 3: Camera + FaceLandmarker integration

Add the `mode === 'camera'` effect that starts the webcam, creates a `FaceLandmarker`, and per frame feeds the particle engine: `selectAnchors` → `anchorsRef` (portrait), `faceCenter` → `centerRef`, and `readExpression` → burst trigger (`isBurst` with a debounce), `sceneRef.warmth` (smile), `sceneRef.dim` (blink). Draws face landmark dots into the small preview overlay. On camera error, falls back to mouse mode (matching Hand Conductor).

**Files:**
- Modify: `src/experiments/CosmicMirror/CosmicMirror.jsx` (add one `useEffect` after the mouse-fallback effect; add `faceMap` import at top)

**Interfaces:**
- Consumes from Task 1: `selectAnchors`, `faceCenter`, `readExpression`, `isBurst`.
- Consumes from Task 2: `anchorsRef`, `centerRef`, `burstRef`, `sceneRef`, `videoRef`, `overlayRef`, `wrapRef`, `setMode`, `setCamError`, `BURST_MS`.
- Produces: nothing new; drives the existing refs.

- [ ] **Step 1: Add the FaceLandmarker import and constants**

At the top of `CosmicMirror.jsx`, add the imports and CDN sources (place the constants next to `N`/`BURST_MS`):

```js
import { selectAnchors, faceCenter, readExpression, isBurst } from './faceMap.js'

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
```

- [ ] **Step 2: Add the camera effect**

Insert this `useEffect` immediately after the mouse-fallback effect and before `return (`:

```jsx
  // 카메라 + MediaPipe FaceLandmarker
  useEffect(() => {
    if (mode !== 'camera') return undefined
    let cancelled = false
    let landmarker = null
    let stream = null
    let raf = 0
    let bursting = false // jawOpen 디바운스
    const wrap = wrapRef.current
    const video = videoRef.current

    ;(async () => {
      try {
        const [{ FilesetResolver, FaceLandmarker }, media] = await Promise.all([
          import('@mediapipe/tasks-vision'),
          navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false }),
        ])
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop())
          return
        }
        stream = media
        video.srcObject = stream
        await video.play()
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
        landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
        })
        if (cancelled) return

        const octx = overlayRef.current?.getContext('2d')
        let lastT = -1
        const detect = () => {
          raf = requestAnimationFrame(detect)
          if (video.currentTime === lastT) return
          lastT = video.currentTime
          const res = landmarker.detectForVideo(video, performance.now())
          const W = wrap.clientWidth
          const H = wrap.clientHeight
          const lm = res.faceLandmarks?.[0]

          if (octx) {
            octx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
          }

          if (!lm) {
            anchorsRef.current = []
            sceneRef.current = { warmth: 0, dim: 0 }
            return
          }

          anchorsRef.current = selectAnchors(lm, W, H)
          centerRef.current = faceCenter(lm, W, H)

          const bs = res.faceBlendshapes?.[0]?.categories ?? []
          const expr = readExpression(bs)
          sceneRef.current = { warmth: Math.min(1, expr.smile * 1.4), dim: expr.blink }

          // 입을 벌리는 "순간"에만 버스트 (한 번 트리거 후 다물어야 재발동)
          if (isBurst(expr.jawOpen)) {
            if (!bursting) {
              bursting = true
              burstRef.current = { t0: performance.now() }
            }
          } else if (expr.jawOpen < 0.25) {
            bursting = false
          }

          if (octx) {
            const ow = overlayRef.current.width
            const oh = overlayRef.current.height
            octx.fillStyle = 'rgba(196, 181, 253, 0.9)'
            for (const pt of lm) {
              octx.beginPath()
              octx.arc((1 - pt.x) * ow, pt.y * oh, 1, 0, Math.PI * 2)
              octx.fill()
            }
          }
        }
        detect()
      } catch (err) {
        if (!cancelled) {
          setCamError(
            err.name === 'NotAllowedError'
              ? '카메라 권한이 거부되어 마우스 모드로 전환했습니다.'
              : '카메라를 사용할 수 없어 마우스 모드로 전환했습니다.',
          )
          setMode('mouse')
        }
      }
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      landmarker?.close()
      anchorsRef.current = []
      sceneRef.current = { warmth: 0, dim: 0 }
    }
  }, [mode])
```

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: lint clean, build exits 0.

- [ ] **Step 4: Verify camera mode end-to-end in the browser**

Run: `npm run dev`, open `/gallery/cosmic-mirror`, click "카메라 시작", grant camera permission. Confirm by observation:
- Particles gather into a recognizable face portrait (oval + eyes + mouth readable) that tracks your head.
- Opening your mouth wide fires a supernova burst that scatters the portrait; closing your mouth lets it re-coalesce; opening again re-triggers only after a close.
- Smiling shifts the star color warmer; blinking dims/twinkles the stars.
- The small preview shows the mirrored webcam with landmark dots; "카메라 숨기기" toggles it.
- Denying permission (or on an unsupported device) switches to mouse mode with the error text in the badge and no blank screen.

- [ ] **Step 5: Commit**

```bash
git add src/experiments/CosmicMirror/CosmicMirror.jsx
git commit -m "feat(cosmic-mirror): FaceLandmarker camera integration — portrait, burst, warmth, twinkle"
```

---

## Self-Review

**Spec coverage:**
- Architecture (single component + Canvas 2D engine + mode machine, FaceLandmarker swap) → Task 2 (engine/shell) + Task 3 (FaceLandmarker). ✓
- Landmarks → portrait anchors → Task 1 (`selectAnchors`) + Task 3 (feeds `anchorsRef`) + Task 2 (engine attraction). ✓
- Three blendshape drivers (jawOpen burst, smile warmth, blink twinkle) → Task 1 (`readExpression`, `isBurst`) + Task 3 (wiring) + Task 2 (engine applies warmth/dim/burst). ✓
- Hybrid (portrait normally, mouth-open burst → re-coalesce) → Task 2 engine `bursting` branch + Task 3 debounced trigger. ✓
- Mouse fallback (cursor anchor, click burst, no blank screen) → Task 2 mouse effect. ✓
- Idle UI with two buttons + "영상은 브라우저 밖으로 전송되지 않습니다" copy → Task 2. ✓
- Registry entry (saturn/MIRROR/◐/#c4b5fd, tags, fullscreen) → Task 2 Step 3. ✓
- Verification: build passes + existing experiments unaffected → Task 2/3 build steps + e2e count fix (Task 2 Step 4). ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The Task 2 note that camera mode is "wired but detection added in Task 3" is a sequencing statement, not a placeholder — camera mode is inert-but-safe after Task 2 and completed in Task 3.

**Type consistency:** `anchorsRef` holds `{x,y}[]`; `selectAnchors` returns `{x,y}[]` ✓. `centerRef`/`faceCenter` both `{x,y}` ✓. `burstRef` is `{t0}` set in both mouse and camera paths, read in engine ✓. `sceneRef` is `{warmth,dim}` written by mouse cleanup/camera and read by engine ✓. `readExpression` returns `{jawOpen,smile,blink}`, consumed in Task 3 ✓. Blendshape category names match the MediaPipe API exactly (`jawOpen`, `mouthSmileLeft`, `mouthSmileRight`, `eyeBlinkLeft`, `eyeBlinkRight`) ✓.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-22-cosmic-mirror.md`.
