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

function AutopilotButton({ onStart }) {
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
        onClick={() => {
          if (running) {
            stop()
          } else {
            start()
            onStart?.()
          }
        }}
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
  // 오토파일럿 투어는 섹션마다 정확히 100vh인 데스크톱 슬라이드덱을 전제로
  // 정거장 좌표를 계산한다 — 일반 스크롤인 좁은 화면에서는 엉뚱한 위치로
  // 튀므로 버튼 자체를 렌더하지 않는다.
  const isDesktop = useMediaQuery('(min-width: 769px) and (min-height: 701px)')
  // 사운드는 선택적 앰비언스라 좁은 화면에서는 계속 생략한다. 원래 이유였던
  // "상단 바 폭 부족"은 컨트롤이 메뉴로 내려오며 사라졌지만, 좁은 화면일수록
  // 스피커 없이 보는 경우가 많다는 판단은 그대로 유지한다.
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
    <header className={`navbar ${scrolled ? 'scrolled' : ''}${menuOpen ? ' navbar--menu-open' : ''}`}>
      <div className="nav-inner container">
        <a className="nav-logo" href="#home" onClick={(e) => handleNav(e, '#home')}>
          <span className="logo-bracket">&lt;</span>
          Evan
          <span className="logo-bracket"> /&gt;</span>
        </a>

        {/* 상단 바에는 로고와 버거만 둔다 — 링크도 컨트롤도 전부 메뉴 안이다. */}
        <div className="nav-controls">
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
    {/* 메뉴 오버레이 - .navbar 밖에 렌더한다: .navbar.scrolled의 backdrop-filter가
        고정 위치의 컨테이닝 블록을 만들어, 이 position:fixed 오버레이를 뷰포트가
        아니라 (훨씬 낮은) 네비바 박스 안에 가둬 버리기 때문이다. */}
    {/* 닫혀 있어도 언마운트하지 않고 hidden으로만 감춘다. 이 안의 컨트롤은
        누른 뒤에도 계속 살아 있어야 하기 때문이다 — 오토파일럿은 언마운트되면
        useAutopilot의 정리가 예약된 투어 타이머를 전부 지워 투어가 시작하자마자
        죽고, 사운드는 AudioContext가 닫혀 음악이 끊긴다. hidden은 화면에서
        지우는 동시에 탭 순서와 접근성 트리에서도 빼 준다. */}
      <nav
        className="nav-mobile"
        aria-label="Site menu"
        hidden={!menuOpen}
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

        {/* 사이트 컨트롤: 상단 바에서 내려온 자리. 오토파일럿과 모드는 화면 전체를
            바꾸는 동작이라 누르는 즉시 메뉴를 닫는다 — 오버레이가 덮은 채로
            투어가 돌면 아무것도 보이지 않는다. 언어와 소리는 그 자리에서 결과가
            보이므로 메뉴를 열어 둔다. */}
        <div className="nav-menu-controls">
          {location.pathname === '/' && isDesktop && (
            <AutopilotButton onStart={() => setMenuOpen(false)} />
          )}
          {location.pathname === '/' && isDesktop && isSoundWidth && <SoundToggle />}
          {location.pathname === '/' && <ModeMenu onPick={() => setMenuOpen(false)} />}
          <LangSwitcher />
        </div>
      </nav>
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
