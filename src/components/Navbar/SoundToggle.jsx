import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../context/LangContext'
import { createAmbientAudio } from '../../audio/ambientAudio.js'

const HINT_KEY = 'evanSystemSoundHinted'

export default function SoundToggle() {
  const { t } = useLang()
  const [on, setOn] = useState(false)
  // 유도는 "한 번 살짝 알린다"까지다 — 모달로 막아 세우면 배경음 하나 때문에
  // 방문의 첫 동작을 빼앗는 셈이 된다. sessionStorage 읽기는 마운트 이펙트가
  // 아니라 지연 초기값(lazy initial state)으로 한다 — 이펙트 안에서
  // setState를 부르면 "이펙트가 필요 없는" 마운트 시점 계산이 되어
  // react-hooks/set-state-in-effect가 걸린다.
  const [hinted, setHinted] = useState(() => {
    try {
      return Boolean(sessionStorage.getItem(HINT_KEY))
    } catch {
      // 프라이빗 모드 등에서 sessionStorage가 막히면 유도를 생략한다.
      return true
    }
  })
  const audioRef = useRef(null)

  // 탭을 떠날 때 오디오 그래프가 남아 있으면 브라우저가 계속 붙들고 있다.
  useEffect(() => () => audioRef.current?.dispose(), [])

  const toggle = () => {
    // 컨텍스트는 반드시 이 클릭(사용자 제스처) 안에서 만든다 — 밖에서 만들면
    // suspended로 굳어 소리가 나지 않는다.
    if (!audioRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      audioRef.current = createAmbientAudio(new Ctx())
    }
    if (on) {
      audioRef.current.stop()
      setOn(false)
    } else {
      audioRef.current.start()
      setOn(true)
    }
    if (!hinted) {
      setHinted(true)
      try {
        sessionStorage.setItem(HINT_KEY, '1')
      } catch {
        // 저장 실패는 무시한다 — 유도가 한 번 더 보일 뿐이다.
      }
    }
  }

  const label = on ? t.sound.off : t.sound.on

  return (
    <button
      type="button"
      className={`nav-icon-btn sound-btn ${on ? 'sound-btn--on' : ''} ${hinted ? '' : 'sound-btn--hint'}`}
      aria-pressed={on}
      title={hinted ? label : t.sound.hint}
      onClick={toggle}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="4 9 8 9 13 5 13 19 8 15 4 15" />
        {on ? (
          <>
            <path d="M16.5 8.5a5 5 0 0 1 0 7" />
            <path d="M19 6a8.5 8.5 0 0 1 0 12" />
          </>
        ) : (
          <path d="M17 9.5l4 5m0-5l-4 5" />
        )}
      </svg>
      <span className="nav-icon-btn-label">{label}</span>
    </button>
  )
}
