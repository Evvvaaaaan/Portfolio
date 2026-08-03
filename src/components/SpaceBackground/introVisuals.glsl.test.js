import { describe, it, expect } from 'vitest'
import {
  GRID_VERT, GRID_FRAG, GRID_UNIFORM_NAMES,
  ORBIT_VERT, ORBIT_FRAG, ORBIT_UNIFORM_NAMES,
} from './introVisuals.glsl.js'

describe('그리드 셰이더', () => {
  it('유니폼 목록이 계약대로다', () => {
    expect(GRID_UNIFORM_NAMES).toEqual(['uOpacity', 'uAspect', 'uLineColor'])
  })

  it('모든 유니폼을 선언하고 실제로 쓴다', () => {
    for (const u of GRID_UNIFORM_NAMES) {
      expect(GRID_FRAG).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`))
      const uses = GRID_FRAG.match(new RegExp(`\\b${u}\\b`, 'g')) || []
      expect(uses.length).toBeGreaterThan(1)
    }
  })

  it('클립 공간에 바로 그린다 (카메라 행렬을 타지 않아야 풀스크린이 유지된다)', () => {
    expect(GRID_VERT).toMatch(/gl_Position\s*=\s*vec4\(\s*position\.xy/)
    expect(GRID_VERT).not.toMatch(/projectionMatrix/)
  })
})

describe('궤도 리빌 셰이더', () => {
  it('유니폼 목록이 계약대로다', () => {
    expect(ORBIT_UNIFORM_NAMES).toEqual(['uDraw', 'uLineColor', 'uBaseOpacity'])
  })

  it('모든 유니폼을 선언하고 실제로 쓴다', () => {
    for (const u of ORBIT_UNIFORM_NAMES) {
      expect(ORBIT_FRAG).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`))
      const uses = ORBIT_FRAG.match(new RegExp(`\\b${u}\\b`, 'g')) || []
      expect(uses.length).toBeGreaterThan(1)
    }
  })

  it('aArc 속성을 받아 프래그먼트로 넘긴다', () => {
    expect(ORBIT_VERT).toMatch(/attribute\s+float\s+aArc\s*;/)
    expect(ORBIT_VERT).toMatch(/varying\s+float\s+vArc\s*;/)
    expect(ORBIT_FRAG).toMatch(/varying\s+float\s+vArc\s*;/)
  })

  it('궤도는 카메라 변환을 탄다 (3D 공간의 선이므로)', () => {
    expect(ORBIT_VERT).toMatch(/projectionMatrix/)
  })

  it('드로잉 완료 시 펜 끝 발광이 꺼진다 (링 이음새 잔상 방지)', () => {
    // uDraw=1에서도 hot이 살아 있으면 vArc≈1 지점에 밝은 점이 영구히 남아
    // Phase 1의 균일한 궤도 밝기가 깨진다.
    expect(ORBIT_FRAG).toMatch(/smoothstep\(\s*0\.94\s*,\s*1\.0\s*,\s*uDraw\s*\)/)
  })
})
