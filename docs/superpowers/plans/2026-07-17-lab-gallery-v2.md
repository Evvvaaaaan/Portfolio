# Lab Gallery v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** lab 갤러리의 24개 실험을 10개(유지 2 + 신규 8)로 큐레이션 교체해 창의성·다양성이 강조된 인터랙티브 갤러리를 만든다.

**Architecture:** 각 작품은 `src/experiments/<Name>/<Name>.jsx + .css` 자기완결 디렉토리로 만들고 `src/experiments/index.js`에 lazy 등록한다. 갤러리(코버플로우)·라우팅(`/gallery`, `/gallery/:id`)·ExperimentPage는 건드리지 않고 메타데이터만 교체한다. 새 작품의 갤러리 카드 행성 비주얼은 기존 Gallery.css의 행성 클래스를 재매핑해 재사용한다.

**Tech Stack:** React 19 + Vite, three.js 0.184 (GPGPU/레이마칭), 원시 WebGL2 (유체), Canvas 2D (데이터·제너러티브), Web Audio API, `@mediapipe/tasks-vision` (신규 의존성, Hand Conductor 전용).

**Spec:** `docs/superpowers/specs/2026-07-17-lab-gallery-v2-design.md`

## Global Constraints

- 성능: `Math.min(devicePixelRatio, 2)` 캡. `document.visibilitychange`에서 hidden이면 rAF 루프 정지. 언마운트 시 rAF 취소 + 이벤트 리스너 해제 + WebGL 리소스(`renderer.dispose()`, 텍스처/지오메트리/프로그램) 해제. `matchMedia('(prefers-reduced-motion: reduce)')` 참이면 자동(무입력) 애니메이션은 정지 또는 대폭 감속.
- 컴포넌트 패턴: 기존 작품(DeepSpace 등)과 동일 — `useEffect` 안에서 초기화, `<canvas ref>` 또는 컨테이너 div, `import '../shared/exp.css'` 후 자체 css.
- 데이터 작품: 로딩 중 표시 → 실패 시 한국어 오류 문구 + "다시 시도" 버튼. 외부 요청은 API 키 없는 공개 엔드포인트만.
- 센서 작품 권한 플로우: ① 시작 오버레이(권한이 왜 필요한지 1문장 + 시작 버튼 + 폴백 버튼) ② 허용 → 센서 모드 ③ 거부/미지원/HTTP → 폴백 모드 자동 전환 + 좌하단 뱃지로 폴백 표시.
- 커밋: 태스크당 1커밋, 메시지 형식은 기존 히스토리(`feat(...)`, `fix(...)`) 따름, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 트레일러.
- 각 태스크 종료 전 `npm run lint && npm run build` 클린 통과 확인.
- 시각 작품은 단위 테스트 대신 dev 서버 수동 검증(라우트 진입→렌더→인터랙션→복귀)과 Task 10의 Playwright 스모크로 검증한다.
- SeoulNights/MainInCanvas 디렉토리는 untracked이므로 **절대 삭제하지 않는다** (등록만 해제).

---

### Task 1: 큐레이션 정리 — index.js 재작성 + 구작품 디렉토리 삭제

**Files:**
- Modify: `src/experiments/index.js` (전체 재작성)
- Delete: `src/experiments/{AudioVisualizer,AuroraBorealis,BinaryWorld,DriftingClouds,FluidSim,GenerativeArt,GrowingTree,KeyboardRain,LiveWeatherMood,MeteorShower,MouseTrail,OceanWaves,OrbitalEarth,ParticleField,PhysicsSandbox,PollockOne,ShaderPlayground,ShootingStars,TypographyFX,Vortex}` (tracked 20개)
- 보존: `DeepSpace`, `SolarSystem`, `shared`, `BlueMonochrome`, `ComingSoon`(미등록), `SeoulNights`, `MainInCanvas`(untracked)

**Interfaces:**
- Produces: `experiments` 배열 (유지 2개 엔트리만; SolarSystem·DeepSpace 엔트리는 기존 코드 그대로 복사). 이후 태스크들이 이 배열에 엔트리를 추가한다.

