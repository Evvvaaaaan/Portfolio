import { useCallback, useEffect, useRef, useState } from 'react'
import { useLang } from '../../context/LangContext'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import './Projects.css'

const projects = [
  {
    id: 1,
    title: 'DevFlow Platform',
    desc: 'A full-stack developer collaboration platform with real-time code review, CI/CD integration, and team dashboards.',
    tags: ['React', 'Node.js', 'PostgreSQL', 'WebSocket'],
    category: 'Fullstack',
    accent: '#6c63ff',
    link: '#',
    github: '#',
  },
  {
    id: 2,
    title: 'Motion UI Kit',
    desc: 'A comprehensive React component library featuring 50+ animated components built with Framer Motion and Tailwind.',
    tags: ['React', 'TypeScript', 'Framer Motion', 'Storybook'],
    category: 'Frontend',
    accent: '#ff6b9d',
    link: '#',
    github: '#',
  },
  {
    id: 3,
    title: 'Analytics Dashboard',
    desc: 'Real-time analytics dashboard with interactive charts, custom filters, and role-based access control.',
    tags: ['Next.js', 'D3.js', 'Redis', 'REST API'],
    category: 'Fullstack',
    accent: '#06d6a0',
    link: '#',
    github: '#',
  },
  {
    id: 4,
    title: 'E-Commerce Engine',
    desc: 'Headless e-commerce solution with custom storefront, payment integration, and inventory management system.',
    tags: ['Next.js', 'Stripe', 'GraphQL', 'Docker'],
    category: 'Fullstack',
    accent: '#ffd166',
    link: '#',
    github: '#',
  },
  {
    id: 5,
    title: '3D Portfolio Generator',
    desc: 'An interactive tool that lets creatives build stunning 3D portfolio websites using a drag-and-drop interface.',
    tags: ['React', 'Three.js', 'WebGL', 'GSAP'],
    category: 'Frontend',
    accent: '#118ab2',
    link: '#',
    github: '#',
  },
  {
    id: 6,
    title: 'API Gateway Service',
    desc: 'High-performance API gateway with rate limiting, auth middleware, request logging, and health monitoring.',
    tags: ['Node.js', 'Express', 'Redis', 'Nginx'],
    category: 'Backend',
    accent: '#ef476f',
    link: '#',
    github: '#',
  },
]

export default function Projects() {
  const { t } = useLang()
  const sectionRef = useScrollReveal()
  const trackRef = useRef(null)
  const [activeIdx, setActiveIdx] = useState(0)

  const detectActive = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const center = track.scrollLeft + track.clientWidth / 2
    let closest = 0
    let minDist = Infinity
    Array.from(track.children).forEach((el, i) => {
      const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center)
      if (d < minDist) { minDist = d; closest = i }
    })
    setActiveIdx(closest)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    detectActive()
    track.addEventListener('scroll', detectActive, { passive: true })
    return () => track.removeEventListener('scroll', detectActive)
  }, [detectActive])

  const scrollToIdx = useCallback((idx) => {
    const track = trackRef.current
    if (!track) return
    const slide = track.children[idx]
    if (!slide) return
    const left = slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2
    track.scrollTo({ left, behavior: 'smooth' })
  }, [])

  const prev = () => scrollToIdx(Math.max(0, activeIdx - 1))
  const next = () => scrollToIdx(Math.min(projects.length - 1, activeIdx + 1))

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next() }
  }

  return (
    <section className="projects section" id="projects" ref={sectionRef}>
      <div className="container">
        <div className="section-header">
          <p className="section-label fade-up">{t.projects.label}</p>
          <h2 className="section-title fade-up delay-1">{t.projects.title}</h2>
          <p className="section-sub fade-up delay-2">{t.projects.sub}</p>
        </div>
      </div>

      <div className="gallery-wrap fade-up delay-3">
        {/* Edge fades */}
        <div className="gallery-fade gallery-fade-l" aria-hidden="true" />
        <div className="gallery-fade gallery-fade-r" aria-hidden="true" />

        {/* Nav arrows */}
        <button
          className="gallery-arrow gallery-arrow-prev"
          onClick={prev}
          disabled={activeIdx === 0}
          aria-label="Previous project"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          className="gallery-arrow gallery-arrow-next"
          onClick={next}
          disabled={activeIdx === projects.length - 1}
          aria-label="Next project"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Scrollable track */}
        <div
          ref={trackRef}
          className="gallery-track"
          role="region"
          aria-label={t.projects.title}
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {projects.map((p, i) => (
            <div
              key={p.id}
              className={`gallery-slide ${i === activeIdx ? 'active' : ''}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${projects.length}: ${p.title}`}
              onClick={() => i !== activeIdx && scrollToIdx(i)}
            >
              <GalleryCard project={p} active={i === activeIdx} />
            </div>
          ))}
        </div>

        {/* Dot indicators */}
        <div className="gallery-dots" role="group" aria-label="Project navigation">
          {projects.map((p, i) => (
            <button
              key={p.id}
              className={`gallery-dot ${i === activeIdx ? 'active' : ''}`}
              onClick={() => scrollToIdx(i)}
              aria-label={p.title}
              aria-current={i === activeIdx ? 'true' : undefined}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function GalleryCard({ project, active }) {
  return (
    <article className="gcard" style={{ '--card-accent': project.accent }}>
      {/* Visual preview header */}
      <div className="gcard-preview">
        <div className="gcard-preview-chrome">
          <span className="gcard-dot-r" />
          <span className="gcard-dot-y" />
          <span className="gcard-dot-g" />
          <div className="gcard-url-bar" />
        </div>
        <div className="gcard-preview-body">
          <div className="gcard-mock-nav">
            <div className="gcard-mock-logo" />
            <div className="gcard-mock-links">
              <span /><span /><span />
            </div>
          </div>
          <div className="gcard-mock-hero">
            <div className="gcard-mock-h1" />
            <div className="gcard-mock-h1 short" />
            <div className="gcard-mock-p" />
            <div className="gcard-mock-p short" />
            <div className="gcard-mock-btn" />
          </div>
          <div className="gcard-mock-grid">
            <div /><div /><div />
          </div>
        </div>
        <div className="gcard-preview-glow" aria-hidden="true" />
      </div>

      {/* Info */}
      <div className="gcard-info">
        <div className="gcard-head">
          <span className="gcard-category">{project.category}</span>
          <div className="gcard-links">
            <a href={project.github} target="_blank" rel="noreferrer" aria-label={`${project.title} GitHub`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </a>
            <a href={project.link} target="_blank" rel="noreferrer" aria-label={`${project.title} live demo`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>
        </div>

        <h3 className="gcard-title">{project.title}</h3>
        <p className="gcard-desc">{project.desc}</p>

        <ul className="gcard-tags" aria-label="Technologies">
          {project.tags.map((tag) => (
            <li key={tag} className="tag">{tag}</li>
          ))}
        </ul>
      </div>
    </article>
  )
}
