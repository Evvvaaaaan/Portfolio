import { useEffect, useRef, useState } from 'react'
import Matter from 'matter-js'
import '../shared/exp.css'

const { Engine, Render, Runner, Bodies, Composite, Mouse, MouseConstraint, Body } = Matter

export default function PhysicsSandbox() {
  const wrapRef = useRef()
  const canvasRef = useRef()
  const engineRef = useRef()
  const [shape, setShape] = useState('circle')
  const shapeRef = useRef('circle')
  useEffect(() => { shapeRef.current = shape }, [shape])

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const wrap = wrapRef.current
      const canvas = canvasRef.current
      const W = wrap.offsetWidth
      const H = wrap.offsetHeight

      const engine = Engine.create()
      engineRef.current = engine

      const render = Render.create({
        canvas,
        engine,
        options: {
          width: W, height: H,
          background: '#0a0a0f',
          wireframes: false,
          pixelRatio: Math.min(window.devicePixelRatio, 2),
        }
      })

      const wall = { isStatic: true, render: { fillStyle: '#12121f' } }
      Composite.add(engine.world, [
        Bodies.rectangle(W/2, H+25, W*2, 50, wall),
        Bodies.rectangle(-25, H/2, 50, H*2, wall),
        Bodies.rectangle(W+25, H/2, 50, H*2, wall),
      ])

      // Spawn initial bodies
      for (let i = 0; i < 10; i++) {
        const x = W*0.15 + Math.random()*W*0.7
        const y = Math.random()*H*0.5
        const hue = Math.random()*360
        const body = Math.random() > 0.5
          ? Bodies.circle(x, y, 15+Math.random()*18, { render: { fillStyle: `hsl(${hue},70%,55%)` } })
          : Bodies.rectangle(x, y, 30+Math.random()*35, 25+Math.random()*30, { render: { fillStyle: `hsl(${hue},70%,55%)` } })
        Composite.add(engine.world, body)
      }

      const mouse = Mouse.create(canvas)
      const mc = MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.2, render: { visible: false } } })
      Composite.add(engine.world, mc)
      render.mouse = mouse

      const runner = Runner.create()
      Runner.run(runner, engine)
      Render.run(render)

      // Click → add body (only if not dragging)
      let downAt = null
      const onDown = e => { downAt = { x: e.clientX, y: e.clientY } }
      const onUp = e => {
        if (!downAt) return
        const dx = e.clientX - downAt.x, dy = e.clientY - downAt.y
        if (Math.sqrt(dx*dx+dy*dy) < 6) {
          const rect = canvas.getBoundingClientRect()
          const x = (e.clientX - rect.left) / (rect.width / W)
          const y = (e.clientY - rect.top) / (rect.height / H)
          const hue = Math.random()*360
          const color = `hsl(${hue},70%,55%)`
          const s = shapeRef.current
          let body
          if (s === 'circle') body = Bodies.circle(x, y, 15+Math.random()*20, { render: { fillStyle: color } })
          else if (s === 'box') { const sz = 30+Math.random()*30; body = Bodies.rectangle(x, y, sz, sz, { render: { fillStyle: color } }) }
          else body = Bodies.polygon(x, y, 5+Math.floor(Math.random()*4), 20+Math.random()*20, { render: { fillStyle: color } })
          Composite.add(engine.world, body)
        }
        downAt = null
      }

      canvas.addEventListener('mousedown', onDown)
      canvas.addEventListener('mouseup', onUp)

      return () => {
        canvas.removeEventListener('mousedown', onDown)
        canvas.removeEventListener('mouseup', onUp)
        Render.stop(render)
        Runner.stop(runner)
        Engine.clear(engine)
      }
    })

    return () => cancelAnimationFrame(raf)
  }, [])

  const clear = () => {
    const engine = engineRef.current
    if (!engine) return
    Composite.allBodies(engine.world).filter(b => !b.isStatic).forEach(b => Composite.remove(engine.world, b))
  }

  return (
    <div className="exp-wrap" ref={wrapRef}>
      <span className="exp-hint">클릭 → 도형 추가 · 드래그 → 이동</span>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      <div className="exp-controls">
        {['circle','box','polygon'].map(s => (
          <button key={s} className={`exp-btn${shape===s?' active':''}`} onClick={() => setShape(s)}>{s}</button>
        ))}
        <button className="exp-btn" onClick={clear}>초기화</button>
      </div>
    </div>
  )
}
