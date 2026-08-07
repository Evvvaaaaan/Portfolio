// 행성 표면·항성 난류·성운이 공유하는 노이즈 함수 모음. 유니폼도 varying도
// 참조하지 않는 순수 함수라 어느 프래그먼트 셰이더 앞에도 그대로 붙는다.
//
// 텍스처를 받지 않고 절차적으로 만드는 이유: 다운로드가 없으니 첫 로딩이
// 늘지 않고, 행성마다 시드만 바꿔 서로 다른 지형을 줄 수 있다.

export const GLSL_NOISE = /* glsl */ `
// 3D 해시 → [0,1). sin 기반 해시는 GPU마다 정밀도가 달라 밴딩이 생기므로
// 정수 비트 섞기를 쓴다.
float hash13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

// 값 노이즈: 격자 8개 코너를 스무스스텝으로 보간한다.
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

// 옥타브를 겹쳐 큰 형태와 잔디테일을 동시에 만든다.
float fbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * vnoise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return sum;
}

// 능선형 변형: 산맥·소용돌이처럼 날 선 구조를 만든다.
float fbmRidged(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
    sum += amp * n * n;
    p *= 2.07;
    amp *= 0.5;
  }
  return sum;
}
`
