// 인트로 전용 비주얼 두 가지. 둘 다 "설계도" 언어를 공유하지만 좌표계가
// 다르다 — 그리드는 화면에 고정된 종이, 궤도는 3D 공간의 선이다.

export const GRID_UNIFORM_NAMES = ['uOpacity', 'uAspect', 'uLineColor']

export const GRID_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // 클립 공간에 그대로 찍는다 — 카메라가 레일을 따라 움직여도 그리드는
  // 화면에 붙어 있어야 "설계도 위에 그린다"는 은유가 유지된다.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const GRID_FRAG = /* glsl */ `
precision highp float;

uniform float uOpacity;
uniform float uAspect;
uniform vec3 uLineColor;

varying vec2 vUv;

// 한 축의 격자선 세기. fwidth로 화면 공간 폭을 고정해 해상도와 무관하게
// 같은 굵기로 보이게 한다.
float gridLine(float coord, float cells) {
  float f = fract(coord * cells);
  float d = min(f, 1.0 - f);
  return 1.0 - smoothstep(0.0, fwidth(coord * cells), d);
}

void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);

  float fine = max(gridLine(p.x, 28.0), gridLine(p.y, 28.0));
  float coarse = max(gridLine(p.x, 7.0), gridLine(p.y, 7.0));

  // 화면 중앙이 밝고 가장자리로 갈수록 어두워지는 비네트 — 종이가 조명
  // 아래 놓인 느낌을 주고 가장자리 격자가 시선을 끌지 않게 한다.
  float vignette = 1.0 - smoothstep(0.25, 0.95, length(vUv - 0.5) * 1.6);

  float a = (fine * 0.16 + coarse * 0.42) * vignette * uOpacity;
  gl_FragColor = vec4(uLineColor, a);
  if (a < 0.002) discard;
}
`

export const ORBIT_UNIFORM_NAMES = ['uDraw', 'uLineColor', 'uBaseOpacity']

export const ORBIT_VERT = /* glsl */ `
attribute float aArc;
varying float vArc;
void main() {
  vArc = aArc;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const ORBIT_FRAG = /* glsl */ `
precision highp float;

uniform float uDraw;
uniform vec3 uLineColor;
uniform float uBaseOpacity;

varying float vArc;

void main() {
  // uDraw 앞쪽만 그려진 상태. 프런트 근처를 밝게 태워 펜 끝처럼 보이게 한다.
  float drawn = step(vArc, uDraw);
  float hot = (1.0 - smoothstep(0.0, 0.06, uDraw - vArc)) * step(vArc, uDraw);

  float a = drawn * uBaseOpacity * (1.0 + 2.2 * hot);
  gl_FragColor = vec4(uLineColor * (1.0 + 1.8 * hot), a);
  if (a < 0.002) discard;
}
`
