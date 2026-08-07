// 행성 표면: 절차적 지형 + 항성 하나짜리 직접 라이팅 + 대기 프레넬 림 +
// 야간면 미광. three.js 표준 머티리얼 대신 직접 쓰는 이유는, 광원이 원점의
// 항성 하나뿐이라 조명 파이프라인을 태울 이유가 없고 야간면·대기처럼
// 표준 모델이 못 내는 표현이 필요해서다.
import { GLSL_NOISE } from './noise.glsl.js'

export const PLANET_UNIFORM_NAMES = [
  'uBaseColor', 'uSunPos', 'uTime', 'uSeed', 'uOpacity', 'uRimColor',
]

export const PLANET_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

void main() {
  vLocalPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  // 행성은 균등 스케일만 쓰므로 법선변환에 normalMatrix 대신 modelMatrix로 충분하다.
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

export const PLANET_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uBaseColor;
uniform vec3 uSunPos;
uniform float uTime;
uniform float uSeed;
uniform float uOpacity;
uniform vec3 uRimColor;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

${GLSL_NOISE}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uSunPos - vWorldPos);
  vec3 V = normalize(cameraPosition - vWorldPos);

  // --- 지형: 로컬 좌표로 샘플해야 자전해도 무늬가 표면에 붙어 돈다.
  vec3 sp = normalize(vLocalPos) * 2.2 + uSeed;
  float continents = fbm(sp, 5);
  float ridges = fbmRidged(sp * 1.9, 4);
  // 대륙(넓은 덩어리) 위에 능선을 얹어 "지형"으로 읽히게 한다.
  float terrain = continents * 0.75 + ridges * 0.35;

  // 극지방을 밝게 — 구가 축을 가진 천체로 읽힌다.
  float lat = abs(normalize(vLocalPos).y);
  float ice = smoothstep(0.72, 0.98, lat + terrain * 0.12);

  vec3 albedo = uBaseColor;
  albedo *= 0.55 + 0.9 * terrain;
  albedo = mix(albedo, uBaseColor * 1.9 + vec3(0.12), ice);

  // --- 라이팅: 램버트 + 부드러운 명암 경계(터미네이터).
  float ndl = dot(N, L);
  float day = smoothstep(-0.12, 0.35, ndl);

  // 야간면: 완전히 검게 죽이지 않고 아주 옅은 자체 발광을 남긴다.
  vec3 night = uBaseColor * 0.06;

  vec3 color = mix(night, albedo * (0.15 + 1.05 * max(ndl, 0.0)), day);

  // --- 대기 프레넬 림: 가장자리로 갈수록 강해지고, 낮쪽에서 더 밝다.
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  float rimLit = fres * (0.25 + 0.95 * smoothstep(-0.35, 0.5, ndl));
  color += uRimColor * rimLit * 0.85;

  // 아주 느린 대기 흐름 — 완전 정지 화면으로 보이지 않을 만큼만.
  float drift = fbm(sp * 0.7 + vec3(uTime * 0.012, 0.0, 0.0), 3);
  color *= 0.94 + 0.12 * drift;

  gl_FragColor = vec4(color, uOpacity);
  gl_FragColor = linearToOutputTexel(gl_FragColor);
}
`