- [ ] **Step 1:** `index.js`를 재작성 — lazy import는 `SolarSystem`, `DeepSpace` 2개만 남기고, `experiments` 배열도 해당 2개 엔트리(기존 내용 그대로)만 남긴다. KeyboardRain `?raw` import 2줄 삭제.
- [ ] **Step 2:** tracked 20개 디렉토리 삭제: `git rm -r src/experiments/AudioVisualizer ... src/experiments/Vortex` (위 목록 전부).
- [ ] **Step 3:** 잔여 참조 검사: `grep -rn "OrbitalEarth\|PollockOne\|KeyboardRain\|BinaryWorld" src/ --exclude-dir=SeoulNights --exclude-dir=MainInCanvas` → 결과 없음 확인.
- [ ] **Step 4:** `npm run lint && npm run build` → 클린. dev 서버에서 `/gallery` 진입 → 카드 2장(SOL, VOID)만 표시, 콘솔 오류 없음.
- [ ] **Step 5:** Commit: `refactor(lab): curate gallery down to signature works before v2 lineup`

---

### Task 2: Particle Morph — GPGPU 모핑 파티클

**Files:**
- Create: `src/experiments/ParticleMorph/ParticleMorph.jsx`, `ParticleMorph.css`
- Modify: `src/experiments/index.js`

**Interfaces:**
- Produces: `ParticleMorph` 컴포넌트. 등록 엔트리(배열에서 SolarSystem 앞, 첫 번째 위치):

```js
{
  id: 'particle-morph',
  title: 'Particle Morph',
  description: '10만 개의 GPGPU 파티클이 글자와 형상 사이를 숨 쉬듯 오가는 모핑 조각. 마우스는 파티클을 밀어내는 힘장이 되고, 클릭하면 다음 형상으로 헤쳐 모입니다.',
  tags: ['gpgpu', 'three.js', 'particles'],
  color: '#c084fc',
  planet: 'venus',
  planetName: 'MORPH',
  symbol: '✳',
  fullscreen: true,
  component: ParticleMorph,
},
```

**구현 명세:**
- three.js FBO ping-pong. `SIM = 320` (320² = 102,400 파티클). 위치 텍스처 RGBA Float32.
- 타깃 형상 4종을 각각 `Float32Array(SIM*SIM*4)`로 사전 계산:
  1. 텍스트 "EVAN" — 오프스크린 2D 캔버스(1024×256, `bold 200px sans-serif`)에 그린 뒤 알파>128 픽셀 좌표 샘플링, z = (rand-0.5)*0.15
  2. 텍스트 "온" 또는 "실험실" (한글) — 같은 방식
  3. 구 — 피보나치 스피어 `y=1-2i/N, r=√(1-y²), θ=i*2.399963`
  4. 토러스 매듭 — `p=2,q=3` 파라메트릭 + 튜브 단면 랜덤
- 시뮬 셰이더 핵심 (매 프레임):

```glsl
vec3 pos = texture2D(uPos, vUv).xyz;
vec3 target = texture2D(uTarget, vUv).xyz;
pos += (target - pos) * 0.055;                       // 스프링 수렴
pos += curlNoise(pos * 0.9 + uTime * 0.12) * 0.012;  // 유휴 부유
vec3 d = pos - uMouse; float r = length(d);
pos += normalize(d) * 0.35 * exp(-r * r * 6.0);       // 마우스 반발
```

- `uTarget`은 모핑 시 이전/다음 타깃 텍스처를 CPU에서 스왑하고 셰이더의 `mix(uTargetA, uTargetB, uMix)`로 2.2초 easeInOut 전환.
- 렌더: `THREE.Points`, additive blending, 파티클 색은 속도 크기에 따라 `#7c3aed→#e879f9` 램프, `sizeAttenuation`.
- 클릭(드래그 아님) 시 다음 형상 순환. 유휴 12초 경과 시 자동 순환. reduced-motion이면 자동 순환 없음.
- 마우스 좌표는 언프로젝트해서 z=0 평면 교점으로 변환.

- [ ] **Step 1:** 컴포넌트+CSS 구현 (위 명세 전부).
- [ ] **Step 2:** index.js에 lazy import + 엔트리 추가.
- [ ] **Step 3:** dev 서버 `/gallery/particle-morph` → 형상 수렴 확인, 마우스 반발 확인, 클릭 전환 확인, 갤러리 복귀 후 재진입(디스포즈 누수 없음, 콘솔 오류 없음).
- [ ] **Step 4:** `npm run lint && npm run build` 클린.
- [ ] **Step 5:** Commit: `feat(lab): add Particle Morph GPGPU experiment`

