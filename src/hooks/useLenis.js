import { useEffect } from 'react'
import Lenis from 'lenis'
import { useLocation } from 'react-router-dom'

let activeLenis = null

// Exposes the currently active Lenis instance so other code (e.g. scroll-snap
// logic) can drive scrolling through Lenis instead of fighting it with native
// window.scrollTo, which Lenis's own rAF loop would otherwise override.
export function getLenis() {
  return activeLenis
}

export function useLenis() {
  const location = useLocation()

  useEffect(() => {
    // Disable smooth scrolling on all gallery/lab paths to allow native page state containment
    if (location.pathname.startsWith('/gallery')) {
      return
    }

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    })
    activeLenis = lenis

    let rafId
    function raf(time) {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
      activeLenis = null
    }
  }, [location.pathname])
}
