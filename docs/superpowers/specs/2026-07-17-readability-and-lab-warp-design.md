# Readability & Lab Warp Entry — 가독성 개선 + Lab 워프 진입 설계

날짜: 2026-07-17
상태: 승인됨 (2026-07-17)

## 목표

1. **가독성**: 섹션 본문(About/Skills/Projects/Contact)이 배경 우주 연출(섹션
   틴트 + 별/블룸)에 가려 잘 읽히지 않는 문제를 색상 조정으로 해결한다.
2. **Lab 진입**: 현재 "검은 원 확장(블랙홀)" 방식의 Lab 전환을 "우주 속으로
   완전히 빨려들어가는" 워프 연출로 교체한다.

두 작업 모두 사용자 확인 완료: 가독성은 "틴트 어둡게 + 스크림" 방향, Lab
전환은 "워프 하이재킹" 방향. 병행 세션(lab gallery v2)은 종료되어 이
세션에서 작업한다.

## Part 1 — 섹션 본문 가독성

### 1-1. SECTION_TINTS 감광

`src/components/SpaceBackground/sectionTint.js`의 `SECTION_TINTS` 값을
색조 방향은 유지하되 밝기·채도를 낮춘 값으로 교체한다 (기존 대비 약
45~55% 수준). Phase 1의 sRGB OutputPass 수정 이후 배경 체감 밝기가
올라간 것을 보정하는 의미도 있다. 구체 값은 구현 계획에서 확정하되,
기존 테스트(경계값·중간값·클램프)는 팔레트 상수를 참조하므로 값 교체로
깨지지 않는다.

### 1-2. 콘텐츠 스크림

About/Skills/Projects/Contact 섹션의 콘텐츠 뒤에 은은한 방사형
어둠(스크림)을 공통 CSS로 적용한다:

- 형태: `radial-gradient(ellipse, rgba(어두운 우주색, ~0.55) 중심 →
  투명 가장자리)`, 콘텐츠보다 약간 넓게.
- 위치: `src/index.css`에 섹션 공통 규칙 1곳 (섹션별 CSS 파일에 중복
  작성하지 않는다). 각 섹션 루트 요소의 `::before` 등 pseudo-element로,
  콘텐츠 z-index 아래.
- 블러 없는 순수 그라데이션 — 성능 비용 무시 가능. Hero는 대상이 아님
  (문제 지점이 섹션 본문으로 확인됨).

## Part 2 — Lab 진입 워프 하이재킹

현재 `src/components/LabTransition/`(미커밋)은 클릭 지점에서 검은 원이
확장 → 도착 문구 → 열림 구조이며, Navbar가 origin 좌표와 함께 마운트하고
타이머로 네비게이션 시점을 제어한다. **타이밍 오케스트레이션 구조는
유지**하고 비주얼과 배경 연동을 교체한다.

### 2-1. 부스트 타임라인 순수 모듈 (`warpBoost.js`)

`src/components/SpaceBackground/warpBoost.js` — 기존
`arrivalSequence.js` 패턴:

- 타임라인: 0 → **피크 1.4** ease-in(~800ms) → 피크 유지(~200ms) →
  ease-out 해제(~700ms) → 0. 스크롤 워프 최대치(1.0)를 넘는 세기로
  카메라가 별필드를 관통(z가 별 분포 너머로)하고 FOV가 극단으로 벌어져
  "완전히 빨려들어가는" 정점을 만든다.
- 안전 클램프: FOV 상한(≤150°) — 세기 1.4에서 기존 공식이 만드는 FOV
  왜곡이 깨져 보이지 않도록 SpaceBackground 쪽에서 클램프.
- API: `computeBoostIntensity(elapsedMs) => { intensity, phase }`
  (phase: 'charging' | 'peak' | 'release' | 'done') 순수 함수 + window
  이벤트 계약(시작 요청 이벤트). vitest 대상.

### 2-2. SpaceBackground 연동

- 부스트 시작 이벤트를 수신하면 도착 시퀀스와 같은 방식으로
  `intensitySmooth`를 타임라인 값으로 직접 구동 (스트릭·포스트프로세싱·
  카메라 줌이 자동으로 따라옴).
- **부스트는 warpEnabled와 무관하게 진행** — 라우트가 /gallery로 바뀌어도
  (warpEnabled false) 해제 곡선이 끝까지 재생되어 갤러리 도착 후 자연
  감속한다. SpaceBackground가 라우트 전환에도 언마운트되지 않는 구조를
  활용. 우선순위: 부스트 > 도착 시퀀스 > 스크롤 워프.
- 도착 시퀀스(첫 로딩)와 부스트가 겹치는 경우: 부스트가 시작되면 진행
  중인 도착 시퀀스는 즉시 종결('done') 처리.

### 2-3. LabTransition 비주얼 교체

- 검은 원(블랙홀)·회전 링 제거. 대신:
  1. 마운트 시 부스트 시작 이벤트 발행 + 페이지 콘텐츠 확대·페이드
     (오버레이가 아닌 기존 콘텐츠에 CSS 클래스 — 카메라를 지나쳐 사라지는
     느낌, 가속 곡선 동기).
  2. 피크 도달 타이밍에 짧은 화이트 플래시(오버레이) → 그 순간
     `onNavigate()` 호출 (기존 타이머 구조 재사용, 시간 상수만 부스트
     타임라인과 일치시킴).
  3. 워프 해제와 함께 갤러리가 드러나고 "Lab에 도착하였습니다" 문구는
     유지 (타이밍은 해제 구간에 맞춰 조정).
- origin 좌표 prop: 워프는 화면 중심 기준이므로 시각적으로는 사용하지
  않게 되지만 prop 계약은 유지 (Navbar 수정 최소화).
- **reduced-motion**: 부스트 생략, 빠른 페이드 전환 (기존 LabTransition의
  reduced-motion 패턴 유지). 문구는 유지.
- **모바일**: 부스트는 모바일에서도 재생 (스트릭+카메라 줌; 포스트프로세싱은
  기존 게이트대로 데스크톱 전용). 모바일 회귀 없음.

## 작업 기반 / 순서

- 브랜치: `feat/hero-arrival` 위에서 진행.
- **선행 조건**: Navbar.jsx·LabTransition/ 등 현재 미커밋 변경(사용자
  WIP)을 먼저 커밋해 보존한 뒤 그 위에 쌓는다 — 실행 시작 시 확인.
- Part 1 → Part 2 순. 각각 독립 배포 가능.

## 테스트

- Vitest: `computeBoostIntensity` 타임라인(가속/피크/해제/done 경계),
  기존 sectionTint 테스트 회귀.
- Playwright: Lab 클릭 → 갤러리 도착 + 콘솔 에러 0 e2e 1개. 기존
  arrival/warp-visuals/modes e2e 회귀 없음.
- 수동: 섹션 본문 대비 개선 확인, 부스트 연출 시각 품질, reduced-motion
  /모바일 경로.

## 범위 외

- Hero 가독성 (문제 지점 아님).
- 갤러리 내부 리디자인 (lab gallery v2는 별도 트랙).
- 블룸 강도 조정 (스크림+틴트로 해결이 안 될 때만 후속 논의).
