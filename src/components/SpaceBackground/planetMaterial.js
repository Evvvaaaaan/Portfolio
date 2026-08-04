import * as THREE from 'three'
import { PLANET_VERT, PLANET_FRAG } from './planetSurface.glsl.js'

export function createPlanetMaterial({ color, rimColor, seed }) {
  const material = new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
    uniforms: {
      uBaseColor: { value: new THREE.Color(color) },
      // 항성은 항성계 원점에 고정이라 상수지만, 유니폼으로 두면 Phase 5의
      // 시간대 라이팅에서 광원을 옮길 때 이 파일만 고치면 된다.
      uSunPos: { value: new THREE.Vector3(0, 0, 0) },
      uTime: { value: 0 },
      uSeed: { value: seed },
      uOpacity: { value: 1 },
      uRimColor: { value: new THREE.Color(rimColor) },
    },
  })

  return {
    material,
    setOpacity(v) {
      const o = Math.min(Math.max(v, 0), 1)
      material.uniforms.uOpacity.value = o
      // 렌더링에는 uOpacity 유니폼만 쓰이지만, 표준 Material.opacity도 같이
      // 맞춰둔다 — Phase 2의 setBuild 테스트가 이 값을 직접 읽어 페이드
      // 진행도를 검증한다.
      material.opacity = o
      // 완전 불투명해지면 불투명 큐로 되돌린다 — 투명 큐에 남으면 정렬 비용과
      // 미세한 합성 차이가 생긴다 (Phase 2가 세운 계약).
      const wantTransparent = o < 1
      if (material.transparent !== wantTransparent) {
        material.transparent = wantTransparent
        material.needsUpdate = true
      }
    },
    setTime(t) {
      material.uniforms.uTime.value = t
    },
  }
}
