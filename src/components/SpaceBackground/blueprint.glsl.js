// 청사진 메시 셰이더: 실체 메시와 같은 지오메트리를 겹쳐 그리며 "선 드로잉 →
// 와이어프레임"까지를 담당한다. 실체화(0.55~1.0 구간)는 실체 메시의 opacity가
// 맡고, 이 셰이더는 그 구간에서 역으로 사라진다 — 둘의 합이 교차 페이드다.
//
// 실체 머티리얼에 onBeforeCompile로 주입하지 않고 별도 메시로 분리한 이유:
// 주입은 three.js 내부 청크 이름에 의존해 버전 업그레이드에 취약하고,
// build=1에서 원래 렌더 경로와 완전히 같다는 보장을 하기 어렵다.

export const BLUEPRINT_UNIFORM_NAMES = ['uBuild', 'uLineColor', 'uExtent']

export const BLUEPRINT_VERT = /* glsl */ `
attribute vec3 aBary;
varying vec3 vBary;
varying vec3 vLocal;

void main() {
  vBary = aBary;
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const BLUEPRINT_FRAG = /* glsl */ `
precision highp float;

uniform float uBuild;
uniform vec3 uLineColor;
uniform float uExtent;

varying vec3 vBary;
varying vec3 vLocal;

// 바리센트릭 최솟값 = 가장 가까운 삼각형 변까지의 거리.
// fwidth로 화면 공간 미분을 취해야 원근에 상관없이 선 굵기가 일정하다
// (안 그러면 멀리 있는 행성의 와이어가 통째로 사라지거나 뭉갠다).
float wireEdge(vec3 bary, float width) {
  vec3 d = fwidth(bary) * width;
  vec3 a = smoothstep(vec3(0.0), d, bary);
  return 1.0 - min(min(a.x, a.y), a.z);
}

void main() {
  float wire = wireEdge(vBary, 1.4);

  // 드로잉 스윕: 오브젝트 아래(-Y)에서 위(+Y)로 훑으며 선이 나타난다.
  // uExtent로 정규화해 크기가 다른 행성들이 같은 속도로 그려지게 한다.
  float h = clamp(vLocal.y / max(uExtent, 0.0001) * 0.5 + 0.5, 0.0, 1.0);
  // 스윕 프런트를 [0,1] 정의역 밖(-0.12 ~ 1.12)까지 보내야 양 끝에서
  // smoothstep 창이 완전히 닫힌다. 0~1로만 훑으면 uBuild=0에서 하단이,
  // 프런트가 1에 붙는 구간에서 상단이 어중간하게 남는다.
  float front = mix(-0.12, 1.12, smoothstep(0.0, 0.5, uBuild));
  float drawn = 1.0 - smoothstep(front - 0.10, front + 0.02, h);

  // 0.55부터 실체 메시가 올라오므로 청사진은 그만큼 물러난다.
  float fade = 1.0 - smoothstep(0.55, 1.0, uBuild);
  float alpha = wire * drawn * fade;

  // 드로잉 프런트 부근을 밝게 태워 "지금 그려지는 중"이 읽히게 한다.
  float hot = (1.0 - smoothstep(0.0, 0.12, abs(h - front))) * fade;

  gl_FragColor = vec4(uLineColor * (0.75 + 1.6 * hot), alpha);
  if (gl_FragColor.a < 0.003) discard;
}
`