---

### Task 3: Ink Flow — Navier-Stokes GPU 유체

**Files:**
- Create: `src/experiments/InkFlow/InkFlow.jsx`, `InkFlow.css`
- Modify: `src/experiments/index.js`

**Interfaces:**
- Produces: `InkFlow` 컴포넌트. 등록 엔트리(particle-morph 다음):

```js
{
  id: 'ink-flow',
  title: 'Ink Flow',
  description: 'Navier-Stokes 방정식을 GPU에서 풀어내는 진짜 유체 시뮬레이션. 드래그하면 발광 잉크가 소용돌이치며 퍼지고, 시간이 지나면 서서히 가라앉습니다.',
  tags: ['webgl2', 'fluid', 'simulation'],
  color: '#38bdf8',
  planet: 'neptune',
  planetName: 'INK',
  symbol: '≋',
  fullscreen: true,
  component: InkFlow,
},
```

**구현 명세 (원시 WebGL2, three.js 불사용):**
- 텍스처: velocity RG16F(시뮬 해상도 = 캔버스/2, 최대 512), dye RGBA16F(캔버스 해상도, 최대 1024), pressure/divergence/curl R16F. 전부 ping-pong 쌍. `EXT_color_buffer_float` 필요 — 미지원 시 안내 오버레이("이 기기는 WebGL2 부동소수점 렌더링을 지원하지 않습니다").
- 프레임 파이프라인 (Pavel Dobryakov 구조): advect(velocity) → splat(포인터 이동 시) → curl → vorticity(강도 12) → divergence → pressure jacobi ×20 → gradientSubtract → advect(dye, dissipation 0.985).
- 핵심 셰이더 2개:

```glsl
// splat: 포인터 위치 p, 이동량 dxdy
vec2 d = uv - uPoint; d.x *= uAspect;
float s = exp(-dot(d,d) / uRadius);      // uRadius ≈ 0.0018
outColor = base + s * uForce;            // velocity엔 dxdy*힘, dye엔 색
```

```glsl
// jacobi 압력 반복
float L=texL(uP), R=texR(uP), T=texT(uP), B=texB(uP);
float div = texture(uDiv, uv).x;
outColor = vec4((L + R + T + B - div) * 0.25, 0, 0, 1);
```

- 잉크 색: 시간에 따라 HSV hue 순환(`hue += 0.15/s`), splat마다 현재 hue 색. 표시 셰이더에서 dye에 소프트 블룸 느낌(밝기^1.4 가중 가산).
- 진입 시 자동 splat 3회(중앙에서 무작위 방향)로 첫 화면이 비어 있지 않게. reduced-motion이면 자동 splat 생략.
- 터치 지원 (`pointermove` 통합).

- [ ] **Step 1:** 컴포넌트+CSS 구현.
- [ ] **Step 2:** index.js 등록.
- [ ] **Step 3:** dev 서버 `/gallery/ink-flow` → 드래그 시 소용돌이 잉크 확인, 잔잔해지는 감쇠 확인, 재진입 누수 없음.
- [ ] **Step 4:** `npm run lint && npm run build` 클린.
- [ ] **Step 5:** Commit: `feat(lab): add Ink Flow GPU fluid experiment`

---

### Task 4: Neon Raymarch — SDF 레이마칭

**Files:**
- Create: `src/experiments/NeonRaymarch/NeonRaymarch.jsx`, `NeonRaymarch.css`
- Modify: `src/experiments/index.js`

**Interfaces:**
- Produces: `NeonRaymarch` 컴포넌트. 등록 엔트리(ink-flow 다음):

```js
{
  id: 'neon-raymarch',
  title: 'Neon Raymarch',
  description: '폴리곤 없이 거리 함수만으로 그려내는 네온 공간. 드래그로 궤도를 돌고, 세 개의 슬라이더로 형태·발광·색을 실시간 변형합니다.',
  tags: ['glsl', 'raymarching', 'sdf'],
  color: '#f43f5e',
  planet: 'mars',
  planetName: 'SDF',
  symbol: '◈',
  fullscreen: true,
  component: NeonRaymarch,
},
```

