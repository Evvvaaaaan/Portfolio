import { useState } from 'react'
import { useLang } from '../../context/LangContext'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import ResumeModal from '../../components/ResumeModal/ResumeModal'
import './About.css'

export default function About() {
  const ref = useScrollReveal()
  const { t } = useLang()
  const { label, title, body1, body2, resume, stats } = t.about
  const [showModal, setShowModal] = useState(false)

  return (
    <section className="about section" id="about" ref={ref}>
      <div className="container">
        <div className="about-grid">
          <div className="about-text">
            <p className="section-label fade-up">{label}</p>
            <h2 className="about-title fade-up delay-1">
              {title[0]}<br />
              <span className="gradient-text">{title[1]}</span>
            </h2>
            <p className="about-body fade-up delay-2">{body1}</p>
            <p className="about-body fade-up delay-3">{body2}</p>

            <button
              className="btn btn-outline about-resume fade-up delay-4"
              onClick={() => setShowModal(true)}
            >
              {resume}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 5v14M5 12l7 7 7-7"/>
              </svg>
            </button>
          </div>

          <div className="about-stats" role="list">
            {stats.map((s, i) => (
              <div key={s.label} className={`stat-card fade-up delay-${i + 1}`} role="listitem">
                <span className="stat-value">{s.value}</span>
                <span className="stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showModal && <ResumeModal onClose={() => setShowModal(false)} />}
    </section>
  )
}
