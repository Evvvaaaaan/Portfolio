import { useEffect, useRef } from 'react'
import './Cursor.css'

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
  const pos = useRef({ x: -100, y: -100 })
  const ringPos = useRef({ x: -100, y: -100 })
  const rafRef = useRef(null)
  const isHovering = useRef(false)

  useEffect(() => {
    const dot = dotRef.current
    const ring = ringRef.current
    const hoverBound = new WeakSet()
    let magneticTargets = []
    let activeMagnetic = null

    const onMove = (e) => {
      pos.current = { x: e.clientX, y: e.clientY }
      dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
      updateMagnetic(e.clientX, e.clientY)
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

      if (activeMagnetic && activeMagnetic !== closest?.el) resetMagnetic(activeMagnetic)

      if (!closest) { activeMagnetic = null; return }

      const pull = Math.pow(1 - closest.distance / MAGNETIC_RADIUS, 1.35) * MAGNETIC_PULL
      closest.el.style.setProperty('--magnetic-x', `${closest.dx * pull}px`)
      closest.el.style.setProperty('--magnetic-y', `${closest.dy * pull}px`)
      closest.el.classList.add('magnetic-active')
      activeMagnetic = closest.el
    }

    const animate = () => {
      ringPos.current.x += (pos.current.x - ringPos.current.x) * 0.12
      ringPos.current.y += (pos.current.y - ringPos.current.y) * 0.12
      ring.style.transform = `translate(${ringPos.current.x}px, ${ringPos.current.y}px)`
      rafRef.current = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', onMove)
    rafRef.current = requestAnimationFrame(animate)

    const addHoverListeners = () => {
      document.querySelectorAll('a, button, [data-cursor], input, textarea, select, label').forEach((el) => {
        if (hoverBound.has(el)) return
        hoverBound.add(el)
        el.addEventListener('mouseenter', onEnterLink)
        el.addEventListener('mouseleave', onLeaveLink)
      })
    }

    const refreshMagneticTargets = () => {
      magneticTargets.forEach((el) => { if (!document.body.contains(el)) resetMagnetic(el) })
      magneticTargets = Array.from(document.querySelectorAll(MAGNETIC_SELECTOR))
      magneticTargets.forEach((el) => el.classList.add('magnetic-target'))
    }

    addHoverListeners()
    refreshMagneticTargets()

    const observer = new MutationObserver(() => { addHoverListeners(); refreshMagneticTargets() })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', () => {})
      cancelAnimationFrame(rafRef.current)
      observer.disconnect()
      magneticTargets.forEach(resetMagnetic)
    }
  }, [])

  return (
    <>
      <div ref={dotRef} className="cursor-dot" />
      <div ref={ringRef} className="cursor-ring" />
    </>
  )
}
