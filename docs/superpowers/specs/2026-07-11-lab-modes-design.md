# Lab Modes — 사이트 전역 테마 모드 설계

날짜: 2026-07-11
상태: 승인됨 (2026-07-11)

## 핵심 제약 (사용자 요구)

**테마 모드가 포트폴리오의 본래 메시지 전달을 방해해서는 안 된다.**

- 모드는 100% 옵트인. 자동 활성화·유도 팝업·첫 방문 강제 진입 금지.
- 기본 상태(normal)의 메인 페이지는 렌더 트리·성능·접근성 모두
  모드 도입 전과 동일해야 한다 (모드 코드는 전부 lazy, normal에서
  로드되지 않음).
- ModeSelector 진입점은 눈에 띄되 콘텐츠와 경쟁하지 않는 크기/위치
  (Navbar 항목 1개). 히어로·프로젝트 등 핵심 콘텐츠를 가리는 배너나
  플로팅 요소 금지.
- 모드 활성 중에도 콘텐츠가 본체다: Terminal·Inspect는 실제 포트폴리오
  내용을 보여주는 또 다른 뷰이고, Destruction·Speedrun도 종료 즉시
  원래 페이지로 완전 복귀한다.

## 목표

포트폴리오 메인 페이지 위에 "테마 모드"를 덧입힐 수 있는 시스템을 만든다.
방문자가 모드를 선택하면 실제 포트폴리오 콘텐츠가 그 테마의 인터랙티브
경험으로 변형된다. B 카테고리(메타/포트폴리오 자체를 소재로) 아이디어의
기능화이다.

## 확정/가정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 이용 방식 | 사이트 전역 테마 모드 | 사용자 선택 (확정) |
| 1차 범위 | 테마형 4개: Destruction, Terminal, Inspect, Speedrun | **가정** — 사용자 무응답으로 추천안 채택. 변경 가능 |
| 적용 범위 | 메인 페이지(`/`)만. 갤러리·프로젝트 페이지는 v1 제외 | 단순화. 모드별 상호작용이 메인 섹션 기준으로 설계됨 |
| 지속성 | 모드는 세션 내에서만 유지 (새로고침 시 normal) | 방문자가 모드에 갇히는 상황 방지 |

## 4개 모드 정의

### 1. Destruction (물리 붕괴)
- 진입 시 메인 페이지의 가시 요소(섹션 제목, 카드, 텍스트 블록)를
  스냅샷 떠서 Matter.js 바디로 변환, 중력으로 무너뜨림.
- 마우스/터치로 잔해를 집어 던질 수 있음.
- "RESTORE" 버튼 = 모드 종료 + 페이지 원상복구 (React 리렌더).
- `matter-js`는 이미 의존성에 있음 (PhysicsSandbox에서 사용 중).
- `prefers-reduced-motion` 사용자는 진입 시 경고 후 애니메이션 최소화.

### 2. Terminal (터미널 포트폴리오)
- 전체 화면 터미널 오버레이. 사이트 콘텐츠를 CLI로 탐색.
- 명령어: `help`, `ls`, `cat about.md`, `open <project>`, `skills`,
  `contact`, `exit` + 이스터에그 (`sudo hire-me` 등).
- 콘텐츠는 기존 데이터 소스(프로젝트 목록, About 텍스트, LangContext의
  다국어 문자열)를 재사용 — 콘텐츠 중복 정의 금지.
- `open <project>`는 실제 라우팅(`/projects/:slug`)으로 연결.

### 3. Inspect (해부 투어)
- 가짜 DevTools 패널이 우측에 도킹 (모바일에서는 하단). 페이지 요소에 호버하면
  실제 DevTools처럼 하이라이트 + 박스모델 표시.
- 단, CSS 덤프 대신 큐레이션된 주석("이 섹션은 왜 이렇게 만들었나",
  기술 노트)을 보여줌. 요소별 주석은 정적 데이터 파일로 관리.
- "다음" 버튼으로 순서대로 도는 가이드 투어 스텝 포함.

### 4. Speedrun (스피드런)
- 상단에 타이머 + 스플릿 오버레이 (LiveSplit 스타일).
- 미션: 5개 섹션 방문, 프로젝트 1개 열기, 이력서 모달 열기 등
  체크리스트를 최단 시간에 완수.
