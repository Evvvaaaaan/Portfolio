import { useEffect, useRef } from 'react'
import Matter from 'matter-js'
import { useMode } from '../ModeContext.jsx'
import { getLenis } from '../../hooks/useLenis'
import { collectTargets } from './snapshot.js'
import './Destruction.css'

export default function Destruction() {
  const { exitMode } = useMode()
  const hostRef = useRef(null)

  useEffect(() => {
    const targets = collectTargets()
    if (targets.length === 0) {
      exitMode()
      return
    }

    const host = hostRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const lenis = getLenis()
    lenis?.stop()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // 원본을 숨기고 시각적 클론을 물리 바디와 1:1로 만든다
    const items = targets.map(({ el, rect }) => {
      const clone = el.cloneNode(true)
      clone.setAttribute('aria-hidden', 'true')
      Object.assign(clone.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        margin: '0',
        width: `${rect.w}px`,
        height: `${rect.h}px`,
        transform: `translate(${rect.x}px, ${rect.y}px)`,
        willChange: 'transform',
        pointerEvents: 'none',
        overflow: 'hidden',
      })
      host.appendChild(clone)
      el.dataset.labmodePrevVisibility = el.style.visibility || ''
      el.style.visibility = 'hidden'
      const body = Matter.Bodies.rectangle(
        rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h,
        { restitution: 0.4, friction: 0.6 },
      )
      return { el, clone, body, w: rect.w, h: rect.h }
    })

    const engine = Matter.Engine.create()
    engine.gravity.y = reduced ? 0.25 : 1
    const W = window.innerWidth
    const H = window.innerHeight
    const T = 200
    const walls = [
      Matter.Bodies.rectangle(W / 2, H + T / 2, W * 2, T, { isStatic: true }),
      Matter.Bodies.rectangle(-T / 2, H / 2, T, H * 4, { isStatic: true }),
      Matter.Bodies.rectangle(W + T / 2, H / 2, T, H * 4, { isStatic: true }),
    ]
    Matter.Composite.add(engine.world, [...walls, ...items.map((i) => i.body)])

    const mouse = Matter.Mouse.create(host)
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: 0.15 },
    })
    Matter.Composite.add(engine.world, mouseConstraint)

    let raf
    let last = performance.now()
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(now - last, 33)
      last = now
      Matter.Engine.update(engine, dt)
      for (const { clone, body, w, h } of items) {
        clone.style.transform =
          `translate(${body.position.x - w / 2}px, ${body.position.y - h / 2}px) rotate(${body.angle}rad)`
      }
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      Matter.Composite.clear(engine.world, false)
      Matter.Engine.clear(engine)
      for (const { el, clone } of items) {
        clone.remove()
        el.style.visibility = el.dataset.labmodePrevVisibility
        delete el.dataset.labmodePrevVisibility
      }
      document.body.style.overflow = prevOverflow
      lenis?.start()
    }
  }, [exitMode])

  return (
    <div className="destruction-host" ref={hostRef}>
      <button type="button" className="destruction-restore" onClick={exitMode}>
        RESTORE
      </button>
    </div>
  )
}
