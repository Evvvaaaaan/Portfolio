import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLang } from '../../context/LangContext'
import ModeMenu from '../../modes/ModeSelector/ModeMenu.jsx'
import LabTransition from '../LabTransition/LabTransition.jsx'
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

export default function Navbar() {
  const { t } = useLang()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [labOrigin, setLabOrigin] = useState(null)
  const location = useLocation()
  const navigate = useNavigate()

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

        {/* Mobile menu overlay */}
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
      </div>
    </header>
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
