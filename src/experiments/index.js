import { lazy } from 'react'

const DeepSpace   = lazy(() => import('./DeepSpace/DeepSpace'))
const SolarSystem = lazy(() => import('./SolarSystem/SolarSystem'))

export const experiments = [
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
