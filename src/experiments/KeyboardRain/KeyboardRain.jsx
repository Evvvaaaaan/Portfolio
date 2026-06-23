import { useState, useEffect, useCallback, useRef } from 'react'
import './KeyboardRain.css'

const COLORS = ['#ffffff', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#e879f9']

let uid = 0

export default function KeyboardRain() {
  const [chars, setChars] = useState([])
  const composingRef = useRef(false)

  const spawn = useCallback((char) => {
    if (!char) return
    const id = ++uid
    setChars((prev) => [
      ...prev,
      {
        id,
        char,
        x: Math.random() * 84 + 5,
        y: Math.random() * 78 + 5,
        size: Math.floor(Math.random() * 52 + 20),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotate: Math.random() * 30 - 15,
      },
    ])
  }, [])

  const remove = useCallback((id) => {
    setChars((prev) => prev.filter((c) => c.id !== id))
  }, [])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (composingRef.current) return
      if (e.key.length > 1) return
      const char = e.key === ' ' ? '·' : e.key
      spawn(char)
    }
    const onCompStart = () => {
      composingRef.current = true
    }
    const onCompEnd = (e) => {
      composingRef.current = false
      if (e.data) spawn(e.data)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('compositionstart', onCompStart)
    window.addEventListener('compositionend', onCompEnd)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('compositionstart', onCompStart)
      window.removeEventListener('compositionend', onCompEnd)
    }
  }, [spawn])

  return (
    <div className="kr-canvas">
      {chars.length === 0 && <p className="kr-hint">아무 키나 눌러보세요</p>}
      {chars.map(({ id, char, x, y, size, color, rotate }) => (
        <span
          key={id}
          className="kr-char"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            fontSize: `${size}px`,
            color,
            '--rotate': `${rotate}deg`,
          }}
          onAnimationEnd={() => remove(id)}
        >
          {char}
        </span>
      ))}
    </div>
  )
}
