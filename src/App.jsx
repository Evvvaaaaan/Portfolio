import { useState, useEffect, useRef } from 'react'
import './index.css'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { LangProvider, useLang } from './context/LangContext'
import { useLenis, getLenis } from './hooks/useLenis'
import Cursor from './components/Cursor/Cursor'
import Navbar from './components/Navbar/Navbar'
import SpaceBackground from './components/SpaceBackground/SpaceBackground'
import Hero from './sections/Hero/Hero'
import About from './sections/About/About'
import Projects from './sections/Projects/Projects'
import Skills from './sections/Skills/Skills'
import Contact from './sections/Contact/Contact'
import LoadingShowcase from './components/LoadingShowcase/LoadingShowcase'
import Gallery from './pages/Gallery/Gallery'
import ExperimentPage from './pages/ExperimentPage/ExperimentPage'
import CodePage from './pages/CodePage/CodePage'
import ProjectPage from './pages/ProjectPage/ProjectPage'

const isShowcase = new URLSearchParams(window.location.search).get('showcase') === 'loading'

function Footer({ slide = false }) {
  const { t } = useLang()
  return (
    <footer className={slide ? 'footer footer--slide' : 'footer'}>
      <div className="footer-inner">
        <dl className="footer-rows">
          <div className="footer-row">
            <dt>Crafted by</dt>
            <dd><a href="mailto:vmfhrmfoald36@gmail.com" className="footer-link">Evan</a></dd>
          </div>
          <div className="footer-row">
            <dt>Built with</dt>
            <dd>
              <ul>
                <li>React</li>
                <li>Vite</li>
                <li>Three.js</li>
              </ul>
            </dd>
          </div>
          <div className="footer-row">
            <dt>Deployed on</dt>
            <dd>Vercel</dd>
          </div>
          <div className="footer-row">
            <dt>Source code</dt>
            <dd><a href="https://github.com/Evvvaaaaan/Portfolio" target="_blank" rel="noreferrer" className="footer-link">GitHub</a></dd>
          </div>
        </dl>
        <div className="footer-social">
          <a href="https://github.com/Evvvaaaaan" target="_blank" rel="noreferrer" aria-label="GitHub">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" fill="currentColor" /></svg>
          </a>
          <span className="footer-divider" />
          <a href="https://www.linkedin.com/in/evvvaaaaan/" target="_blank" rel="noreferrer" aria-label="LinkedIn">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.418 1H2.584C1.634 1 1 1.628 1 2.572v18.855C1 22.373 1.792 23 2.583 23h18.834c.95 0 1.583-.628 1.583-1.572V2.573C23.001 1.627 22.367 1 21.418 1ZM7.49 19.7H4.166V9.172h3.323L7.49 19.7ZM5.906 7.757c-1.108 0-1.898-.785-1.898-1.885S4.8 3.985 5.906 3.985c1.11 0 1.9.787 1.9 1.887s-.95 1.885-1.9 1.885ZM19.836 19.7h-3.324v-5.028c0-1.257 0-2.83-1.742-2.83-1.74 0-1.9 1.258-1.9 2.673V19.7H9.548V9.172h3.166v1.413c.633-1.1 1.9-1.728 3.165-1.728 3.325 0 3.957 2.2 3.957 5.028V19.7Z" fill="currentColor" /></svg>
          </a>
          <span className="footer-divider" />
          <a href="mailto:vmfhrmfoald36@gmail.com" aria-label="Email">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5.5A2.5 2.5 0 0 1 4.5 3h15A2.5 2.5 0 0 1 22 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 18.5v-13Zm2.2.5 7.8 6.2L19.8 6H4.2ZM20 7.9l-7.4 5.88a1 1 0 0 1-1.25 0L4 7.9v10.6a.5.5 0 0 0 .5.5h15a.5.5 0 0 0 .5-.5V7.9Z" fill="currentColor" /></svg>
          </a>
        </div>
        <p className="footer-copy">© {new Date().getFullYear()} Evan. {t.footer.built}.</p>
      </div>
    </footer>
  )
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const listener = () => setMatches(media.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [query])

  return matches
}

