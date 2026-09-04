// 탐사선 부품 메타.
//
// `explode`는 분해 페이즈에서 부품이 도달하는 월드 좌표 오프셋이다(진행값 1.0
// 기준). 부품 그룹의 이름(id)은 buildProbe가 만드는 THREE.Group의 name과 같고,
// 나중에 실제 GLB로 교체할 때도 이 id만 맞춰주면 스크롤/라벨 코드는 그대로
// 동작한다.
export const PARTS = [
  {
    id: 'dish',
    label: 'HIGH-GAIN ANTENNA',
    spec: '3.66 m 파라볼릭 디시',
    maps: '프론트엔드 — React, 인터페이스 설계',
    explode: [0, 2.4, 0],
  },
  {
    id: 'sci',
    label: 'IMAGING PLATFORM',
    spec: '광각·협각 카메라 2기',
    maps: 'Spotline — Vision AI, YOLO',
    explode: [1.5, -1.8, 0.7],
  },
  {
    id: 'mag',
    label: 'MAGNETOMETER BOOM',
    spec: '13 m 신축 붐',
    maps: 'FindX — 위치 기반 센싱과 매칭',
    explode: [2.8, 0.5, 0],
  },
  {
    id: 'rtg',
    label: 'RTG × 3',
    spec: '470 W 방사성동위원소 발전기',
    maps: '백엔드 — Spring Boot, FastAPI, AWS',
    explode: [-3.2, -0.7, 0],
  },
  {
    id: 'rec',
    label: 'GOLDEN RECORD',
    spec: '12″ 금도금 구리 원반',
    maps: '이 포트폴리오 자체 — 남기는 기록',
    explode: [-1.6, -1.7, 1.2],
  },
  {
    id: 'bus',
    label: 'BUS',
    spec: '10면체 계측·자세제어 코어',
    maps: 'Lyralab — 프로젝트 스튜디오 코어',
    explode: [0, 0, 0],
  },
]

// 페이즈 04(Instrument)에서 홀로 남는 부품.
export const FOCUS_PART = 'dish'
