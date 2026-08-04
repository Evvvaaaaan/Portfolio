// 딥스페이스 성운: 항성계를 통째로 감싸는 큰 구의 안쪽 면에 그린다.
// "검은 우주가 주인공"이라는 제약이 있으므로 아주 얕게 — 별이 묻히거나
// 하늘이 뿌옇게 뜨면 실패다. uIntensity 하나로 전체 밀도를 끌 수 있게 둔다.
import { GLSL_NOISE } from './noise.glsl.js'

export const NEBULA_UNIFORM_NAMES = ['uColorA', 'uColorB', 'uIntensity', 'uTime']

export const NEBULA_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  // 구 안쪽에서 보는 방향 = 로컬 좌표 방향. 카메라가 항성계 안을 돌아다녀도
  // 성운은 충분히 멀어 방향만으로 결정된다고 근사한다.
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const NEBULA_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uIntensity;
uniform float uTime;

varying vec3 vDir;

${GLSL_NOISE}

void main() {
  vec3 d = normalize(vDir);

  // 아주 느리게 흐르는 큰 구름 + 그 안의 잔결.
  vec3 p = d * 1.6 + vec3(uTime * 0.004, 0.0, uTime * 0.003);
  float clouds = fbm(p, 5);
  float wisps = fbmRidged(d * 3.1 + vec3(0.0, uTime * 0.006, 0.0), 3);

  // 임계값을 높게 잡아 하늘의 일부에만 성운이 끼게 한다 — 전면에 깔면
  // 검은 우주가 사라진다.
  float mass = smoothstep(0.52, 0.92, clouds * 0.8 + wisps * 0.32);

  vec3 color = mix(uColorA, uColorB, clamp(wisps * 1.2, 0.0, 1.0));

  float a = mass * uIntensity;
  gl_FragColor = vec4(color * a, a);
  gl_FragColor = linearToOutputTexel(gl_FragColor);
  if (a < 0.002) discard;
}
`
