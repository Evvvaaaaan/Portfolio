import { useEffect, useRef } from 'react'
import './Cursor.css'

const TRAIL_DURATION = 3000 // ms
const TRAIL_MODES = ['none', 'line', 'bubble', 'rocket']
const MODE_LABELS = {
  none: 'No cursor trail',
  line: 'Line cursor trail',
  bubble: 'Bubble cursor trail',
  rocket: 'Rocket cursor trail',
}
const MAGNETIC_SELECTOR = [
  '.btn',
  '.nav-cta',
  '.lang-btn',
  '.social-link',
  '.scroll-indicator',
  '.gallery-arrow',
  '.gallery-dot',
  '.contact-link',
  '.rm-close',
  '.rm-close-btn',
].join(', ')
const MAGNETIC_RADIUS = 96
const MAGNETIC_PULL = 0.32

export default function Cursor() {
  const dotRef = useRef(null)
  const ringRef = useRef(null)
  const canvasRef = useRef(null)
  const pos = useRef({ x: -100, y: -100 })
  const ringPos = useRef({ x: -100, y: -100 })
  const rafRef = useRef(null)
  const isHovering = useRef(false)
  const trail = useRef([]) // [{ x, y, t }]
  const trailMode = useRef('line')
  const liveRef = useRef(null)

  useEffect(() => {
    const dot = dotRef.current
    const ring = ringRef.current
    const canvas = canvasRef.current
    const live = liveRef.current
    const ctx = canvas.getContext('2d')
    const hoverBound = new WeakSet()
    let magneticTargets = []
    let activeMagnetic = null

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const onMove = (e) => {
      pos.current = { x: e.clientX, y: e.clientY }
      dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
      trail.current.push({ x: e.clientX, y: e.clientY, t: performance.now(), wobble: Math.random() })
      updateMagnetic(e.clientX, e.clientY)
    }

    const onDoubleClick = () => {
      const idx = TRAIL_MODES.indexOf(trailMode.current)
      trailMode.current = TRAIL_MODES[(idx + 1) % TRAIL_MODES.length]
      trail.current = []
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (live) live.textContent = MODE_LABELS[trailMode.current]
    }

    const onEnterLink = () => {
      isHovering.current = true
      ring.classList.add('hover')
      dot.classList.add('hover')
    }

    const onLeaveLink = () => {
      isHovering.current = false
      ring.classList.remove('hover')
      dot.classList.remove('hover')
    }

    const resetMagnetic = (el) => {
      if (!el) return
      el.style.setProperty('--magnetic-x', '0px')
      el.style.setProperty('--magnetic-y', '0px')
      el.classList.remove('magnetic-active')
    }

    const updateMagnetic = (x, y) => {
      let closest = null
      let closestDistance = MAGNETIC_RADIUS

      for (const el of magneticTargets) {
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue
        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const distance = Math.hypot(x - cx, y - cy)

        if (distance < closestDistance) {
          closest = { el, dx: x - cx, dy: y - cy, distance }
          closestDistance = distance
        }
      }

      if (activeMagnetic && activeMagnetic !== closest?.el) {
        resetMagnetic(activeMagnetic)
      }

      if (!closest) {
        activeMagnetic = null
        return
      }

      const pull = Math.pow(1 - closest.distance / MAGNETIC_RADIUS, 1.35) * MAGNETIC_PULL
      closest.el.style.setProperty('--magnetic-x', `${closest.dx * pull}px`)
      closest.el.style.setProperty('--magnetic-y', `${closest.dy * pull}px`)
      closest.el.classList.add('magnetic-active')
      activeMagnetic = closest.el
    }

    const prepareTrail = (now) => {
      const cutoff = now - TRAIL_DURATION
      // Drop expired points, keep one just before the cutoff for smooth fade-out
      const raw = trail.current.filter((p) => p.t >= cutoff)
      trail.current = raw

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      return { raw, cutoff }
    }

    const drawLineTrail = (raw, cutoff) => {
      for (let i = 1; i < raw.length; i++) {
        const prev = raw[i - 1]
        const curr = raw[i]

        // age 0 = newest, age 1 = oldest
        const ageStart = 1 - (prev.t - cutoff) / TRAIL_DURATION
        const ageEnd   = 1 - (curr.t - cutoff) / TRAIL_DURATION

        const alphaStart = Math.pow(1 - ageStart, 1.5) * 0.85
        const alphaEnd   = Math.pow(1 - ageEnd,   1.5) * 0.85
        const widthStart = (1 - ageStart) * 2.5 + 0.3
        const widthEnd   = (1 - ageEnd)   * 2.5 + 0.3

        const grad = ctx.createLinearGradient(prev.x, prev.y, curr.x, curr.y)
        grad.addColorStop(0, `rgba(255, 255, 255, ${alphaStart})`)
        grad.addColorStop(1, `rgba(255, 255, 255, ${alphaEnd})`)

        ctx.beginPath()
        ctx.moveTo(prev.x, prev.y)
        ctx.lineTo(curr.x, curr.y)
        ctx.lineWidth = (widthStart + widthEnd) / 2
        ctx.lineCap = 'round'
        ctx.strokeStyle = grad
        ctx.stroke()
      }

      const head = raw[raw.length - 1]
      ctx.beginPath()
      ctx.arc(head.x, head.y, 2.2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.fill()
    }

    const drawBubbleTrail = (raw, cutoff) => {
      for (let i = raw.length - 1; i >= 0; i -= 4) {
        const point = raw[i]
        const age = 1 - (point.t - cutoff) / TRAIL_DURATION
        const life = 1 - age
        const radius = 2 + life * 8
        const lift = age * 9
        const drift = (point.wobble - 0.5) * age * 12
        const alpha = Math.pow(life, 1.8) * 0.34

        ctx.beginPath()
        ctx.arc(point.x + drift, point.y - lift, radius, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`
        ctx.lineWidth = 1
        ctx.stroke()

        if (life > 0.72) {
          ctx.beginPath()
          ctx.arc(point.x + drift - radius * 0.25, point.y - lift - radius * 0.25, radius * 0.18, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.55})`
          ctx.fill()
        }
      }
    }

    const drawRocketTrail = (raw, cutoff) => {
      const flame = raw.slice(-34)

      for (let i = 1; i < flame.length; i++) {
        const prev = flame[i - 1]
        const curr = flame[i]
        const dx = curr.x - prev.x
        const dy = curr.y - prev.y
        const len = Math.hypot(dx, dy) || 1
        const nx = -dy / len
        const ny = dx / len
        const tail = 1 - i / flame.length
        const flicker = 0.72 + curr.wobble * 0.56
        const spread = tail * 16 * flicker
        const width = tail * 12 + 1.2
        const alpha = Math.pow(tail, 1.5) * 0.36

        const leftX = curr.x + nx * spread
        const leftY = curr.y + ny * spread
        const rightX = curr.x - nx * spread * 0.7
        const rightY = curr.y - ny * spread * 0.7

        const grad = ctx.createLinearGradient(prev.x, prev.y, curr.x, curr.y)
        grad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.9})`)
        grad.addColorStop(1, `rgba(255, 255, 255, ${alpha * 0.08})`)

        ctx.beginPath()
        ctx.moveTo(prev.x, prev.y)
        ctx.quadraticCurveTo(leftX, leftY, curr.x, curr.y)
        ctx.quadraticCurveTo(rightX, rightY, prev.x, prev.y)
        ctx.closePath()
        ctx.fillStyle = grad
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(prev.x, prev.y)
        ctx.lineTo(curr.x, curr.y)
        ctx.lineWidth = width
        ctx.lineCap = 'round'
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.45})`
        ctx.stroke()

        if (i % 4 === 0 && tail > 0.28) {
          const spark = 0.8 + tail * 2.2
          const offset = (curr.wobble - 0.5) * spread * 1.8
          ctx.beginPath()
          ctx.arc(curr.x + nx * offset, curr.y + ny * offset, spark, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 1.4})`
          ctx.fill()
        }
      }

      const head = flame[flame.length - 1]
      if (head) {
        ctx.beginPath()
        ctx.arc(head.x, head.y, 3.2, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
        ctx.fill()
      }
    }

    const drawTrail = (now) => {
      const { raw, cutoff } = prepareTrail(now)
      if (trailMode.current === 'none' || raw.length < 2) return
      if (trailMode.current === 'bubble') drawBubbleTrail(raw, cutoff)
      else if (trailMode.current === 'rocket') drawRocketTrail(raw, cutoff)
      else drawLineTrail(raw, cutoff)
    }

    const animate = () => {
      const now = performance.now()

      const lerpFactor = 0.12
      ringPos.current.x += (pos.current.x - ringPos.current.x) * lerpFactor
      ringPos.current.y += (pos.current.y - ringPos.current.y) * lerpFactor
      ring.style.transform = `translate(${ringPos.current.x}px, ${ringPos.current.y}px)`

      drawTrail(now)

      rafRef.current = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('dblclick', onDoubleClick)
    rafRef.current = requestAnimationFrame(animate)

    const addHoverListeners = () => {
      const interactives = document.querySelectorAll(
        'a, button, [data-cursor], input, textarea, select, label'
      )
      interactives.forEach((el) => {
        if (hoverBound.has(el)) return
        hoverBound.add(el)
        el.addEventListener('mouseenter', onEnterLink)
        el.addEventListener('mouseleave', onLeaveLink)
      })
    }

    const refreshMagneticTargets = () => {
      magneticTargets.forEach((el) => {
        if (!document.body.contains(el)) resetMagnetic(el)
      })
      magneticTargets = Array.from(document.querySelectorAll(MAGNETIC_SELECTOR))
      magneticTargets.forEach((el) => el.classList.add('magnetic-target'))
    }

    addHoverListeners()
    refreshMagneticTargets()

    const observer = new MutationObserver(() => {
      addHoverListeners()
      refreshMagneticTargets()
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('dblclick', onDoubleClick)
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafRef.current)
      observer.disconnect()
      magneticTargets.forEach(resetMagnetic)
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} className="cursor-trail" />
      <span ref={liveRef} className="cursor-mode-live" aria-live="polite" />
      <div ref={dotRef} className="cursor-dot" />
      <div ref={ringRef} className="cursor-ring" />
    </>
  )
}
