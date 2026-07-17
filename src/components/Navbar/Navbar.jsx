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
  const btnRefs = useRef([])

  const handleKeyDown = (e, idx) => {
    let next = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      next = (idx + 1) % LANGS.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      next = (idx - 1 + LANGS.length) % LANGS.length
    }
    if (next !== null) {
      setLang(LANGS[next].code)
      btnRefs.current[next]?.focus()
    }
  }

  return (
    <div role="radiogroup" aria-label="Select language" className="lang-switcher">
      {LANGS.map((l, idx) => (
        <button
          key={l.code}
          ref={(el) => (btnRefs.current[idx] = el)}
          role="radio"
          aria-checked={lang === l.code}
          aria-label={l.ariaLabel}
          lang={l.code}
          className={`lang-btn ${lang === l.code ? 'active' : ''}`}
          tabIndex={lang === l.code ? 0 : -1}
          onClick={() => setLang(l.code)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
        >
          {l.label}
        </button>
      ))}
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
          {location.pathname === '/' && <ModeMenu />}
          <a href="#contact" className="nav-cta" onClick={(e) => handleNav(e, '#contact')}>
            {t.nav.hire}
          </a>
        </nav>

        {/* Right controls */}
        <div className="nav-controls">
          <LangSwitcher />
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
