import { lazy } from 'react'

const ParticleMorph = lazy(() => import('./ParticleMorph/ParticleMorph'))
const InkFlow = lazy(() => import('./InkFlow/InkFlow'))
const NeonRaymarch = lazy(() => import('./NeonRaymarch/NeonRaymarch'))
const WindAtlas = lazy(() => import('./WindAtlas/WindAtlas'))
const SeismicEcho = lazy(() => import('./SeismicEcho/SeismicEcho'))
const DeepSpace   = lazy(() => import('./DeepSpace/DeepSpace'))
const SolarSystem = lazy(() => import('./SolarSystem/SolarSystem'))

export const experiments = [
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
  {
    id: 'solar-system',
    title: 'Solar System',
    description: '실제 질량·이심률·만유인력으로 작동하는 N체 태양계 시뮬레이터. 행성을 클릭하면 실시간 속도와 특징이 보이고, 태양의 인력·밝기·시간 배속을 조절하며 궤도의 변화를 관찰할 수 있습니다.',
    tags: ['three.js', 'physics', 'simulation'],
    color: '#fbbf24',
    planet: 'solar',
    planetName: 'SOL',
    symbol: '☉',
    fullscreen: true,
    component: SolarSystem,
  },
  {
    id: 'deep-space',
    title: 'Deep Space',
    description: '광활한 우주 한가운데에 서서 시점을 돌리며 둘러보는 3D 체험. 거리에 따라 층층이 배치된 7천여 개의 별과 성운, 은하수 띠가 시차로 깊이감을 만듭니다. 휠로 더 깊이 들어갈 수 있습니다.',
    tags: ['three.js', '3D', 'space'],
    color: '#9db4ff',
    planet: 'space',
    planetName: 'VOID',
    symbol: '✧',
    fullscreen: true,
    component: DeepSpace,
  },
]
