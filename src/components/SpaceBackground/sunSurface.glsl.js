// 항성 표면: 대류 세포처럼 끓는 난류 + 가장자리로 갈수록 붉어지는 림브
// 다크닝. 기존 캔버스 글로우 스프라이트는 그대로 두고(먼 거리의 헤일로 역할)
// 구체 표면만 이 셰이더가 맡는다.
import { GLSL_NOISE } from './noise.glsl.js'

export const SUN_UNIFORM_NAMES = ['uCoreColor', 'uEdgeColor', 'uTime']

export const SUN_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

void main() {
  vLocalPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

export const SUN_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uCoreColor;
uniform vec3 uEdgeColor;
uniform float uTime;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

${GLSL_NOISE}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);

  vec3 sp = normalize(vLocalPos) * 3.4;

  // 두 속도로 흐르는 난류를 겹쳐 "끓는" 느낌을 만든다 — 한 겹만 쓰면
  // 무늬가 통째로 흘러가는 것처럼 보인다.
  float t1 = fbm(sp + vec3(0.0, uTime * 0.055, 0.0), 4);
  float t2 = fbmRidged(sp * 1.7 - vec3(uTime * 0.032, 0.0, 0.0), 3);
  float turb = t1 * 0.68 + t2 * 0.52;

  // 림브 다크닝: 실제 항성처럼 가장자리가 어둡고 붉다.
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float limb = pow(mu, 0.55);

  vec3 color = mix(uEdgeColor, uCoreColor, limb);
  color *= 0.72 + 0.75 * turb;

  // 밝은 반점(광구 과립)을 살짝 태워 정적인 원반처럼 보이지 않게 한다.
  float hot = smoothstep(0.62, 0.92, turb);
  color += uCoreColor * hot * 0.5;

  gl_FragColor = vec4(color, 1.0);
  gl_FragColor = linearToOutputTexel(gl_FragColor);
}
`
