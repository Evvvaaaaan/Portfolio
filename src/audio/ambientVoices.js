// 앰비언트 드론 합성 레시피 (순수 데이터 — Web Audio 미의존, 단위 테스트 대상).
// 오디오 파일을 쓰지 않는 이유: 저장소에 오디오 자산이 없고, 파일을 들이면
// 용량과 라이선스가 따라온다. 오실레이터로 만들면 둘 다 없고 "브라우저에서
// 직접 만들었다"는 이 사이트의 이야기와도 맞는다.

// 배경음의 목적은 존재감이지 주목이 아니다 — 대화를 방해하면 실패다.
export const MASTER_GAIN = 0.06
// 페이드가 짧으면 배경음이 아니라 효과음처럼 "켜졌다"고 인식된다.
export const FADE_IN_S = 2.5
export const FADE_OUT_S = 1.2

// A1(55Hz)을 기음으로 한 배음렬. 정수배로 쌓아야 뭉개지지 않고 하나의
// 음색으로 들린다. detune은 센트 단위로 살짝 어긋내 맥놀이를 만든다 —
// 완전히 같은 위상이면 합성음 특유의 죽은 소리가 난다.
export const AMBIENT_VOICES = [
  {
    id: 'sub',
    type: 'sine',
    freq: 55,
    gain: 0.5,
    detune: 0,
    filter: null,
    lfo: null,
  },
  {
    id: 'body',
    type: 'triangle',
    freq: 110,
    gain: 0.26,
    detune: -6,
    filter: { type: 'lowpass', freq: 420, q: 0.7 },
    // 아주 느린 필터 스윕 — 소리가 "숨쉬는" 느낌을 만든다.
    lfo: { target: 'filterFreq', freq: 0.05, depth: 160 },
  },
  {
    id: 'air',
    type: 'sine',
    freq: 220,
    gain: 0.12,
    detune: 7,
    filter: { type: 'lowpass', freq: 900, q: 0.5 },
    lfo: { target: 'gain', freq: 0.07, depth: 0.06 },
  },
  {
    id: 'shimmer',
    type: 'sine',
    freq: 440,
    gain: 0.05,
    detune: -4,
    filter: { type: 'highpass', freq: 300, q: 0.4 },
    lfo: { target: 'gain', freq: 0.11, depth: 0.03 },
  },
]
