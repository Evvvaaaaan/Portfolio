# Lab Gallery v2 — 전면 큐레이션 교체 설계

날짜: 2026-07-17
상태: 사용자 설계 승인 완료 (구현 전)

## 목표

lab 페이지(코버플로우 갤러리)의 실험 작품 24개를 큐레이션 교체해,
**창의성과 다양성이 강조된** 전문적 인터랙티브 갤러리로 재구성한다.
24개 → 10개: 기존 유지 2개 + 신규 8개.

## 설계 원칙 (사용자 요구)

1. **다양성** — 10개 작품이 기술 축(GPGPU / 유체 / 레이마칭 / 3D / 데이터 /
   센서 / 제너러티브 도구)과 입력 축(마우스 드래그 / 클릭 / 손 제스처 /
   음성 / 시간 스크러버 / 파라미터 패널 / 내보내기)에서 서로 겹치지 않는다.
   같은 인상을 주는 작품이 두 개 있으면 하나는 잘못된 것이다.
2. **창의성** — 각 작품은 "예제 재현"이 아니라 고유한 컨셉 한 줄로 설명
   가능해야 한다 (아래 라인업의 컨셉 문장이 그 기준).
3. **완성도** — 모든 작품은 로딩/오류/권한 폴백 상태를 갖추고, 성능 규칙을
   지키며, 갤러리 왕복(진입→인터랙션→이탈)이 매끄럽다.

## 최종 라인업 (10개)

### 유지 (2)

| id | 작품 | 비고 |
|---|---|---|
| `solar-system` | Solar System | 실제 물리 N체 태양계. 변경 없음 |
| `deep-space` | Deep Space | 1인칭 우주 탐험. 변경 없음 |

### 신규 (8)

| # | id | 작품 | 컨셉 한 줄 | 기술 | 고유 입력 |
|---|---|---|---|---|---|
| 1 | `particle-morph` | Particle Morph | 10만 개 파티클이 글자와 형상 사이에서 숨 쉬듯 모핑하는 GPGPU 조각 | three.js FBO ping-pong, curl noise | 마우스 반발 + 클릭 형상 전환 |
| 2 | `ink-flow` | Ink Flow | 손끝에서 발광 잉크가 소용돌이치는 진짜 Navier-Stokes 유체 | WebGL2 stable fluids (이류·Jacobi 압력·curl 보존) | 드래그 splat |
| 3 | `neon-raymarch` | Neon Raymarch | 카메라가 아니라 수식이 그리는 네온 프랙탈 공간 | GLSL SDF 레이마칭 | 드래그 궤도 + 파라미터 패널 |
| 4 | `hand-conductor` | Hand Conductor | 웹캠 속 손이 파티클 오케스트라의 지휘봉이 된다 | MediaPipe HandLandmarker + canvas 파티클 | 핀치=응집, 손바닥=산개, 양손 지휘 |
| 5 | `voice-bloom` | Voice Bloom | 목소리의 주파수가 정원을 피워낸다 — 저음은 줄기, 고음은 꽃 | Web Audio AnalyserNode + 제너러티브 canvas | 마이크 (폴백: 내장 신스 데모) |
| 6 | `wind-atlas` | Wind Atlas | 지금 이 순간 지구의 바람을 수천 개 입자 궤적으로 그린 실시간 지도 | Open-Meteo 격자 샘플링 + 바이리니어 보간 + 입자 이류 | 클릭 지점 풍속 프로브 |
| 7 | `seismic-echo` | Seismic Echo | 지난 30일 지구의 맥박 — 지진이 파문으로 울리는 시간 리플레이 | USGS GeoJSON + canvas 지도 | 타임라인 스크러버 |
| 8 | `poster-lab` | Poster Lab | 시드 하나가 스위스 스타일 포스터 한 장 — 만들고 가져가는 도구 | 시드 PRNG(mulberry32) + canvas 조판 | 시드/팔레트/밀도 컨트롤 + PNG 내보내기 |

