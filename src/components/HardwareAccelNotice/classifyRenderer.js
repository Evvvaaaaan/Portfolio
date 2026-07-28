// WebGL UNMASKED_RENDERER 문자열을 하드웨어/소프트웨어 렌더러로 분류하는 순수 함수.
// 소프트웨어 렌더러(하드웨어 가속 꺼짐)로 "확실히" 판별될 때만 'software'를 돌려주고,
// 문자열을 가져올 수 없거나(개인정보 마스킹 등) 모호하면 'unknown'으로 남겨 오탐을 피한다.

// GPU 없이 CPU로 그리는 대표적 소프트웨어 렌더러 시그니처.
const SOFTWARE_PATTERNS = [
  /swiftshader/i, // Chrome 소프트웨어 폴백 (GoogleSwiftShader 포함)
  /llvmpipe/i, // Mesa 소프트웨어 (Linux)
  /softpipe/i, // Mesa 소프트웨어
  /software/i, // "Software Rasterizer" 등
  /basic render/i, // "Microsoft Basic Render Driver"
  /mesa offscreen/i, // Mesa offscreen 소프트웨어
]

/**
 * @param {string|null|undefined} renderer WEBGL_debug_renderer_info의 UNMASKED_RENDERER_WEBGL 값
 * @returns {'software'|'hardware'|'unknown'}
 */
export function classifyRenderer(renderer) {
  if (!renderer || typeof renderer !== 'string') return 'unknown'
  const s = renderer.trim()
  if (!s) return 'unknown'
  if (SOFTWARE_PATTERNS.some((re) => re.test(s))) return 'software'
  return 'hardware'
}
