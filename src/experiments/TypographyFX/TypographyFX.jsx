import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import '../shared/exp.css'
import './TypographyFX.css'

const WORDS = ['INTERACT', 'CREATE', 'EXPLORE', 'DESIGN', 'BUILD']
const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*'

export default function TypographyFX() {
  const containerRef = useRef()
  const wordIdxRef = useRef(0)
  const ivalRef = useRef()
  const busyRef = useRef(false)
  const [effect, setEffect] = useState('scramble')
  const effectRef = useRef('scramble')

  const buildSpans = (word) => {
    const el = containerRef.current
    if (!el) return []
    el.innerHTML = word.split('').map(c => `<span class="typo-char">${c}</span>`).join('')
    return Array.from(el.querySelectorAll('.typo-char'))
  }

  const scramble = (spans, word) => {
    clearInterval(ivalRef.current)
    let step = 0
    const total = word.length * 4
    ivalRef.current = setInterval(() => {
      spans.forEach((el, i) => {
        el.textContent = i < step / 4
          ? word[i]
          : POOL[Math.floor(Math.random() * POOL.length)]
      })
      if (++step > total) {
        clearInterval(ivalRef.current)
        spans.forEach((el, i) => { el.textContent = word[i] })
        busyRef.current = false
      }
    }, 40)
  }

  const trigger = () => {
    if (busyRef.current) return
    busyRef.current = true
    const newIdx = (wordIdxRef.current + 1) % WORDS.length
    const cur = WORDS[wordIdxRef.current]
    const next = WORDS[newIdx]
    wordIdxRef.current = newIdx

    const eff = effectRef.current

    if (eff === 'scramble') {
      const spans = buildSpans(next)
      scramble(spans, next)

    } else if (eff === 'wave') {
      const spans = buildSpans(cur)
      gsap.to(spans, {
        y: -60, opacity: 0, stagger: 0.05, duration: 0.3, ease: 'power2.in',
        onComplete: () => {
          const ns = buildSpans(next)
          gsap.fromTo(ns, { y: 60, opacity: 0 },
            { y: 0, opacity: 1, stagger: 0.06, duration: 0.45, ease: 'back.out(2)',
              onComplete: () => { busyRef.current = false } })
        }
      })

    } else if (eff === 'explode') {
      const spans = buildSpans(cur)
      gsap.to(spans, {
        x: () => (Math.random()-0.5)*700,
        y: () => (Math.random()-0.5)*500,
        rotation: () => (Math.random()-0.5)*720,
        opacity: 0, stagger: 0.03, duration: 0.5, ease: 'power3.in',
        onComplete: () => {
          const ns = buildSpans(next)
          gsap.set(ns, { scale: 0, opacity: 0 })
          gsap.to(ns, {
            scale: 1, opacity: 1, stagger: 0.05, duration: 0.5, ease: 'back.out(2)',
            onComplete: () => { busyRef.current = false }
          })
        }
      })

    } else if (eff === 'glitch') {
      const spans = buildSpans(cur)
      const tl = gsap.timeline()
      for (let i = 0; i < 7; i++) {
        tl.to(spans, { x: () => (Math.random()-0.5)*40, skewX: () => (Math.random()-0.5)*50,
          opacity: Math.random() > 0.25 ? 1 : 0, duration: 0.06, stagger: 0.008 })
      }
      tl.to(spans, {
        x: 0, skewX: 0, opacity: 0, duration: 0.08,
        onComplete: () => {
          const ns = buildSpans(next)
          gsap.set(ns, { opacity: 0 })
          gsap.to(ns, { opacity: 1, stagger: 0.04, duration: 0.04,
            onComplete: () => { busyRef.current = false } })
        }
      })
    }
  }

  useEffect(() => {
    const spans = buildSpans(WORDS[0])
    scramble(spans, WORDS[0])
    return () => clearInterval(ivalRef.current)
  }, [])

  return (
    <div className="exp-wrap typo-root" onClick={trigger}>
      <span className="exp-hint">클릭해서 다음 단어</span>
      <div className="typo-display" ref={containerRef} />
      <div className="exp-controls" onClick={e => e.stopPropagation()}>
        {['scramble', 'wave', 'explode', 'glitch'].map(e => (
          <button key={e}
            className={`exp-btn${effect === e ? ' active' : ''}`}
            onClick={() => { setEffect(e); effectRef.current = e }}>
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}
