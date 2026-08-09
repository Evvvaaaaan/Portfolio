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
  // createAmbientAudio(ctx)는 컨텍스트를 인자로만 받을 뿐 소유하지 않는다 —
  // Task 2 계약상 엔진은 넘겨받은 컨텍스트를 닫지 않는다(테스트에서 가짜
  // 컨텍스트를 주입할 수 있어야 하니, close()까지 엔진이 쥐고 있으면 곤란하다).
  // 그래서 컨텍스트를 실제로 만든 쪽인 이 컴포넌트가 닫을 책임을 진다.
  const ctxRef = useRef(null)

  // 탭을 떠날 때(또는 1024px 미만으로 좁아져 언마운트될 때) 오디오 그래프가
  // 남아 있으면 브라우저가 계속 붙들고 있다. dispose()만으로는 노드 연결과
  // 오실레이터만 끊길 뿐 AudioContext 자체는 살아남는다 — 좁혔다 넓혔다를
  // 반복하면(매번 언마운트→재마운트, audioRef는 null로 초기화) 닫히지 않은
  // 컨텍스트가 계속 쌓이고, 브라우저의 동시 AudioContext 개수 제한에 걸리면
  // 새 컨텍스트 생성 자체가 던진다. 그래서 여기서 close()까지 해서 확실히
  // 정리하고, 다음 재마운트는 항상 빈 ref에서 새로 시작하게 한다.
  useEffect(() => {
    return () => {
      audioRef.current?.dispose()
      audioRef.current = null
      // 이미 닫힌 컨텍스트에 close()를 다시 부르면 reject한다 — 언마운트
      // 콜백에서 처리되지 않은 프로미스 거부가 새어나가지 않도록 삼킨다.
      ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
    }
  }, [])

  const toggle = () => {
    // 컨텍스트는 반드시 이 클릭(사용자 제스처) 안에서 만든다 — 밖에서 만들면
    // suspended로 굳어 소리가 나지 않는다.
    if (!audioRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      ctxRef.current = ctx
      audioRef.current = createAmbientAudio(ctx)
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
