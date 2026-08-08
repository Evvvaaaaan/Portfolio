// 프로젝트 위성 (순수 — three·DOM 미의존, 단위 테스트 대상).
// 위성은 장식이 아니라 실제 프로젝트다: 색뿐 아니라 slug·제목을 함께 들고
// 있어야 화면 오버레이가 이름을 띄우고 상세 페이지로 보낼 수 있다.
import { projects } from '../../data/projects.js'
import { PLANETS } from './system.js'

// 위성은 projects 행성 주위에 도는 세 개다. projects 데이터가 늘어도 씬이
// 붐비지 않도록 앞의 세 개만 태운다 (Phase 1부터의 동작).
export const SATELLITE_COUNT = 3

const PROJECTS_PLANET = PLANETS.find((p) => p.id === 'projects')
// 행성 반지름의 1.9배 — PLANETS에서 파생시켜 행성 크기를 바꿔도 desync되지 않는다.
const ORBIT_RADIUS = PROJECTS_PLANET.radius * 1.9

export const SATELLITES = projects.slice(0, SATELLITE_COUNT).map((p, i) => {
  const a = (i / SATELLITE_COUNT) * Math.PI * 2
  return {
    slug: p.slug,
    title: p.title,
    accent: p.accent,
    // projects 행성 로컬 좌표 — 위성은 행성의 자식 피벗에 붙는다.
    // y는 sin(2a)로 흔들어 세 개가 한 평면에 늘어서지 않게 한다.
    position: [Math.cos(a) * ORBIT_RADIUS, Math.sin(a * 2) * 4, Math.sin(a) * ORBIT_RADIUS],
  }
})
