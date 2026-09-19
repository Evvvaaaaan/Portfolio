export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_MODEL_BYTES = 50 * 1024 * 1024

export function validateImageFile(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('IMAGE_TYPE')
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('IMAGE_SIZE')
}

export async function readImage(file) {
  validateImageFile(file)
  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width < 100 || bitmap.height < 100 || bitmap.width * bitmap.height > 32_000_000) throw new Error('IMAGE_DIMENSIONS')
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return { name: file.name, data: canvas.toDataURL('image/jpeg', 0.92), width: canvas.width, height: canvas.height }
  } finally { bitmap.close() }
}

export function validateGlb(buffer) {
  if (buffer.byteLength > MAX_MODEL_BYTES || buffer.byteLength < 20) throw new Error('MODEL_SIZE')
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw new Error('INVALID_MODEL')
  const jsonLength = view.getUint32(12, true)
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength > buffer.byteLength - 20) throw new Error('INVALID_MODEL')
  let json
  try { json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength))) }
  catch { throw new Error('INVALID_MODEL') }
  for (const resource of [...(json.buffers || []), ...(json.images || [])]) {
    if (resource.uri && !/^data:/.test(resource.uri)) throw new Error('EXTERNAL_MODEL_RESOURCE')
  }
}

export async function fittingRequest(path, { token, body, signal, asset = false, method } = {}) {
  const response = await fetch(`/api/fitting${path}`, {
    method: method || (body ? 'POST' : 'GET'), signal,
    headers: { ...(token ? { 'X-Fitting-Token': token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.headers.get('content-type')?.includes(asset ? 'model/gltf-binary' : 'application/json') && !asset) throw new Error('LOCAL_ONLY')
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw new Error(result.error || 'CONNECTION_FAILED')
  }
  return asset ? response.blob() : response.json()
}

export const ERROR_COPY = {
  ko: {
    IMAGE_TYPE: 'JPG, PNG, WebP 이미지 파일을 선택해 주세요.', IMAGE_SIZE: '이미지는 8MB 이하로 올려 주세요.',
    IMAGE_DIMENSIONS: '가로·세로 100px 이상, 총 3,200만 화소 이하 사진을 사용해 주세요.',
    INVALID_IMAGE: '이미지 파일을 읽을 수 없습니다. JPG 또는 PNG로 다시 저장해 주세요.',
    MODEL_SIZE: '50MB 이하 GLB 파일을 선택해 주세요.', INVALID_MODEL: '유효한 GLB 2.0 모델이 아닙니다.',
    MODEL_TOO_LARGE: '모델이 너무 복잡합니다. 60만 삼각형 이하로 줄여 주세요.', EXTERNAL_MODEL_RESOURCE: '텍스처가 포함된 단일 GLB 파일을 사용해 주세요.',
    LOCAL_ONLY: 'AI 생성은 Higgsfield CLI가 연결된 로컬 Lab에서 사용할 수 있습니다.',
    CLI_MISSING: '이 컴퓨터에 Higgsfield CLI가 필요합니다.', LOGIN_REQUIRED: '터미널에서 higgsfield auth login으로 다시 로그인해 주세요.',
    CREDITS_REQUIRED: 'Higgsfield 크레딧이 부족하거나 결제가 필요합니다.', BUSY: '현재 생성 중인 작업이 끝난 뒤 다시 시도해 주세요.',
    NO_RESULT: '생성 결과에서 지원하는 이미지 또는 GLB를 찾지 못했습니다. Higgsfield 작업 내역을 확인해 주세요.',
    SOURCE_EXPIRED: '로컬 임시 결과가 만료되었습니다. 이미 완료된 모델은 Higgsfield에서 내려받아 불러올 수 있습니다.',
    GENERATION_FAILED: 'Higgsfield 생성에 실패했습니다. 작업 내역을 확인해 주세요. 자동 재시도는 하지 않습니다.',
    GENERATION_TIMEOUT: '생성 대기 시간이 끝났습니다. 중복 결제 방지를 위해 Higgsfield 작업 내역을 먼저 확인해 주세요.',
    INVALID_SESSION: '로컬 연결이 갱신되었습니다. 새로고침 후 다시 연결해 주세요.',
    CONNECTION_FAILED: '연결이 끊겼습니다. 새 생성 요청 없이 작업 상태를 다시 확인할 수 있습니다.',
    WEBGL: '3D를 표시하려면 WebGL이 필요합니다. 하드웨어 가속을 켜고 다시 시도해 주세요.',
  },
  en: {
    IMAGE_TYPE: 'Choose a JPG, PNG or WebP image.', IMAGE_SIZE: 'Images must be under 8 MB.', IMAGE_DIMENSIONS: 'Use an image at least 100 px wide and high, up to 32 megapixels.',
    INVALID_IMAGE: 'This image could not be read. Save it again as JPG or PNG.', MODEL_SIZE: 'Choose a GLB under 50 MB.', INVALID_MODEL: 'This is not a valid GLB 2.0 model.',
    MODEL_TOO_LARGE: 'Use a model with fewer than 600,000 triangles.', EXTERNAL_MODEL_RESOURCE: 'Use a single GLB with embedded textures.',
    LOCAL_ONLY: 'AI generation is available in the local Lab with Higgsfield CLI connected.', CLI_MISSING: 'Install Higgsfield CLI on this computer first.',
    LOGIN_REQUIRED: 'Sign in again using higgsfield auth login in your terminal.', CREDITS_REQUIRED: 'Higgsfield requires more credits or a payment.',
    BUSY: 'Wait for the current generation to finish.', NO_RESULT: 'No supported image or GLB was found. Check your Higgsfield job history.',
    SOURCE_EXPIRED: 'The temporary local result expired. Completed models can still be downloaded from Higgsfield and imported here.',
    GENERATION_FAILED: 'Generation failed. Check your Higgsfield history. No automatic retry was made.',
    GENERATION_TIMEOUT: 'The wait timed out. Check Higgsfield before starting another paid job.', INVALID_SESSION: 'The local connection changed. Refresh to reconnect.',
    CONNECTION_FAILED: 'Connection interrupted. Check this job again without creating another one.', WEBGL: 'This viewer needs WebGL. Enable hardware acceleration and try again.',
  },
}