**구현 명세:**
- three.js 풀스크린 쿼드 + ShaderMaterial (또는 원시 WebGL — 구현 단순한 쪽). 내부 해상도 0.75× 렌더 후 업스케일(모바일 성능).
- SDF 장면: 자이로이드 셸 ∩ 구 + 궤도 도는 메타볼 3개, smooth min 융합:

```glsl
float sdGyroid(vec3 p, float f){ p *= f; return abs(dot(sin(p), cos(p.zxy))) / f - 0.18; }
float smin(float a, float b, float k){ float h = clamp(0.5+0.5*(b-a)/k, 0., 1.); return mix(b, a, h) - k*h*(1.-h); }
float map(vec3 p){
  float shell = max(sdGyroid(p, uPower), length(p) - 1.6);   // uPower 3~9
  float balls = 1e9;
  for (int i=0;i<3;i++){ vec3 c = 1.1*vec3(sin(uTime*.5+i*2.1), cos(uTime*.4+i*1.7), sin(uTime*.3+i*2.6)); balls = min(balls, length(p-c)-.32); }
  return smin(shell, balls, .35);
}
```

- 라이팅: 노멀은 4-tap 그래디언트, 네온 글로우는 마칭 중 `glow += 0.02/(0.01+abs(d))` 누적, iq 코사인 팔레트 `0.5+0.5*cos(6.283*(t+uShift)+vec3(0,.33,.67))`.
- 인터랙션: 드래그 궤도(관성 감쇠 0.95, 유휴 시 자동 회전 0.1rad/s — reduced-motion 시 정지), 휠 줌(반경 2.2~5).
- 파라미터 패널(우하단, exp.css 톤): 슬라이더 3개 — Form(uPower), Glow(글로우 계수), Hue(uShift). `<input type="range">`.

- [ ] **Step 1:** 컴포넌트+CSS 구현.
- [ ] **Step 2:** index.js 등록.
- [ ] **Step 3:** dev 서버 `/gallery/neon-raymarch` → 드래그 궤도·휠 줌·슬라이더 3개 실시간 반영 확인, 재진입 누수 없음.
- [ ] **Step 4:** `npm run lint && npm run build` 클린.
- [ ] **Step 5:** Commit: `feat(lab): add Neon Raymarch SDF experiment`

---

### Task 5: Wind Atlas — 실시간 전 지구 바람 지도

**Files:**
- Create: `src/experiments/WindAtlas/WindAtlas.jsx`, `WindAtlas.css`
- Modify: `src/experiments/index.js`

**Interfaces:**
- Produces: `WindAtlas` 컴포넌트. 등록 엔트리(neon-raymarch 다음):

```js
{
  id: 'wind-atlas',
  title: 'Wind Atlas',
  description: '지금 이 순간 지구 위를 흐르는 바람을 수천 개의 입자 궤적으로 그린 실시간 지도. 클릭하면 그 지점의 풍속과 풍향이 나타납니다.',
  tags: ['data-art', 'api', 'canvas'],
  color: '#5eead4',
  planet: 'sky',
  planetName: 'WIND',
  symbol: '🍃',
  fullscreen: true,
  component: WindAtlas,
},
```

**구현 명세:**
- 데이터 ①(바람): Open-Meteo 벌크 요청 1회 — 격자 경도 24 × 위도 11 (경도 -172.5~172.5 step 15, 위도 -75~75 step 15) = 264지점.
  `https://api.open-meteo.com/v1/forecast?latitude=<쉼표목록>&longitude=<쉼표목록>&current=wind_speed_10m,wind_direction_10m` → 응답은 지점별 객체 배열.
- 데이터 ②(해안선): OrbitalEarth와 동일 CDN 패턴 —
  `https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_coastline.geojson`.
  실패 시 해안선 없이 위경도 격자선만으로 동작(기능 유지).
- 두 응답 모두 `sessionStorage` 캐시 (키 `wind-atlas:v1`, `coast:v1`, 바람은 1시간 TTL 타임스탬프 포함).
- 투영: equirectangular `x=(lon+180)/360*W`, `y=(90-lat)/180*H` (여백 상하 24px).
- 바람 벡터: 기상 풍향은 "불어오는 방향"이므로 `u = -speed*sin(dir°), v = -speed*cos(dir°)`. 격자 밖/사이는 바이리니어 보간(경도는 랩어라운드).
- 입자 4,000개: 위치를 매 프레임 `pos += vec * 0.08px/(m/s)`, 수명 80~200프레임, 소멸/화면 밖이면 무작위 재생성. 트레일은 `ctx.fillStyle='rgba(6,10,18,0.07)'; fillRect(전체)` 페이드. 입자 색은 풍속 램프(2m/s `#134e4a` → 20m/s `#5eead4` → 30m/s `#f0fdfa`).
- 클릭: 해당 지점 보간 풍속·풍향을 카드로 표시(위경도 포함), 4초 후 페이드아웃.
- 상태 UI: 로딩 스피너 → 오류 시 "바람 데이터를 불러오지 못했습니다" + 다시 시도 버튼.

