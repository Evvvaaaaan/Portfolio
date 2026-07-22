// MediaPipe FaceLandmarker 결과 → 파티클 엔진이 쓰는 순수 신호 변환

// 얼굴 윤곽 + 눈 + 입술의 대표 메시 인덱스 (초상 앵커)
export const ANCHOR_INDICES = [
  // face oval
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
  378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
  162, 21, 54, 103, 67, 109,
  // left eye
  33, 160, 158, 133, 153, 144,
  // right eye
  362, 385, 387, 263, 373, 380,
  // outer lips
  61, 40, 37, 0, 267, 291, 321, 314, 17, 84, 91, 146,
]

const NOSE_TIP = 1

// 미러 화면 기준으로 앵커들을 픽셀 좌표로 변환
export function selectAnchors(landmarks, W, H) {
  return ANCHOR_INDICES.map((i) => ({
    x: (1 - landmarks[i].x) * W,
    y: landmarks[i].y * H,
  }))
}

export function faceCenter(landmarks, W, H) {
  return { x: (1 - landmarks[NOSE_TIP].x) * W, y: landmarks[NOSE_TIP].y * H }
}

// blendshapes 배열 → 표정 신호 세 가지 (0..1)
export function readExpression(blendshapes) {
  const get = (name) =>
    blendshapes.find((b) => b.categoryName === name)?.score ?? 0
  return {
    jawOpen: get('jawOpen'),
    smile: (get('mouthSmileLeft') + get('mouthSmileRight')) / 2,
    blink: (get('eyeBlinkLeft') + get('eyeBlinkRight')) / 2,
  }
}

export const JAW_OPEN_BURST = 0.45

export function isBurst(jawOpen) {
  return jawOpen > JAW_OPEN_BURST
}
