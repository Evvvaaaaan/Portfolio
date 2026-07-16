import * as THREE from 'three'

// 워프 전환 정점에서 별이 카메라 쪽으로 길게 늘어나는 하이퍼스페이스 스트릭.
// 각 스트릭은 같은 위치의 정점 두 개(머리 aTail=0, 꼬리 aTail=1)로 시작하고,
// 버텍스 셰이더가 꼬리만 +z(카메라 쪽)로 uStretch만큼 밀어 원근에 의해
// 화면 중심에서 방사형으로 뻗는 선이 된다. 평상시(intensity=0)에는
// visible=false로 렌더 비용이 0이다.
const VERT = /* glsl */ `
  attribute float aTail;
  uniform float uStretch;
  varying float vTail;
  void main() {
    vTail = aTail;
    vec3 p = position;
    p.z += aTail * uStretch;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const FRAG = /* glsl */ `
  uniform float uOpacity;
  varying float vTail;
  void main() {
    float alpha = (1.0 - vTail) * uOpacity;
    gl_FragColor = vec4(0.72, 0.82, 1.0, alpha);
  }
`

export function createWarpStreaks({ count = 400 } = {}) {
  const positions = new Float32Array(count * 2 * 3)
  const tails = new Float32Array(count * 2)

  for (let i = 0; i < count; i++) {
    // 별필드(±2600, z -900~600)와 같은 공간감이되 화면 중앙을 살짝 비운다.
    const x = (Math.random() - 0.5) * 2200
    const y = (Math.random() - 0.5) * 2200
    const z = -900 + Math.random() * 1200
    for (let v = 0; v < 2; v++) {
      const o = (i * 2 + v) * 3
      positions[o] = x
      positions[o + 1] = y
      positions[o + 2] = z
      tails[i * 2 + v] = v
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aTail', new THREE.BufferAttribute(tails, 1))

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uStretch: { value: 0 },
      uOpacity: { value: 0 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  const object3d = new THREE.LineSegments(geometry, material)
  object3d.visible = false

  return {
    object3d,
    update(intensity) {
      object3d.visible = intensity > 0.02
      material.uniforms.uStretch.value = intensity * 220
      material.uniforms.uOpacity.value = intensity <= 0
        ? 0
        : Math.min(1, intensity * 1.2) * 0.55
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
