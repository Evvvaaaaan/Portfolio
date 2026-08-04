import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

// 데스크톱 전용 포스트프로세싱 체인: 은은한 블룸(상시) + 워프 정점에서만
// 걸리는 방사형 블러/색수차(uIntensity 드라이버, 0이면 입력 그대로 통과).
// WebGL 컨텍스트가 필요해 vitest 대상이 아니다 — e2e 스모크와 수동 검증.
//
// 이 패스가 체인의 마지막이라 화면 출력을 담당한다. three.js의 OutputPass는
// (이 버전 조합에서) linear→sRGB 변환을 한 번 더 겹쳐 적용해 검정 배경이
// 뿌옇게 뜨는 버그가 있었다 — 실측: OutputPass 포함 시 클리어컬러
// #0a0a0f가 화면에서 rgb(103,103,115)로 렌더됨(직접 렌더링 경로 대비
// 훨씬 밝음). OutputPass를 걷어내고 표준 sRGB OETF를 이 셰이더의 마지막
// 스텝에 직접 넣어 단일 변환만 일어나게 한다(three.js
// ShaderChunk의 sRGBTransferOETF와 동일 공식).
const WarpDistortShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0 },
    uTime: { value: 0 },
    uGrain: { value: 0.055 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uTime;
    uniform float uGrain;
    varying vec2 vUv;

    vec3 sRGBEncode(vec3 c) {
      return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
    }

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 center = vec2(0.5);
      vec2 toCenter = center - vUv;
      float dist = length(toCenter);

      // 방사형 블러: 중심 방향으로 6샘플 누적 (uIntensity=0이면 step=0 → 원본)
      vec2 blurStep = toCenter * uIntensity * 0.03;
      vec3 acc = vec3(0.0);
      vec2 uv = vUv;
      for (int i = 0; i < 6; i++) {
        acc += texture2D(tDiffuse, uv).rgb;
        uv += blurStep;
      }
      acc /= 6.0;

      // 색수차: 가장자리로 갈수록 RGB 채널 분리
      float ca = uIntensity * dist * 0.012;
      vec2 dir = normalize(toCenter + vec2(1e-6));
      float r = texture2D(tDiffuse, vUv + dir * ca).r;
      float b = texture2D(tDiffuse, vUv - dir * ca).b;
      vec3 split = vec3(r, acc.g, b);

      vec3 color = mix(acc, split, min(1.0, uIntensity * 1.5));

      // 비네트: 가장자리를 눌러 시선을 화면 중앙(항성계)에 붙든다.
      float vig = 1.0 - smoothstep(0.42, 1.05, dist * 1.6);
      color *= mix(0.62, 1.0, vig);

      // 필름 그레인: 매 프레임 다른 노이즈. 절차적 표면의 밴딩을 깨주고
      // 렌더가 "찍힌 화면"처럼 보이게 한다 — 아주 옅게.
      float g = hash12(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 137.0);
      color += (g - 0.5) * uGrain;

      gl_FragColor = vec4(sRGBEncode(color), 1.0);
    }
  `,
}

export function createPostFX(renderer, scene, camera, width, height) {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  // 블룸은 은은하게: threshold를 높여 밝은 별심만 번지게 한다.
  // threshold를 높이고 strength를 낮춰 어두운 영역에 빛 번짐(뿌연 느낌) 방지
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.2, 0.4, 0.92)
  composer.addPass(bloom)

  const warpPass = new ShaderPass(WarpDistortShader)
  composer.addPass(warpPass)

  // EffectComposer.setSize는 각 패스에 pixelRatio를 곱해 전파한다. 생성 직후
  // 한 번 호출해 초기 상태와 리사이즈 후 상태의 해상도(디바이스 픽셀)를
  // 일치시킨다 — 안 하면 첫 리사이즈에서 블룸 비용이 DPR^2배로 뛴다.
  composer.setSize(width, height)

  return {
    render(intensity, time = 0) {
      warpPass.uniforms.uIntensity.value = intensity
      warpPass.uniforms.uTime.value = time
      composer.render()
    },
    setSize(w, h) {
      composer.setSize(w, h)
    },
    dispose() {
      // EffectComposer.dispose()는 자기 렌더타겟만 해제하고 각 패스의
      // dispose()는 호출하지 않는다 — 블룸의 내부 렌더타겟(밝기 추출 +
      // 블러 밉체인)은 직접 해제해야 리마운트/HMR 시 GPU 누수가 없다.
      bloom.dispose()
      warpPass.dispose()
      composer.dispose()
    },
  }
}
