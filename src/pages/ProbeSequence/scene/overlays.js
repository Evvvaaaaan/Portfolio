import * as THREE from 'three'

// 스크롤 진행값을 직접 받는 풀스크린 셰이더 두 장.
//   1) 비네트 + 암전 — 알파 합성. 시선을 중앙에 묶고 페이즈 경계를 어둡게 닫는다.
//   2) 글로우 — 가산 합성. 클로즈업 페이즈에서만 켜진다.
// 정점 셰이더가 클립 좌표를 그대로 쓰므로 카메라 행렬과 무관하다.
//
// 두 셰이더 모두 색을 알파로 미리 곱해서 낸다. 캔버스가 alpha:true라 뒤의
// SpaceBackground 별빛이 비쳐야 하는데, three의 렌더러는 기본이
// premultipliedAlpha이고 가산 합성에서는 알파도 그대로 더해진다. 글로우가
// 알파 1.0을 내면 세기와 무관하게 화면 전체가 불투명해져 별빛을 덮는다.

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const DARK_FRAG = `
uniform float uVignette;
uniform float uDarkness;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  p.x *= uAspect;
  float d = length(p);
  float vig = smoothstep(0.15, 0.95, d) * uVignette;
  float a = clamp(vig + uDarkness, 0.0, 1.0);
  gl_FragColor = vec4(vec3(0.008, 0.008, 0.016) * a, a);
}
`

const GLOW_FRAG = `
uniform float uZoom;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  p.x *= uAspect;
  float d = length(p);
  float a = (1.0 - smoothstep(0.0, 0.62, d)) * uZoom * 0.15;
  gl_FragColor = vec4(vec3(0.95, 0.78, 0.45) * a, a);
}
`

export function createOverlays({ glow = true } = {}) {
  const scene = new THREE.Scene()
  const camera = new THREE.Camera()
  const geometry = new THREE.PlaneGeometry(2, 2)
  const materials = []

  const darkMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: DARK_FRAG,
    uniforms: { uVignette: { value: 0 }, uDarkness: { value: 0 }, uAspect: { value: 1 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  materials.push(darkMat)
  const darkQuad = new THREE.Mesh(geometry, darkMat)
  darkQuad.renderOrder = 0
  darkQuad.frustumCulled = false
  scene.add(darkQuad)

  let glowMat = null
  if (glow) {
    glowMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: GLOW_FRAG,
      uniforms: { uZoom: { value: 0 }, uAspect: { value: 1 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    })
    materials.push(glowMat)
    const glowQuad = new THREE.Mesh(geometry, glowMat)
    glowQuad.renderOrder = 1
    glowQuad.frustumCulled = false
    scene.add(glowQuad)
  }

  return {
    scene,
    camera,
    set(state) {
      darkMat.uniforms.uVignette.value = state.vig
      darkMat.uniforms.uDarkness.value = state.dark
      if (glowMat) glowMat.uniforms.uZoom.value = state.focus
    },
    setAspect(aspect) {
      darkMat.uniforms.uAspect.value = aspect
      if (glowMat) glowMat.uniforms.uAspect.value = aspect
    },
    dispose() {
      geometry.dispose()
      materials.forEach((m) => m.dispose())
    },
  }
}
