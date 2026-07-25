// Volumetric cloud-sea + sky background. Rendered on a full-screen NDC quad
// (vertex shader outputs clip space directly, so it ignores the camera and
// always fills the screen). Rays are reconstructed from the perspective
// camera basis passed as uniforms, so the clouds are parallax-correct as the
// tour moves. Outputs LINEAR color; OutputPass handles sRGB.

export const CLOUD_FRAG = /* glsl */ `
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform vec3 uCamPos;
  uniform vec3 uCamRight;
  uniform vec3 uCamUp;
  uniform vec3 uCamFwd;
  uniform float uTanFov;
  uniform float uAspect;
  uniform vec3 uSunDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * vnoise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return s;
  }

  // Cloud slab lives below the flight path, between y = LOW and y = HIGH.
  const float LOW = -6.0;
  const float HIGH = -1.5;

  float density(vec3 p) {
    float base = fbm(p * 0.12 + vec3(uTime * 0.02, 0.0, 0.0));
    float edge = smoothstep(LOW, LOW + 1.5, p.y) * (1.0 - smoothstep(HIGH - 1.5, HIGH, p.y));
    return clamp((base - 0.48) * 2.2 * edge, 0.0, 1.0);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
    vec3 ro = uCamPos;
    vec3 rd = normalize(
      uCamFwd + uv.x * uTanFov * uAspect * uCamRight + uv.y * uTanFov * uCamUp);

    vec3 sun = normalize(uSunDir);
    float up = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 sky = mix(vec3(0.55, 0.62, 0.74), vec3(0.10, 0.22, 0.48), up);
    sky += vec3(1.0, 0.85, 0.6) * pow(max(dot(rd, sun), 0.0), 64.0) * 0.6;

    float trans = 1.0;
    vec3 acc = vec3(0.0);
    float tStart = 2.0;
    float dt = (40.0 - tStart) / 48.0;
    for (int i = 0; i < 48; i++) {
      float t = tStart + dt * float(i);
      vec3 p = ro + rd * t;
      if (p.y < LOW - 1.0 || p.y > HIGH + 1.0) continue;
      float dens = density(p);
      if (dens > 0.001) {
        float shadow = density(p + sun * 1.2);
        float light = clamp(1.0 - shadow, 0.0, 1.0);
        vec3 lit = mix(vec3(0.45, 0.5, 0.62), vec3(1.0, 0.97, 0.92), light);
        float a = dens * 0.5;
        acc += trans * a * lit;
        trans *= 1.0 - a;
        if (trans < 0.02) break;
      }
    }

    vec3 col = acc + sky * trans;
    gl_FragColor = vec4(col, 1.0);
  }
`