- 섹션 방문 감지는 IntersectionObserver, 액션 감지는 모드 컨텍스트에
  이벤트 발행(pub/sub 아님 — 단순 콜백 등록)으로.
- 최고 기록은 `localStorage`에 저장.

## 검토한 접근 방식

1. **오버레이 + 레지스트리 아키텍처 (채택)** — 모드를 lazy 오버레이
   컴포넌트로 만들고, 기존 experiments 레지스트리와 같은 패턴의
   `modes/registry.js`에 메타데이터로 등록. 메인 페이지 코드는 거의
   건드리지 않음. 장점: 격리·확장 용이(2차 테마 추가 = 레지스트리에
   1개 추가), 기존 코드베이스 패턴과 일치. 단점: Destruction처럼 DOM을
   읽어야 하는 모드는 오버레이에서 DOM 스냅샷 기법 필요.
2. **라우트 기반 (`/mode/terminal`)** — 구현은 단순하지만 "내 사이트가
   변형된다"는 메타적 재미가 죽고, 뒤로가기 UX가 꼬임. 기각.
3. **각 섹션 컴포넌트에 모드 분기 주입** — 통합도는 최고지만 5개 섹션
   전부 수정해야 하고 회귀 위험이 큼. 기각.

## 아키텍처

```
src/modes/
  ModeContext.jsx      # ModeProvider + useMode() — 현재 모드, setMode,
                       #   speedrun용 액션 이벤트 콜백 등록 API
  registry.js          # [{ id, title, description, color, icon,
                       #    component: lazy(...) }]
  ModeSelector/        # 선택 UI. Navbar에 "MODE" 항목 → 4개 테마 카드
                       #   + Normal 패널. 모드 활성 중엔 플로팅 뱃지로 표시
  Destruction/
  Terminal/
  Inspect/
  Speedrun/
```

- `App.jsx`의 `MainPage`를 `ModeProvider`로 감싸고, 활성 모드의
  컴포넌트를 Suspense + ErrorBoundary 안에서 오버레이로 렌더.
- 각 모드 컴포넌트의 인터페이스: props 없음, `useMode()`로 컨텍스트
  접근, 언마운트 시 자기 부작용(body class, 이벤트 리스너, Matter
  엔진)을 완전히 정리할 것.
- 공통 규칙: **ESC 키 또는 항상 보이는 종료 버튼으로 언제든 normal
  복귀.** 모드 크래시 시 ErrorBoundary가 normal로 강제 복귀.

## 데이터 흐름

- 모드 상태: `ModeContext` 단일 소스. URL에 반영하지 않음 (v1).
- Terminal/Inspect의 콘텐츠: 기존 섹션이 쓰는 데이터·번역 소스를 import.
  Inspect의 요소 주석만 신규 정적 파일(`Inspect/annotations.js`).
- Speedrun 기록: `localStorage` 키 `labmode.speedrun.best`.

## 에러 처리

- 모드 lazy 로드 실패/렌더 크래시 → ErrorBoundary가 모드 해제 후
  ModeSelector 뱃지에 짧은 오류 문구 표시 (별도 토스트 시스템 없음).
- Destruction: DOM 스냅샷 대상이 0개면 진입 취소 (빈 화면 방지).
- 모바일/저성능: Destruction 바디 수 상한 80개 (초과분은 큰 요소 우선).

## 테스트

- Playwright (이미 설정됨):
  - 셀렉터 열기 → 각 모드 진입 → ESC로 복귀 (4개 모드 스모크).
  - Terminal: `help` 입력 시 명령 목록 출력, `exit`로 복귀.
  - Speedrun: 타이머 시작 확인, 섹션 방문 시 스플릿 체크 표시.
- 기존 메인 페이지 회귀: 모드 미사용 시 렌더 트리 변화 없음 확인.

## 2차 (범위 외, 기록만)

- Git Log Playable / 404 Playground / AI Guestbook Golem — 독립
  페이지·라우트 성격이라 테마 모드가 아닌 별도 형태로 후속 설계.
- 갤러리·프로젝트 페이지까지 모드 확장.
- 모드 상태 URL 공유 (`?mode=terminal`).