- [ ] **Step 1:** 컴포넌트+CSS 구현.
- [ ] **Step 2:** index.js 등록.
- [ ] **Step 3:** dev 서버 `/gallery/wind-atlas` → 입자 흐름·클릭 프로브 확인. DevTools 오프라인 모드로 재진입(sessionStorage 비운 뒤) → 오류 UI + 재시도 동작 확인.
- [ ] **Step 4:** `npm run lint && npm run build` 클린.
- [ ] **Step 5:** Commit: `feat(lab): add Wind Atlas live data experiment`

---

### Task 6: Seismic Echo — 지진 시간 리플레이

**Files:**
- Create: `src/experiments/SeismicEcho/SeismicEcho.jsx`, `SeismicEcho.css`
- Modify: `src/experiments/index.js`

**Interfaces:**
- Produces: `SeismicEcho` 컴포넌트. 등록 엔트리(wind-atlas 다음):

```js
{
  id: 'seismic-echo',
  title: 'Seismic Echo',
  description: '지난 30일간 지구의 맥박 — USGS 실시간 데이터로 수천 건의 지진이 파문으로 울려 퍼지는 시간 리플레이. 타임라인을 문질러 시간을 되감을 수 있습니다.',
  tags: ['data-art', 'api', 'canvas'],
  color: '#facc15',
  planet: 'earth',
  planetName: 'QUAKE',
  symbol: '◎',
  fullscreen: true,
  component: SeismicEcho,
},
```

**구현 명세:**
- 데이터: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson` (M2.5+, 최근 30일, 수천 건). 해안선은 Task 5와 동일 CDN GeoJSON + sessionStorage 캐시 공유(같은 키 `coast:v1`).
- 투영 동일(equirectangular). 배경 거의 검정(#05070c), 해안선 `rgba(148,163,184,0.25)` 1px.
- 리플레이: 30일 구간을 90초로 압축 재생(루프). 가상 시각 `t`가 지진 발생시각을 지나면 파문 생성 — 반경 `r = (t-t0) * k`, k는 규모비례(`M4=28px/s`), 알파 `1-(r/rMax)`, rMax = `M^2*6px`. 규모 색: M<4 `#38bdf8`, 4~5.5 `#facc15`, 5.5~6.5 `#fb923c`, ≥6.5 `#ef4444`. M≥6은 이중 링.
- 타임라인 스크러버(하단): 30일 축 + 현재 위치 핸들, 드래그 시 해당 시점으로 점프(드래그 중 일시정지, 놓으면 재생 재개). 재생/일시정지 버튼. 현재 가상 날짜·시각 + 누적 지진 수 표시.
- 우상단 통계: 총 건수, 최대 규모 이벤트(장소명, 클릭 시 해당 시점 점프).
- 상태 UI: 로딩/오류+재시도 (Task 5와 동일 패턴).
- reduced-motion: 자동 재생 대신 일시정지 상태로 시작.

- [ ] **Step 1:** 컴포넌트+CSS 구현.
- [ ] **Step 2:** index.js 등록.
- [ ] **Step 3:** dev 서버 `/gallery/seismic-echo` → 파문 리플레이·스크러버·통계 점프 확인, 오프라인 오류 UI 확인.
- [ ] **Step 4:** `npm run lint && npm run build` 클린.
- [ ] **Step 5:** Commit: `feat(lab): add Seismic Echo USGS replay experiment`

---

### Task 7: Hand Conductor — 웹캠 손 제스처

**Files:**
- Create: `src/experiments/HandConductor/HandConductor.jsx`, `HandConductor.css`
- Modify: `src/experiments/index.js`, `package.json` (`npm i @mediapipe/tasks-vision`)

