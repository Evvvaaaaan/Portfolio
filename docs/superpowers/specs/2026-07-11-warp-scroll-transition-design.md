# Warp Scroll Transition — 섹션 전환 시 별빛 가속 설계

날짜: 2026-07-11
상태: 승인됨 (2026-07-11)

## 목표

메인 페이지에서 섹션이 바뀔 때(스크롤다운으로 다음 섹션을 볼 때), 지금 있는
우주 배경(`SpaceBackground`)의 별들이 순간적으로 빠르게 가속해 "우주 속으로
빨려들어가는" 느낌을 준다. 배경 자체·각 섹션의 평상시 화면·기존 스크롤
로직은 그대로 두고, 전환 순간에만 속도감 있는 연출이 나타났다 사라진다.

## 논의 경과 (범위가 좁혀진 과정)

1. 처음엔 "우주 컨셉이니 섹션마다 행성으로" — 전역 개념.
2. 섹션 이동 자체를 행성 이동처럼 (목업 1).
3. 우주에 위치한 행성들로 빠르게 확대(줌인) (목업 2).
4. 배경·섹션 콘텐츠는 그대로 두고, 전환 순간에만 행성 오버레이 (목업 3).
5. **최종: 행성 자체를 없애고**, 지금 있는 별 배경이 전환 순간에만
   빠르게 가속하는 것으로 확정.

행성·Navbar Warp 메뉴 관련 논의는 전부 폐기되었다. 이 스펙은 (5)만 다룬다.

## 발견 사항 — 기존 코드에 유사 메커니즘이 이미 있음

`src/components/SpaceBackground/SpaceBackground.jsx`의 렌더 루프(제일
아래 `tick()` 함수)는 이미 "카메라가 별 속으로 빨려들어가는" 효과를
구현하고 있다:

```js
camera.position.z = 400 - Math.pow(scrollPercentSmooth, 1.2) * 360
camera.fov = 75 + Math.pow(scrollPercentSmooth, 1.5) * 45
```

코드 주석도 정확히 "camera flies deep into the starfield... accelerates
(sucked-in feeling)", "creates edge-stretching warp speed optical
illusion"이라고 설명한다 — 딱 원하는 그 효과다.

**문제는 입력 변수다.** `scrollPercentSmooth`는 페이지 전체
(`sections.length * 100vh` = 600vh) 기준 스크롤 비율이라, 이 줌/피시아이
효과가 맨 위(Home)에서 맨 아래(Contact)까지 한 번만, 아주 서서히
누적된다. Contact 근처에서는 `camera.z`가 40까지 줄고 `fov`가 120까지
벌어진 채로 고정되어버려, "섹션이 바뀔 때마다 반복되는 가속"이 아니라
"스크롤할수록 점점 더 일그러지다가 끝에서 멈추는" 현상이 된다.

**해결**: 입력 변수를 페이지 전체 비율 대신 **섹션 전환 구간 진행도**로
바꾼다. 데스크톱 슬라이드덱은 섹션마다 정확히 100vh이므로:

```js
const progress = window.scrollY / window.innerHeight   // 절대 섹션 인덱스(소수)
const frac = progress - Math.floor(progress)            // 0(섹션에 정지)~1(다음 섹션 도착)
const intensity = 4 * frac * (1 - frac)                  // 0 → 1(중간점) → 0 의 포물선
```

`frac = 0`(어느 섹션에 정확히 멈춰 있음)일 때 `intensity = 0`(평상시,
`camera.z=400`/`fov=75`), `frac = 0.5`(두 섹션 사이 중간)에서
`intensity = 1`(최고 속도), 도착하면 다시 0으로 — 정확히 원하는
"잔잔함 → 가속 → 최고 속도 → 잔잔함"을 매 전환마다 반복한다. 기존
`Math.pow(x, 1.2)`/`Math.pow(x, 1.5)` 곡선은 그대로 두고, 대입되는 `x`만
`scrollPercentSmooth`(페이지 전체) 대신 이 `intensity`(전환 구간)로
교체한다.

회전(vortex spin, y/x 드리프트)은 이 문제와 무관한 잔잔한 배경
연출이라 그대로 `scrollPercentSmooth` 기반 유지 — 건드리지 않는다.

## 확정 사항

| 항목 | 결정 |
|---|---|
| 대상 파일 | `SpaceBackground.jsx` 단일 파일 수정. 새 컴포넌트/레이어 없음 |
| 행성 | 없음. 목적지를 상징하는 오브젝트 불필요 |
| 배경 리소스 | 지금 있는 별 파티클 그대로. 새 텍스처·지오메트리 추가 없음 |
| 섹션 콘텐츠 | About/Skills/Projects/Contact 등 손대지 않음 |
| 적용 범위 | **데스크톱(슬라이드덱)에서만.** 모바일은 섹션이 100vh 고정이 아니라 이 `frac` 계산이 성립하지 않으므로, 모바일은 기존 동작(페이지 전체 기준 `scrollPercentSmooth`)을 그대로 유지 |
| 판별 방법 | `SpaceBackground` 내부에서 `window.matchMedia('(min-width: 769px) and (min-height: 701px)')`로 자체 판별 (App.jsx의 `useMediaQuery`와 동일한 조건, 컴포넌트 간 상태 공유 없이 독립 계산) |
| Reduced motion | `prefers-reduced-motion: reduce`에서는 `intensity`를 항상 0으로 고정 — 카메라 줌/피시아이 없이 기존처럼 즉시 전환 |
| 스무딩 | 기존 `scrollPercentSmooth`와 같은 lerp 패턴(`+= (target - current) * k`)을 `intensity`에도 적용해 떨림 방지. 반응성을 위해 기존 `k=0.05`보다 빠른 `k=0.14` 사용 |

## 아키텍처

- `frac`/`intensity` 계산과 lerp를 `computeTransitionIntensity(scrollY, viewportHeight)` 같은 순수 함수로 분리해 `SpaceBackground.jsx` 상단(또는 같은 폴더의 `transitionIntensity.js`)에 둔다 — 3D 렌더 루프와 분리해서 유닛 테스트 가능하게.
- `tick()` 루프 안에서 `camera.position.z`/`camera.fov` 계산 시 `scrollPercentSmooth` 대신 이 함수가 반환한(스무딩된) `intensity`를 대입.
- 데스크톱 여부·reduced-motion 여부는 이펙트 진입 시 한 번 판정해 두고(리사이즈 시 재판정), 데스크톱이 아니거나 reduced-motion이면 `intensity`를 강제로 0 또는 기존 `scrollPercentSmooth` 기반 값으로 대체.

## 테스트

- Vitest: `computeTransitionIntensity`류 순수 함수 단위 테스트 — `frac=0/0.5/1`에서의 값, 스무딩 lerp 동작.
- 수동 확인(브라우저): 데스크톱에서 섹션 넘길 때마다 가속이 반복되는지, 섹션에 멈춰 있을 때 평상시 상태(`z=400`, `fov=75`)로 돌아오는지, 모바일에서 회귀 없는지, reduced-motion 켰을 때 즉시 컷되는지.
- Three.js 카메라 내부 상태라 Playwright로 시각적 단언은 어려움 — 수동 확인으로 대체.

## 범위 외 (폐기됨)

- 행성 배경/색상 매핑, 워프 필름스트립 오버레이, Navbar Warp 미니맵 — 전부 이전 라운드에서 폐기.
- 모바일에서의 동일 효과 — 요청 시 별도 스펙.
