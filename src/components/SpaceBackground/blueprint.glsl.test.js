import { describe, it, expect } from 'vitest'
import { BLUEPRINT_VERT, BLUEPRINT_FRAG, BLUEPRINT_UNIFORM_NAMES } from './blueprint.glsl.js'

describe('blueprint 셰이더', () => {
  it('유니폼 목록이 계약대로다', () => {
    expect(BLUEPRINT_UNIFORM_NAMES).toEqual(['uBuild', 'uLineColor', 'uExtent'])
  })

  it('프래그먼트가 모든 유니폼을 실제로 선언한다', () => {
    // 이름이 본문에 등장하는 것만으로는 부족하다 — 선언문이 있어야
    // ShaderMaterial이 값을 밀어 넣을 수 있다.
    for (const u of BLUEPRINT_UNIFORM_NAMES) {
      expect(BLUEPRINT_FRAG).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`))
    }
  })

  it('선언만 하고 쓰지 않는 유니폼이 없다', () => {
    for (const u of BLUEPRINT_UNIFORM_NAMES) {
      const uses = BLUEPRINT_FRAG.match(new RegExp(`\\b${u}\\b`, 'g')) || []
      expect(uses.length).toBeGreaterThan(1)
    }
  })

  it('버텍스가 aBary 속성을 받아 프래그먼트로 넘긴다', () => {
    expect(BLUEPRINT_VERT).toMatch(/attribute\s+vec3\s+aBary\s*;/)
    expect(BLUEPRINT_VERT).toMatch(/varying\s+vec3\s+vBary\s*;/)
    expect(BLUEPRINT_VERT).toMatch(/vBary\s*=\s*aBary\s*;/)
    expect(BLUEPRINT_FRAG).toMatch(/varying\s+vec3\s+vBary\s*;/)
  })

  it('스윕용 로컬 좌표를 넘긴다', () => {
    expect(BLUEPRINT_VERT).toMatch(/varying\s+vec3\s+vLocal\s*;/)
    expect(BLUEPRINT_FRAG).toMatch(/varying\s+vec3\s+vLocal\s*;/)
  })

  it('화면 공간 보정(fwidth)으로 선 굵기를 일정하게 유지한다', () => {
    // fwidth 없이 바리센트릭 임계값만 쓰면 멀리 있는 오브젝트의 선이 사라진다.
    expect(BLUEPRINT_FRAG).toMatch(/fwidth\s*\(/)
  })

  it('gl_FragColor를 쓴다 (three 0.184 프래그먼트 출력 규약)', () => {
    expect(BLUEPRINT_FRAG).toMatch(/gl_FragColor\s*=/)
  })

  it('스윕 프런트를 정의역 밖까지 리맵한다 (양 끝 팝 방지)', () => {
    // front가 0~1만 훑으면 uBuild=0에서 하단, 프런트 포화 구간에서 상단이
    // 어중간하게 남아 인트로 시작·중간에 팝이 보인다.
    expect(BLUEPRINT_FRAG).toMatch(/mix\(\s*-0\.12\s*,\s*1\.12\s*,/)
  })

  it('역방향 smoothstep을 쓰지 않는다 (GLSL ES 미정의 동작)', () => {
    // smoothstep(edge0, edge1, x)는 edge0 >= edge1이면 결과가 미정의다.
    expect(BLUEPRINT_FRAG).not.toMatch(/smoothstep\(\s*0\.12\s*,\s*0\.0\s*,/)
  })
})