function MainPage() {
  const isDesktop = useMediaQuery('(min-width: 769px) and (min-height: 701px)')
  const containerRef = useRef(null)
  const slidesRef = useRef([])

  useEffect(() => {
    if (!isDesktop) return

    let scrollTimeout

    const handleScroll = () => {
      const progress = window.scrollY / window.innerHeight
      const slides = slidesRef.current

      slides.forEach((slide, idx) => {
        if (!slide) return
        const offset = progress - idx
        let scale = 1
        let opacity = 1
        let blur = 0
        let pointerEvents = 'none'

        if (offset > 0) {
          // Scrolled past: zoom out (scale up) and fade
          scale = 1 + offset * 1.6
          opacity = Math.max(0, 1 - offset * 2.2)
          blur = offset * 15
        } else if (offset < 0) {
          // Coming in: zoom in from center (scale up from 0.25 to 1.0)
          scale = 0.25 + (1 + offset) * 0.75
          opacity = Math.max(0, 1 + offset)
          blur = Math.abs(offset) * 15
        } else {
          // Active
          scale = 1
          opacity = 1
          blur = 0
          pointerEvents = 'auto'
        }

        const isVisible = Math.abs(offset) < 1.15
        slide.style.display = isVisible ? 'flex' : 'none'
        if (isVisible) {
          slide.style.transform = `scale(${scale})`
          slide.style.opacity = opacity
          slide.style.filter = blur > 0.1 ? `blur(${blur}px)` : 'none'
          slide.style.pointerEvents = pointerEvents
        }
      })

      // Snapping logic: once the user stops scrolling, always settle on the
      // nearest section so it's shown sharp/fixed instead of staying blurred.
      // Must go through the Lenis instance (not native window.scrollTo) -
      // Lenis tracks its own target/animated scroll each rAF and will fight
      // (and undo) a native scrollTo call.
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        const currentProgress = window.scrollY / window.innerHeight
        const targetIdx = Math.round(currentProgress)
        const targetTop = targetIdx * window.innerHeight

        if (Math.abs(window.scrollY - targetTop) > 1) {
          const lenis = getLenis()
          if (lenis) {
            lenis.scrollTo(targetTop, { duration: 0.4 })
          } else {
            window.scrollTo({ top: targetTop, behavior: 'smooth' })
          }
        }
      }, 100)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll() // Initial run

    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimeout)
    }
  }, [isDesktop])

  const sections = [
    { id: 'home', component: <Hero /> },
    { id: 'about', component: <About /> },
    { id: 'skills', component: <Skills /> },
    { id: 'projects', component: <Projects /> },
    { id: 'contact', component: <Contact /> },
    { id: 'footer', component: <Footer slide /> },
  ]

  if (!isDesktop) {
    return (
      <main>
        <Hero />
        <About />
        <Skills />
        <Projects />
        <Contact />
      </main>
    )
  }

  return (
    <div
      ref={containerRef}
      className="scroll-wrapper"
      style={{ position: 'relative', height: `${sections.length * 100}vh` }}
    >
      {/* Invisible placeholders in normal flow for scrolling height and anchors */}
      {sections.map((sec) => (
        <div
          key={sec.id}
          id={sec.id}
          style={{ height: '100vh', pointerEvents: 'none' }}
        />
      ))}

      {/* Fixed viewport holding the animated slides */}
      <div
        className="scroll-viewport"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100vh',
          overflow: 'hidden',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        {sections.map((sec, idx) => (
          <div
            key={sec.id}
            ref={(el) => (slidesRef.current[idx] = el)}
            className="scroll-slide"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transformStyle: 'preserve-3d',
              willChange: 'transform, opacity, filter',
              pointerEvents: 'none',
            }}
          >
            <div style={{ width: '100%', pointerEvents: 'auto' }}>
              {sec.component}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AppContent() {
  const isDesktop = useMediaQuery('(min-width: 769px) and (min-height: 701px)')
  const location = useLocation()
  useLenis()

  useEffect(() => {
    const isGallery = location.pathname === '/gallery'
    if (isGallery) {
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    }
  }, [location.pathname])

  if (isShowcase) return <LoadingShowcase />

  const isMainPage = location.pathname === '/'
  const isLabPage = location.pathname === '/gallery'
  // Experiment demos render a fixed, full-viewport canvas (immersive by
  // design) - an in-flow footer would just sit on top of/cover the canvas.
  const isExperimentDemo = /^\/gallery\/[^/]+$/.test(location.pathname)
  const showGlobalFooter = (!isMainPage || !isDesktop) && !isLabPage && !isExperimentDemo

  return (
    <LangProvider>
      <SpaceBackground />
      <Cursor />
      <Navbar />
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/gallery/:id" element={<ExperimentPage />} />
        <Route path="/gallery/:id/code" element={<CodePage />} />
        <Route path="/projects/:slug" element={<ProjectPage />} />
      </Routes>
      {showGlobalFooter && <Footer />}
    </LangProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