**Interfaces:**
- Produces: `HandConductor` 컴포넌트. 등록 엔트리(seismic-echo 다음):

```js
{
  id: 'hand-conductor',
  title: 'Hand Conductor',
  description: '웹캠 속 손이 지휘봉이 됩니다. 핀치로 파티클을 끌어모으고 손바닥을 펼쳐 흩어버리는 제스처 인터랙션. 카메라를 켜지 않으면 마우스 모드로 동작합니다.',
  tags: ['mediapipe', 'webcam', 'gesture'],
  color: '#fb923c',
  planet: 'jupiter',
  planetName: 'HANDS',
  symbol: '✋',
  fullscreen: true,
  component: HandConductor,
},
```

**구현 명세:**
- 시작 오버레이: "손 제스처로 파티클을 지휘하려면 카메라 권한이 필요합니다. 영상은 브라우저 밖으로 전송되지 않습니다." + [카메라 시작] [마우스로 체험] 버튼.
- MediaPipe: `@mediapipe/tasks-vision`의 `HandLandmarker` (`numHands: 2`, VIDEO 모드, GPU delegate 실패 시 CPU). WASM은 `FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@<설치버전>/wasm')`. 모델: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`. 로딩 실패/getUserMedia 거부 → 마우스 폴백 + 뱃지 "마우스 모드".
- 제스처 판정 (손마다): pinch = 엄지끝(4)-검지끝(8) 거리 < 0.06 (정규화 좌표) → 인력장. spread = 손끝 5개(4,8,12,16,20)와 손바닥(0) 평균 거리 > 0.28 → 척력 펄스(1회성, 재-스프레드까지 쿨다운). 그 외 = 손 위치가 부드러운 인력 없음 상태로 파티클 사이를 지나가며 살짝 밀어냄.
- 파티클: Canvas 2D, 3,000개, 속도 감쇠 0.94, 인력 `F = 220/(d+40)`, 척력 펄스 `F = -900/(d+30)` 0.4초. 손 위치엔 발광 커서(왼손 주황 `#fb923c`, 오른손 청록 `#38bdf8`), 파티클 색은 가장 가까운 손 색으로 서서히 블렌드.
- 웹캠 프리뷰: 좌하단 160px 미러 썸네일(끄기 토글), 손 랜드마크 오버레이.
- 마우스 폴백: 이동=지나가는 힘, 클릭 홀드=인력, 릴리즈=척력 펄스 (동일 파티클 엔진).
- 언마운트: MediaStream 트랙 stop, landmarker.close().

- [ ] **Step 1:** `npm i @mediapipe/tasks-vision` 후 컴포넌트+CSS 구현.
- [ ] **Step 2:** index.js 등록.
- [ ] **Step 3:** dev 서버 `/gallery/hand-conductor` → ① 마우스 모드 버튼으로 폴백 동작 확인 ② 카메라 허용 시 핀치/스프레드 반응 확인(가능한 환경에서) ③ 이탈 후 카메라 인디케이터 꺼짐 확인.
- [ ] **Step 4:** `npm run lint && npm run build` 클린.
- [ ] **Step 5:** Commit: `feat(lab): add Hand Conductor gesture experiment`

---

### Task 8: Voice Bloom — 오디오 반응 정원

**Files:**
- Create: `src/experiments/VoiceBloom/VoiceBloom.jsx`, `VoiceBloom.css`
- Modify: `src/experiments/index.js`

**Interfaces:**
- Produces: `VoiceBloom` 컴포넌트. 등록 엔트리(hand-conductor 다음):

```js
{
  id: 'voice-bloom',
  title: 'Voice Bloom',
  description: '목소리가 정원이 됩니다. 낮은 음은 줄기를 밀어 올리고 높은 음은 꽃을 피우는 오디오 반응 제너러티브 가든. 마이크가 없으면 내장 신스가 대신 연주합니다.',
  tags: ['web audio', 'generative', 'mic'],
  color: '#f472b6',
  planet: 'aurora',
  planetName: 'VOICE',
  symbol: '❀',
  fullscreen: true,
  component: VoiceBloom,
},
```

