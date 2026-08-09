import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLang } from '../../context/LangContext'
import ModeMenu from '../../modes/ModeSelector/ModeMenu.jsx'
import LabTransition from '../LabTransition/LabTransition.jsx'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useAutopilot } from './useAutopilot'
import SoundToggle from './SoundToggle.jsx'
import './Navbar.css'

const LANGS = [
  { code: 'en', label: 'EN', ariaLabel: 'English' },
  { code: 'ko', label: '한', ariaLabel: '한국어' },
  { code: 'ja', label: '日', ariaLabel: '日本語' },
  { code: 'zh', label: '中', ariaLabel: '中文' },
]

function LangSwitcher() {
  const { lang, setLang } = useLang()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const btnRefs = useRef([])
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const pick = (code) => {
    setOpen(false)
    setLang(code)
  }

  const handleKeyDown = (e, idx) => {
    let next = null
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      next = (idx + 1) % LANGS.length
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      next = (idx - 1 + LANGS.length) % LANGS.length
    } else if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (next !== null) {
      setLang(LANGS[next].code)
      btnRefs.current[next]?.focus()
    }
  }

  return (
    <div className="lang-menu" ref={rootRef}>
      <button
        type="button"
        className="nav-icon-btn lang-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Language"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
        <span className="nav-icon-btn-label">{current.label}</span>
      </button>
      {open && (
        <div className="lang-menu-panel" role="menu" aria-label="Select language">
          {LANGS.map((l, idx) => (
            <button
              key={l.code}
              ref={(el) => (btnRefs.current[idx] = el)}
              type="button"
              role="menuitemradio"
              aria-checked={lang === l.code}
              lang={l.code}
              className={`lang-menu-item ${lang === l.code ? 'lang-menu-item--on' : ''}`}
              onClick={() => pick(l.code)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
            >
              {l.ariaLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AutopilotButton() {
  const { t } = useLang()
  const btnRef = useRef(null)
  const { running, start, stop } = useAutopilot(btnRef)
  const label = running ? t.nav.autopilotStop : t.nav.autopilot

  // 라이브 영역은 "내용이 바뀔 때" 읽힌다. 첫 렌더부터 문구가 들어 있으면
  // 아무도 아무것도 하지 않았는데 "투어를 중지했습니다"가 읽힐 수 있으므로
  // 최초 렌더는 비워 두고, 실제 상태 전이에서만 문구를 채운다.
  const firstRenderRef = useRef(true)
  const [announced, setAnnounced] = useState('')
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }
    setAnnounced(running ? t.nav.autopilotOn : t.nav.autopilotOff)
  }, [running, t])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`nav-icon-btn autopilot-btn ${running ? 'autopilot-btn--on' : ''}`}
        aria-pressed={running}
        title={label}
        onClick={() => (running ? stop() : start())}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <polygon points="10 8 16 12 10 16" fill="currentColor" stroke="none" />
        </svg>
        <span className="nav-icon-btn-label">{label}</span>
      </button>
      {/* 투어 시작/중지는 화면이 스스로 움직이는 변화라 시각 외 사용자에게는
          아무 신호가 없다 — 상태를 소리로도 알린다. */}
      <p className="autopilot-status" role="status">{announced}</p>
    </>
  )
}

export default function Navbar() {
  const { t } = useLang()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [labOrigin, setLabOrigin] = useState(null)
  const location = useLocation()
  const navigate = useNavigate()
  const isDesktop = useMediaQuery('(min-width: 769px) and (min-height: 701px)')
  // 769~1023px는 이미 네비바 폭이 가장 빠듯한 구간이다 — 사운드 버튼을 아이콘
  // 전용으로 만들어도 .nav-controls의 gap·padding을 나눠 쓰는 네 번째 컨트롤이
  // 끼어들면 오토파일럿·모드·언어 세 개가 먼저 차지하던 자리를 잠식한다.
  // 실측(.nav-inner scrollWidth - clientWidth, 사운드 버튼 유무 비교):
  //   769px  without 118  with 159 (+41) — 118은 사운드와 무관한 기존 오버플로
  //   900px  without   0  with  28 (+28) — 900px는 원래 0이었는데 이 브랜치가 깨뜨림
  //  1024px  without   0  with   0  (0)  — 이 폭부터는 안전
  //  1280px  without   0  with   0  (0)
  //  1440px  without   0  with   0  (0)
  //  1920px  without   0  with   0  (0)
  // 900px처럼 원래 깨끗했던 폭까지 침범하므로, 이 좁은 구간(1024px 미만)에서는
  // 사운드는 선택적 앰비언스 컨트롤이니 아예 렌더하지 않는다. CSS로만 숨기면
  // 버튼이 DOM과 탭 순서에는 남아 좁은 창의 스크린리더 사용자가 보이지도
  // 않는 컨트롤에 도달하게 되므로, 렌더링 자체를 게이트한다.
  const isSoundWidth = useMediaQuery('(min-width: 1024px)')

  const isLabDetail = /^\/gallery\/.+/.test(location.pathname)

  const handleLabClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    setMenuOpen(false)
    setLabOrigin({ x: e.clientX, y: e.clientY })
  }

  const handleGuestbookClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    setMenuOpen(false)
    navigate('/guestbook')
  }

  const navItems = [
    { label: t.nav.about, href: '#about' },
    { label: t.nav.skills, href: '#skills' },
    { label: t.nav.projects, href: '#projects' },
    { label: t.nav.contact, href: '#contact' },
  ]

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (isLabDetail) return null

  const handleNav = (e, href) => {
    if (location.pathname !== '/') {
      e.preventDefault()
      window.location.href = '/' + href
      return
    }
    e.preventDefault()
    setMenuOpen(false)
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <>
    <header className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="nav-inner container">
        <a className="nav-logo" href="#home" onClick={(e) => handleNav(e, '#home')}>
          <span className="logo-bracket">&lt;</span>
          Evan
          <span className="logo-bracket"> /&gt;</span>
        </a>

        {/* Desktop nav */}
        <nav className="nav-links" aria-label="Main navigation">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="nav-link"
              onClick={(e) => handleNav(e, item.href)}
            >
              {item.label}
            </a>
          ))}
          <a
            href="/gallery"
            className={`nav-link ${location.pathname === '/gallery' ? 'nav-link--active' : ''}`}
            onClick={handleLabClick}
          >
            Lab
          </a>
          <a
            href="/guestbook"
            className={`nav-link ${location.pathname === '/guestbook' ? 'nav-link--active' : ''}`}
            onClick={handleGuestbookClick}
          >
            {t.nav.guestbook}
          </a>
          <a href="#contact" className="nav-cta" onClick={(e) => handleNav(e, '#contact')}>
            {t.nav.hire}
          </a>
        </nav>

        {/* Right controls */}
        <div className="nav-controls">
          {location.pathname === '/' && isDesktop && <AutopilotButton />}
          {location.pathname === '/' && isDesktop && isSoundWidth && <SoundToggle />}
          {location.pathname === '/' && <ModeMenu />}
          <LangSwitcher />
          <span className="nav-divider" aria-hidden="true" />
          <button
            className={`nav-burger ${menuOpen ? 'open' : ''}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
    {/* Mobile menu overlay - rendered outside .navbar: backdrop-filter on
        .navbar.scrolled would otherwise make it a fixed-position containing
        block, trapping this position:fixed overlay inside the navbar's own
        (much shorter) box instead of the viewport. */}
    {menuOpen && (
      <nav
        className="nav-mobile"
        aria-label="Mobile navigation"
      >
        {navItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="nav-link"
            onClick={(e) => handleNav(e, item.href)}
          >
            {item.label}
          </a>
        ))}
        <a
          href="/gallery"
          className="nav-link"
          onClick={handleLabClick}
        >
          Lab
        </a>
        <a href="/guestbook" className="nav-link" onClick={handleGuestbookClick}>
          {t.nav.guestbook}
        </a>
        <a href="#contact" className="nav-cta" onClick={(e) => handleNav(e, '#contact')}>
          {t.nav.hire}
        </a>
      </nav>
    )}
    {labOrigin && (
      <LabTransition
        origin={labOrigin}
        onNavigate={() => navigate('/gallery')}
        onDone={() => setLabOrigin(null)}
      />
    )}
    </>
  )
}
