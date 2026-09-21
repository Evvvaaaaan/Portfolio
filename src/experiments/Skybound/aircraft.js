export const AIRCRAFT = [
  { id: 'trainer', name: 'Cessna 172', subtitle: 'COASTAL EXPLORER', description: '안정적인 첫 비행을 위한 기본 경비행기', price: 0, color: '#d87742', cruise: 62, minSpeed: 30, maxSpeed: 98, turn: .40, climb: .50, response: 3.3, wingspan: 7.2, handling: '균형 잡힌 조종' },
  { id: 'bush', name: 'Jungle Hopper', subtitle: 'BACKCOUNTRY SCOUT', description: '짧고 민첩한 선회, 정글과 계곡에 어울리는 탐험기', price: 300, color: '#648853', cruise: 57, minSpeed: 26, maxSpeed: 88, turn: .55, climb: .62, response: 4.0, wingspan: 7.2, handling: '선회 · 상승 특화' },
  { id: 'sailplane', name: 'Alpine Glider', subtitle: 'RIDGELINE CRUISER', description: '긴 날개와 부드러운 조종으로 능선을 누비는 모터 글라이더', price: 600, color: '#639bb5', cruise: 70, minSpeed: 32, maxSpeed: 112, turn: .32, climb: .55, response: 2.5, wingspan: 11.9, handling: '부드러운 장거리 비행' },
  { id: 'jet', name: 'Horizon Jet', subtitle: 'CONTINENT RUNNER', description: '대륙을 빠르게 가로지르는 쌍발 제트기', price: 1200, color: '#a36a4d', cruise: 105, minSpeed: 48, maxSpeed: 165, turn: .43, climb: .60, response: 3.5, wingspan: 8.3, handling: '최고 속도 특화' },
]

export const getAircraft = (id) => AIRCRAFT.find((aircraft) => aircraft.id === id) || AIRCRAFT[0]
