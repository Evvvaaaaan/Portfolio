// 명령형 렌더 루프 → React 오버레이를 잇는 최소 스토어 (순수).
// three 씬은 React 바깥에서 돌기 때문에, 위성의 화면 좌표를 컴포넌트가
// 읽으려면 이런 중계가 필요하다. useLenis의 getLenis()와 같은 결의 패턴이다.
let current = []
const listeners = new Set()

export function publishSatellites(list) {
  current = list
  for (const fn of listeners) {
    // 구독자 하나가 던져도 렌더 루프는 계속 돌아야 한다 — 여기서 예외가
    // 새어 나가면 tick()이 끊겨 씬 전체가 정지한다.
    try {
      fn(list)
    } catch (err) {
      console.error('[satelliteOverlay] 구독자에서 예외:', err)
    }
  }
}

export function subscribeSatellites(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSatellites() {
  return current
}
