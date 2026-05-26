import { useEffect, useRef } from 'react'

export function useScrollReveal(threshold = 0.15) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.querySelectorAll('.fade-up').forEach((child) => {
              child.classList.add('visible')
            })
            // Also apply to the container itself
            entry.target.classList.add('visible')
          }
        })
      },
      { threshold }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return ref
}