메타데이터(planet, planetName, symbol, color, 한국어 설명)는 구현 계획에서
작품별로 확정한다. 신규 8개 중 Poster Lab을 제외한 7개는
`fullscreen: true`, Poster Lab은 도구 패널 레이아웃이므로 `false`.

## 제거 (22)

`index.js`에서 등록 해제하는 작품:
Seoul Nights, Main in Canvas, Drifting Clouds, Keyboard Rain, Pollock One,
Particle Field, Fluid Sim, Typography FX, Shader Playground, Audio Visualizer,
Physics Sandbox, Generative Art, Mouse Trail, Live Weather Mood,
Shooting Stars, Meteor Shower, Aurora Borealis, Vortex, Orbital Earth,
Ocean Waves, Growing Tree, Binary World.

파일 처리:
- **커밋 이력이 있는 디렉토리는 삭제** (git 히스토리로 복구 가능).
- **SeoulNights, MainInCanvas는 untracked이므로 디렉토리는 디스크에 남기고
  등록만 해제** (삭제 시 복구 불가 — 사용자가 별도 지시하면 삭제).
- 미등록 디렉토리(ComingSoon, BlueMonochrome, shared)는 건드리지 않는다.
- KeyboardRain `?raw` import 2줄도 함께 제거.

## 아키텍처

- 작품당 자기완결 디렉토리: `src/experiments/<Name>/<Name>.jsx` + `<Name>.css`.
  기존 패턴 그대로 `index.js`에서 `lazy()` 등록.
- 갤러리(코버플로우) UI·라우팅·ExperimentPage는 변경하지 않는다.
  작품 메타데이터만 교체.
- 신규 의존성: `@mediapipe/tasks-vision` 1개 (Hand Conductor 전용,
  해당 작품 진입 시에만 동적 로드). 나머지는 기존 스택으로 구현.

## 공통 품질 규칙

- **성능**: devicePixelRatio ≤ 2 캡, `document.hidden` 시 rAF 정지,
  언마운트 시 WebGL 컨텍스트/텍스처/지오메트리 dispose,
  `prefers-reduced-motion` 대응(자동 애니메이션 감속 또는 정지).
- **데이터 작품** (Wind Atlas, Seismic Echo): 로딩 스피너 → 성공 / 오류 +
  재시도 버튼. Wind Atlas는 sessionStorage 캐시(1시간)로 재진입 시 재요청 방지.
  API 키 불필요한 공개 엔드포인트만 사용 (Open-Meteo, USGS).
- **센서 작품** (Hand Conductor, Voice Bloom): 3단계 권한 플로우 —
  ① 진입 시 권한이 왜 필요한지 안내 + 시작 버튼, ② 허용 시 센서 모드,
  ③ 거부/미지원 시 폴백 모드(Hand Conductor→마우스, Voice Bloom→내장 신스)
  로 자동 전환하고 폴백임을 표시.
- **WebGL2 미지원** (Ink Flow): 지원 감지 후 미지원 시 안내 문구.

## 검증 기준

1. `npm run lint` / `npm run build` 클린 통과.
2. dev 서버에서 10개 작품 각각: 라우트 진입 → 첫 프레임 렌더 →
   대표 인터랙션 1회 → 갤러리 복귀가 콘솔 오류 없이 동작.
3. 데이터 작품은 네트워크 차단 상태에서 오류 UI가 뜨는지 확인.
4. 센서 작품은 권한 거부 시 폴백 모드가 동작하는지 확인.
5. Playwright 스모크: 갤러리 작품 수 10개 확인 + 각 작품 라우트에서
   canvas 존재 + 콘솔 에러 없음.

## 구현 순서 (계획 수립 시 상세화)

1. 큐레이션 정리 (index.js 재작성 + 디렉토리 삭제) — 갤러리가 2개로 동작
2. GPU 3종 (Particle Morph, Ink Flow, Neon Raymarch)
3. 데이터 2종 (Wind Atlas, Seismic Echo)
4. 센서 2종 (Hand Conductor, Voice Bloom)
5. 도구 1종 (Poster Lab)
6. 메타데이터·설명 다듬기 + e2e 스모크 + 최종 검증
