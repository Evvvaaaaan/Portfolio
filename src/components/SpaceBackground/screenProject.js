// 월드 좌표 → 화면 픽셀 좌표 (순수 — DOM 미의존, 단위 테스트 대상).
// 위성 위에 HTML 버튼을 얹기 위해 필요하다. 레이캐스팅 대신 이 방향을 쓰는
// 이유: 캔버스는 pointer-events:none을 유지해야 하고(도킹 패널의 링크·폼이
// 죽는다), 진짜 <button>이어야 키보드·스크린리더가 그대로 동작한다.
import * as THREE from 'three'

// 매 프레임 위성 수만큼 호출되므로 벡터를 재사용한다 — 프레임마다 새로
// 할당하면 GC가 렌더 루프 안에서 튄다.
const scratch = new THREE.Vector3()

export function projectToScreen(worldPos, viewProjection, width, height) {
  // 입력 벡터는 씬이 소유한 값이라 절대 건드리지 않는다.
  scratch.copy(worldPos).applyMatrix4(viewProjection)

  // applyMatrix4는 w로 나눈 뒤의 NDC를 주지만, w<0(카메라 뒤)일 때는 부호가
  // 뒤집혀 화면 반대편의 유령 좌표가 된다. 그래서 뒤 판정을 따로 한다.
  const w =
    viewProjection.elements[3] * worldPos.x +
    viewProjection.elements[7] * worldPos.y +
    viewProjection.elements[11] * worldPos.z +
    viewProjection.elements[15]
  const behind = w <= 0

  // NDC(-1~1, 위가 +1) → CSS 픽셀(좌상단 원점, 아래가 +y).
  const x = (scratch.x * 0.5 + 0.5) * width
  const y = (-scratch.y * 0.5 + 0.5) * height

  const inside = x >= 0 && x <= width && y >= 0 && y <= height
  return { x, y, visible: !behind && inside }
}
