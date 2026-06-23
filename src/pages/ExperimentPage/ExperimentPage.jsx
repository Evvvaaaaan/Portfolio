import { Suspense, useState, useEffect } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { experiments } from '../../experiments/index.js'
import './ExperimentPage.css'

export default function ExperimentPage() {
  const { id } = useParams()
  const [barVisible, setBarVisible] = useState(false)

  useEffect(() => {
    let prev = false
    const onMove = (e) => {
      const next = e.clientY < 80
      if (next !== prev) { prev = next; setBarVisible(next) }
    }
    document.addEventListener('mousemove', onMove)
    return () => document.removeEventListener('mousemove', onMove)
  }, [])

  const exp = experiments.find((e) => e.id === id)
  if (!exp) return <Navigate to="/gallery" replace />

  const Component = exp.component

  const bar = (
    <div className={`exp-page-bar${barVisible ? ' visible' : ''}`}>
      <div className="exp-page-meta">
        <span className="exp-page-title">{exp.title}</span>
        <div className="exp-page-tags">
          {exp.tags.map((t) => (
            <span key={t} className="exp-page-tag" style={{ '--exp-color': exp.color }}>
              {t}
            </span>
          ))}
        </div>
      </div>
      {exp.sources && (
        <Link to={`/gallery/${exp.id}/code`} className="exp-page-code-btn">
          {'</>'}
        </Link>
      )}
    </div>
  )

  if (exp.fullscreen) {
    return (
      <div className="exp-fullscreen">
        <Link to="/gallery" className="exp-fullscreen-back">← Lab</Link>
        {bar}
        <Suspense fallback={<div className="exp-page-loading">Loading…</div>}>
          <Component title={exp.title} />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="exp-page">
      <Link to="/gallery" className="exp-page-back">← Lab</Link>
      {bar}
      <div className="exp-page-canvas">
        <Suspense fallback={<div className="exp-page-loading">Loading…</div>}>
          <Component title={exp.title} />
        </Suspense>
      </div>
      <div className="exp-page-info">
        <p className="exp-page-desc">{exp.description}</p>
      </div>
    </div>
  )
}
