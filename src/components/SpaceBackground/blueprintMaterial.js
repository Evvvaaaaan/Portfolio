import * as THREE from 'three'
import { BLUEPRINT_VERT, BLUEPRINT_FRAG } from './blueprint.glsl.js'

export function createBlueprintMaterial({ color, extent }) {
  const material = new THREE.ShaderMaterial({
    vertexShader: BLUEPRINT_VERT,
    fragmentShader: BLUEPRINT_FRAG,
    uniforms: {
      uBuild: { value: 0 },
      uLineColor: { value: new THREE.Color(color) },
      uExtent: { value: extent },
    },
    // 가산 합성 + depthWrite:false — 청사진 선은 발광체처럼 겹쳐 보여야 하고,
    // 깊이를 쓰면 뒤따라 그려지는 실체 메시가 선에 가려 뚫려 보인다.
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })

  return {
    material,
    setBuild(v) {
      const b = Math.min(Math.max(v, 0), 1)
      material.uniforms.uBuild.value = b
      // build=1에서는 청사진 메시를 렌더 목록에서 통째로 뺀다. 알파가 0이어도
      // 투명 큐에 남아 있으면 정렬 비용과 미세한 합성 오차가 생기고, 무엇보다
      // "인트로가 끝나면 오늘과 픽셀 동일" 계약을 보장할 수 없다.
      material.visible = b < 1
    },
  }
}
