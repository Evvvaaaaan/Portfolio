import { useEffect, useRef, useState } from 'react'
import './index.css'
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { LangProvider, useLang } from './context/LangContext'
import { useLenis, getLenis } from './hooks/useLenis'
import { computeDockStyle } from './components/dockLayout.js'
import Navbar from './components/Navbar/Navbar'
import SpaceBackground from './components/SpaceBackground/SpaceBackground'
import HardwareAccelNotice from './components/HardwareAccelNotice/HardwareAccelNotice'
import Minimap from './components/Minimap/Minimap'
import ProjectSatellites from './components/ProjectSatellites/ProjectSatellites'
import LabTransition from './components/LabTransition/LabTransition.jsx'
import { useMediaQuery } from './hooks/useMediaQuery'
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
import Guestbook from './pages/Guestbook/Guestbook'
import { ModeProvider } from './modes/ModeContext.jsx'
import ModeLayer from './modes/ModeLayer.jsx'

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

function MainPage() {
  const isDesktop = useMediaQuery('(min-width: 769px) and (min-height: 701px)')
  const containerRef = useRef(null)
  const slidesRef = useRef([])

  // Links like ProjectPage's "Back to Projects" navigate to `/#section` via
  // react-router's <Link>, which only does a pushState - unlike a real
  // browser navigation, it never scrolls to the hash target. Consume the
  // hash once on mount and clear it so it doesn't re-fire on later remounts.
  useEffect(() => {
    if (!window.location.hash) return
    const el = document.querySelector(window.location.hash)
    if (el) {
      // Must be instant, not smooth: this runs before the Lenis instance for
      // this route is (re)created (see useLenis), and Lenis snapshots
      // whatever window.scrollY is at construction time as its own target.
      // A smooth/animated scroll here races that snapshot and usually loses.
      el.scrollIntoView({ behavior: 'auto', block: 'start' })
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])

  useEffect(() => {
    if (!isDesktop) return

    let scrollTimeout
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const handleScroll = () => {
      const progress = window.scrollY / window.innerHeight
      const slides = slidesRef.current

      slides.forEach((slide, idx) => {
        if (!slide) return
        const dock = computeDockStyle(progress, idx, reducedMotion)
        slide.style.display = dock.visible ? 'flex' : 'none'
        if (dock.visible) {
          slide.style.transform = `translateY(${dock.translateY}px)`
          slide.style.opacity = dock.opacity
          slide.style.filter = 'none'
          slide.style.pointerEvents = dock.pointerEvents
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
        {sections.map((sec, idx) => {
          // About/Skills/Contact/Projects는 우측 도킹(행성이 화면 왼쪽에
          // 걸리므로 — rail.js의 TARGET_SHIFT가 이 네 정거장 모두에 적용된다).
          // Projects도 같은 카메라 프레이밍을 쓰면서 예전엔 전체 폭 패널을
          // 유지해 위성 버튼이 갤러리 카드에 완전히 덮였다 — 다른 도킹
          // 정거장과 동일하게 취급해야 버튼이 실제로 눌린다.
          // Hero/Footer는 카메라가 정면을 보므로 중앙 유지.
          // sections 배열 순서가 바뀌어도 도킹 대상이 어긋나지 않도록 id로 판정.
          const docked = ['about', 'skills', 'contact', 'projects'].includes(sec.id)
          return (
            <div
              key={sec.id}
              ref={(el) => (slidesRef.current[idx] = el)}
              className={docked ? 'scroll-slide scroll-slide--dock' : 'scroll-slide'}
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
                // opacity/filter를 will-change에 넣으면 이 요소가 backdrop-filter의
                // 루트가 되어, 도킹 패널의 blur가 캔버스가 아닌 빈 루트를 샘플링하게
                // 된다 — transform만 남긴다 (filter는 스크롤 핸들러에서 항상 'none').
                willChange: 'transform',
                pointerEvents: 'none',
              }}
            >
              <div className="slide-content" style={{ width: '100%', pointerEvents: 'auto' }}>
                {sec.component}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AppContent() {
  const isDesktop = useMediaQuery('(min-width: 769px) and (min-height: 701px)')
  const location = useLocation()
  const navigate = useNavigate()
  useLenis()

  // 위성 클릭 → 전환 상태를 여기(AppContent)에 둔다. ProjectSatellites는
  // isMainPage에 따라 통째로 마운트/언마운트되는데, LabTransition을 그 안에
  // 두면 onNavigate가 라우트를 바꾸는 커밋에서 isMainPage가 함께 false로
  // 바뀌어 전환 오버레이(화이트 플래시 포함)가 재생 중에 통째로 뜯겨나간다.
  // Navbar처럼 라우트와 무관하게 항상 마운트된 컴포넌트가 소유해야 450ms
  // 해제 애니메이션이 끝까지 재생된다.
  const [pendingProjectSlug, setPendingProjectSlug] = useState(null)

  // 전환이 진행 중일 때 라우트가 바뀌면, 그게 "이 전환 자신이 만든 이동"인지
  // "사용자가 다른 곳으로 끼어든 이동"인지 구분해야 한다. 위성을 클릭한 시점의
  // pathname은 항상 '/'(ProjectSatellites는 메인 페이지에서만 뜬다)이고,
  // LabTransition은 그로부터 ~900ms 뒤 자기 목적지(`/projects/${pendingProjectSlug}`)
  // 로만 navigate한다 — 그래서 '/'(아직 전환의 onNavigate가 발화하기 전)와
  // 그 목적지 자체는 "예상된" pathname이다. 그 둘이 아닌 다른 경로로
  // 바뀌었다면(예: 대기 중에 네비바의 Guestbook을 클릭) 사용자가 직접 다른
  // 곳으로 이동한 것이므로, 지연 발화를 기다리던 전환을 즉시 취소한다.
  // pendingProjectSlug를 지워 LabTransition을 언마운트하면 그 컴포넌트의
  // useEffect 클린업이 예약해 둔 타이머(예정된 navigate 포함)를 함께
  // 정리하므로, 나중에 그 타이머가 발화해 사용자의 이동을 덮어쓰는 일이 없다.
  //
  // useEffect가 아니라 렌더 바디에서 직접 처리한다 — "prop이 바뀔 때 state를
  // 조정"하는 상황은 React가 공식적으로 권장하는 렌더 중 setState 패턴이고
  // (이펙트를 쓰면 커밋이 한 번 더 생기고, eslint의
  // react-hooks/set-state-in-effect도 이펙트 안 setState를 지적한다),
  // prevPathname과 비교해 실제로 pathname이 바뀐 렌더에서만 한 번 실행되므로
  // 무한 루프가 없다.
  const [prevPathname, setPrevPathname] = useState(location.pathname)
  if (location.pathname !== prevPathname) {
    setPrevPathname(location.pathname)
    const target = `/projects/${pendingProjectSlug}`
    if (pendingProjectSlug && location.pathname !== '/' && location.pathname !== target) {
      setPendingProjectSlug(null)
    }
  }

  useEffect(() => {
    const lockScroll = location.pathname === '/gallery' || location.pathname === '/guestbook'
    if (lockScroll) {
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
  // 방명록도 실험 데모처럼 고정 풀뷰포트 캔버스라 푸터를 겹치지 않게 숨긴다
  const isGuestbook = location.pathname === '/guestbook'
  const showGlobalFooter = (!isMainPage || !isDesktop) && !isLabPage && !isExperimentDemo && !isGuestbook

  return (
    <LangProvider>
      <ModeProvider>
        <SpaceBackground
          warpEnabled={isMainPage && isDesktop}
          stageEnabled={isMainPage && isDesktop}
        />
        <Navbar />
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/gallery/:id" element={<ExperimentPage />} />
          <Route path="/gallery/:id/code" element={<CodePage />} />
          <Route path="/projects/:slug" element={<ProjectPage />} />
          <Route path="/guestbook" element={<Guestbook />} />
        </Routes>
        {isMainPage && isDesktop && <Minimap />}
        {isMainPage && isDesktop && (
          <ProjectSatellites
            pendingSlug={pendingProjectSlug}
            onSelect={setPendingProjectSlug}
          />
        )}
        {isMainPage && <ModeLayer />}
        {showGlobalFooter && <Footer />}
        <HardwareAccelNotice />
        {pendingProjectSlug && (
          // origin은 LabTransition이 시각적으로 쓰지 않는다 — Navbar와의
          // 계약 유지를 위해 시그니처에만 남아 있어 null로 넘겨도 안전하다.
          <LabTransition
            origin={null}
            onNavigate={() => navigate(`/projects/${pendingProjectSlug}`)}
            onDone={() => setPendingProjectSlug(null)}
          />
        )}
      </ModeProvider>
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