**구현 명세:**
- 시작 오버레이: "목소리로 정원을 피우려면 마이크 권한이 필요합니다. 소리는 저장되지 않습니다." + [마이크 시작] [데모 연주 듣기].
- 오디오: `AnalyserNode` fftSize 2048. 대역 에너지 3개 — bass(40~250Hz), mid(250~2kHz), treble(2k~8kHz). 각 대역은 attack 0.3/decay 0.05 스무딩.
- 데모 폴백: OscillatorNode 2개(사인 베이스 55~110Hz 랜덤워크 + 트라이앵글 멜로디 펜타토닉) + LFO 게인 — 마이크 스트림 대신 이 신스를 analyser에 연결, 뱃지 "데모 모드".
- 정원 (Canvas 2D, 검은 흙 배경 그라데이션):
  - 줄기: 바닥에서 L-system풍 세그먼트 성장 — 성장 속도 `bass*3px/frame`, 각 세그먼트는 약간의 노이즈 굴곡, 최대 12그루(화면폭 균등+지터).
  - 꽃: treble 에너지가 임계 0.4 넘는 순간 활성 줄기 끝에 개화 — 꽃잎 5~8장 방사형 베지어, 크기 `treble*40px`, 색 hue는 mid 에너지로 회전(300°핑크↔180°청록).
  - 반딧불: mid 에너지 비례 개수(0~40), 부유 파티클.
  - 전체 볼륨이 3초 이상 무음이면 정원이 서서히 시들어(알파 감쇠) 다음 소리에 새로 자람.
- 하단에 실시간 3대역 미니 스펙트럼 바(장식 겸 피드백).
- 언마운트: AudioContext close, 스트림 stop.

- [ ] **Step 1:** 컴포넌트+CSS 구현.
- [ ] **Step 2:** index.js 등록.
- [ ] **Step 3:** dev 서버 `/gallery/voice-bloom` → 데모 모드로 줄기·꽃·시듦 사이클 확인, (가능하면) 마이크 모드 확인, 이탈 후 오디오 정지 확인.
- [ ] **Step 4:** `npm run lint && npm run build` 클린.
- [ ] **Step 5:** Commit: `feat(lab): add Voice Bloom audio garden experiment`

---

### Task 9: Poster Lab — 제너러티브 포스터 도구

**Files:**
- Create: `src/experiments/PosterLab/PosterLab.jsx`, `PosterLab.css`
- Modify: `src/experiments/index.js`

**Interfaces:**
- Produces: `PosterLab` 컴포넌트. 등록 엔트리(voice-bloom 다음, 이어서 SolarSystem·DeepSpace 기존 엔트리 순):

```js
{
  id: 'poster-lab',
  title: 'Poster Lab',
  description: '시드 숫자 하나가 스위스 스타일 포스터 한 장이 되는 제너러티브 디자인 도구. 팔레트·그리드·타이포를 조합하고 PNG로 내려받을 수 있습니다.',
  tags: ['generative', 'design-tool', 'export'],
  color: '#e2e8f0',
  planet: 'moon',
  planetName: 'POSTER',
  symbol: '▦',
  fullscreen: false,
  component: PosterLab,
},
```

**구현 명세:**
- 레이아웃: 좌측 포스터 캔버스(A2 비율 1:√2, 내부 해상도 1400×1980, 화면엔 fit), 우측 컨트롤 패널. 모바일은 상하 스택.
- 시드 PRNG:

```js
function mulberry32(a){ return function(){ a|=0; a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; } }
```

- 컨트롤: 시드 숫자 입력 + 🎲 셔플, 팔레트 셀렉트 5종(듀오톤: 적/흑, 청/크림, 흑백, 형광연두/흑, 코발트/오렌지), 밀도 슬라이더(요소 4~14개), 타이틀 텍스트 입력(기본 "LAB·2026", 포스터 대문자 반영), [PNG 내려받기].
- 생성 알고리즘 (같은 시드+옵션 = 항상 같은 포스터):
  1. 12컬럼 그리드 설정, 배경 = 팔레트 바탕색.
  2. 요소 N개(밀도): 종류 가중 랜덤 — 대형 원(25%), 사선 굵은 바(25%), 리듬 반복 스트라이프 그룹(20%), 하프톤 도트 필드(15%), 아웃라인 원호(15%). 전부 그리드 스냅 배치, 1~2개는 의도적으로 블리드(가장자리 걸침).
  3. 타이포: 타이틀은 `900 <시드별 96~200px> Helvetica, Arial` 좌하단 또는 상단 회전 90° 중 랜덤, 보조 라인(시드 번호·날짜 `POSTER Nº<seed>` 등) 소형 그로테스크, 얇은 룰러 라인 1~2개.
  4. 종이 질감: 4% 노이즈 오버레이.
