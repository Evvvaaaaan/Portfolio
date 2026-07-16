import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

// 데스크톱 전용 포스트프로세싱 체인: 은은한 블룸(상시) + 워프 정점에서만
// 걸리는 방사형 블러/색수차(uIntensity 드라이버, 0이면 입력 그대로 통과).
// WebGL 컨텍스트가 필요해 vitest 대상이 아니다 — e2e 스모크와 수동 검증.
const WarpDistortShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0 },
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
    varying vec2 vUv;
    void main() {
      vec2 center = vec2(0.5);
      vec2 toCenter = center - vUv;
      float dist = length(toCenter);

      // 방사형 블러: 중심 방향으로 6샘플 누적 (uIntensity=0이면 step=0 → 원본)
      vec2 blurStep = toCenter * uIntensity * 0.05;
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
      gl_FragColor = vec4(color, 1.0);
    }
  `,
}

export function createPostFX(renderer, scene, camera, width, height) {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  // 블룸은 은은하게: threshold를 높여 밝은 별심만 번지게 한다.
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.35, 0.55, 0.82)
  composer.addPass(bloom)

  const warpPass = new ShaderPass(WarpDistortShader)
  composer.addPass(warpPass)

  // 커스텀 패스로 체인이 끝나면 linear→sRGB 출력 변환이 빠져 직접 렌더 경로보다
  // 어둡게 나온다. OutputPass가 톤매핑/컬러스페이스 변환을 담당한다.
  const outputPass = new OutputPass()
  composer.addPass(outputPass)

  // EffectComposer.setSize는 각 패스에 pixelRatio를 곱해 전파한다. 생성 직후
  // 한 번 호출해 초기 상태와 리사이즈 후 상태의 해상도(디바이스 픽셀)를
  // 일치시킨다 — 안 하면 첫 리사이즈에서 블룸 비용이 DPR^2배로 뛴다.
  composer.setSize(width, height)

  return {
    render(intensity) {
      warpPass.uniforms.uIntensity.value = intensity
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
      outputPass.dispose()
      composer.dispose()
    },
  }
}
