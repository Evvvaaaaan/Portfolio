// Lab 360° 파노라마의 배경. 풀스크린 프래그먼트 셰이더 한 장이 별·속도
// 스트릭·휘어진 지구 림·대기 산란·재진입 플라즈마·근거리 입자를 모두 그린다.
// 관람자는 원점에서 회전만 하므로 카메라 위치는 uAltitude 하나로 결정된다.
//
// 좌표계: 지구 중심이 원점, 반지름 1. 카메라는 +Y축 위 (1 + camH) 지점.
// uAltitude 1 = 깊은 우주, 0 = 성층권.

export const SKY_UNIFORM_NAMES = [
  'uRes', 'uTime', 'uYaw', 'uPitch',
  'uAltitude', 'uVelocity', 'uTanFov', 'uPlasma', 'uQuality',
]

export const SKY_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const SKY_FRAG = `
precision highp float;

varying vec2 vUv;

uniform vec2  uRes;
uniform float uTime;
uniform float uYaw;       // 라디안
uniform float uPitch;     // 라디안
uniform float uAltitude;  // 1 = 깊은 우주, 0 = 성층권
uniform float uVelocity;  // 0..1 체감 속도
uniform float uTanFov;    // tan(fov/2)
uniform float uPlasma;    // 0..1 재진입 발열
uniform float uQuality;   // 1 = 데스크톱, 0.55 = 모바일

const float EARTH_R = 1.0;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// 화면 좌표 → 월드 광선. yaw는 Y축, pitch는 X축 회전.
vec3 rayDir(vec2 uv) {
  vec3 d = normalize(vec3(uv.x * uTanFov, uv.y * uTanFov, -1.0));
  float cp = cos(uPitch), sp = sin(uPitch);
  d = vec3(d.x, d.y * cp - d.z * sp, d.y * sp + d.z * cp);
  float cy = cos(uYaw), sy = sin(uYaw);
  d = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
  return normalize(d);
}

// 별. 구면 좌표를 격자로 나눠 셀마다 최대 하나. 속도가 붙으면 진행 방향
// (고도각 축)으로 늘어나 스트릭이 된다.
float stars(vec3 d) {
  vec2 sph = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
  vec2 cell = sph * (52.0 * uQuality + 18.0);
  vec2 id = floor(cell);
  vec2 f = fract(cell) - 0.5;

  float h = hash21(id);
  if (h < 0.87) return 0.0;

  vec2 off = vec2(hash21(id + 7.0), hash21(id + 13.0)) - 0.5;
  f -= off * 0.7;

  // 고도각 방향으로 늘리면 하강 진행 방향에서 뻗어 나오는 스트릭이 된다.
  f.y /= (1.0 + uVelocity * 16.0);

  float bright = (h - 0.87) / 0.13;
  float twinkle = 0.75 + 0.25 * sin(uTime * 2.0 + h * 40.0);
  return exp(-dot(f, f) * 230.0) * bright * twinkle;
}

// 화면을 스쳐 지나가는 근거리 입자. 속도는 가까운 기준점이 있어야 읽히므로
// 이게 가장 강한 속도 단서다. 멈추면 완전히 사라진다.
float motes(vec2 uv) {
  float acc = 0.0;
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float x = (hash21(vec2(fi, 7.0)) - 0.5) * 2.6;
    float speed = 0.8 + hash21(vec2(fi, 3.0)) * 1.6;
    float y = 1.6 - fract(hash21(vec2(fi, 11.0)) + uTime * speed * (0.15 + uVelocity * 1.4)) * 3.2;
    vec2 p = uv - vec2(x, y);
    p.y /= (0.015 + uVelocity * 0.42);
    acc += exp(-dot(p, p) * 520.0);
  }
  return clamp(acc, 0.0, 1.0) * uVelocity;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * 2.0;
  vec3 d = rayDir(uv);

  // 카메라 높이: 깊은 우주에서는 지구가 작게, 성층권에서는 지평선이 휜다.
  float camH = mix(0.055, 4.0, uAltitude * uAltitude);
  vec3 ro = vec3(0.0, EARTH_R + camH, 0.0);
  vec3 up = normalize(ro);
  float roLen = length(ro);

  // 지평선: 광선이 구에 접할 때의 dot(up, d).
  float sinA = EARTH_R / roLen;
  float horizonY = -sqrt(max(0.0, 1.0 - sinA * sinA));
  float dy = dot(up, d);
  float above = dy - horizonY;   // >0 하늘, <0 지구

  vec3 col = vec3(0.0);

  // ── 별 (지구에 가리지 않은 방향만)
  if (above > 0.0) {
    col += vec3(0.86, 0.91, 1.0) * stars(d);
  }

  // 고도가 낮아질수록 대기가 짙어진다.
  float atmos = 1.0 - clamp(uAltitude, 0.0, 1.0) * 0.82;

  if (above > 0.0) {
    // ── 대기 산란: 지평선에 붙을수록 주황, 위로 갈수록 파랑, 더 위는 검정
    float band  = exp(-above * 24.0);
    float haze  = exp(-above * 6.5);
    vec3 orange = vec3(1.0, 0.44, 0.13);
    vec3 blue   = vec3(0.15, 0.40, 0.92);
    vec3 sky = blue * haze * 0.85;
    sky = mix(sky, orange, band * 0.9);
    col += sky * atmos;
  } else {
    // ── 지구 표면: 성층권에서 내려다본 어두운 청회색 + 옅은 구름 얼룩
    float depth = clamp(-above * 4.0, 0.0, 1.0);
    vec2 sph = vec2(atan(d.z, d.x), d.y) * 6.0;
    float mottle = hash21(floor(sph * 3.0)) * 0.35 + 0.65;
    vec3 ground = mix(vec3(0.10, 0.17, 0.30), vec3(0.03, 0.05, 0.10), depth);
    col += ground * mottle * atmos;
    // 지평선 안쪽 가장자리를 밝혀 대기 두께를 느끼게 한다
    col += vec3(1.0, 0.55, 0.22) * exp(above * 40.0) * 0.55 * atmos;
  }

  // ── 근거리 입자
  col += vec3(0.80, 0.88, 1.0) * motes(uv) * 0.9;

  // ── 재진입 플라즈마: 화면 아래쪽에서 타오른다
  float edge = smoothstep(0.2, -1.0, uv.y);
  col += vec3(1.0, 0.36, 0.09) * edge * uPlasma * 1.1;
  col += vec3(1.0, 0.62, 0.25) * pow(edge, 3.0) * uPlasma * 0.6;

  // 아주 옅은 비네트로 가장자리를 눌러 중앙에 시선을 모은다
  col *= 1.0 - 0.22 * dot(uv, uv) * 0.25;

  gl_FragColor = vec4(col, 1.0);
}
`