- PNG 내보내기: `canvas.toBlob` → a[download] 클릭, 파일명 `poster-<seed>.png`.

- [ ] **Step 1:** 컴포넌트+CSS 구현.
- [ ] **Step 2:** index.js 등록 (최종 배열 순서: particle-morph, ink-flow, neon-raymarch, wind-atlas, seismic-echo, hand-conductor, voice-bloom, poster-lab, solar-system, deep-space).
- [ ] **Step 3:** dev 서버 `/gallery/poster-lab` → 같은 시드 재현성, 셔플·팔레트·밀도·타이틀 반영, PNG 다운로드 확인.
- [ ] **Step 4:** `npm run lint && npm run build` 클린.
- [ ] **Step 5:** Commit: `feat(lab): add Poster Lab generative design tool`

---

### Task 10: 마무리 — Gallery.css 데드 클래스 정리 + e2e 스모크 + 최종 검증

**Files:**
- Modify: `src/pages/Gallery/Gallery.css` (미사용 행성 블록 삭제)
- Create: `e2e/lab-gallery.spec.js`

**Interfaces:**
- Consumes: 최종 `experiments` 배열 10개 (planet 사용: venus, neptune, mars, sky, earth, jupiter, aurora, moon, solar, space).

- [ ] **Step 1:** Gallery.css에서 위 10개 + 공용(`planet-surface`)을 제외한 행성 블록 삭제 — 대상: `planet-audio, planet-comet, planet-globe, planet-main-canvas, planet-mercury, planet-meteor, planet-ocean, planet-saturn, planet-seoul, planet-tree, planet-uranus, planet-vortex, planet-weather` (+ 삭제 후 `grep -o "planet-[a-z-]*" Gallery.css | sort -u`로 사용 목록과 대조). Gallery.jsx의 `hasRing`(saturn/uranus)과 mercury 크레이터 조건은 이제 도달 불가지만 행성 재사용 가능성을 위해 유지.
- [ ] **Step 2:** `e2e/lab-gallery.spec.js` 작성:

```js
import { test, expect } from '@playwright/test'

const ids = ['particle-morph','ink-flow','neon-raymarch','wind-atlas','seismic-echo','hand-conductor','voice-bloom','poster-lab','solar-system','deep-space']

test('gallery shows 10 curated works', async ({ page }) => {
  await page.goto('/gallery')
  await expect(page.locator('.carousel-card')).toHaveCount(10)
})

for (const id of ids) {
  test(`experiment ${id} renders a canvas without console errors`, async ({ page }) => {
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`/gallery/${id}`)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1500)
    expect(errors).toEqual([])
  })
}
```

  (센서 작품은 시작 오버레이 상태에서도 배경 canvas가 렌더되도록 구현되어 있어야 함 — Task 7·8 구현 시 오버레이 뒤에 파티클/정원 캔버스를 미리 띄운다.)
- [ ] **Step 3:** `npx playwright test e2e/lab-gallery.spec.js` → 전체 PASS (기존 e2e 스위트도 `npm run test:e2e`로 회귀 확인).
- [ ] **Step 4:** `npm run lint && npm run build` 최종 클린 + dev 서버에서 갤러리 한 바퀴(10작품 순회) 육안 확인.
- [ ] **Step 5:** Commit: `feat(lab): finalize gallery v2 lineup with e2e smoke tests`

---

## Self-Review 결과

- 스펙 커버리지: 라인업 10개(Task 1~9), 제거 22개(Task 1), 메타데이터 확정(각 태스크 Interfaces), 공통 품질 규칙(Global Constraints), 검증 5항목(각 태스크 Step + Task 10) — 전부 태스크에 매핑됨.
- 스펙의 "fullscreen: Poster Lab만 false" 반영 확인.
- planet 매핑이 Gallery.css 기존 클래스(venus/neptune/mars/sky/earth/jupiter/aurora/moon)와 일치함을 확인(전부 CSS 정의 존재).
- 타입/이름 일관성: 컴포넌트명·id·라우트가 태스크 간 일치(Task 10의 ids 배열 = Task 2~9 id + 유지 2개).
