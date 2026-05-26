import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../context/LangContext'
import './ResumeModal.css'

export default function ResumeModal({ onClose }) {
  const { t } = useLang()
  const m = t.resumeModal
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [done, setDone] = useState(false)
  const [status, setStatus] = useState('idle')
  const firstInputRef = useRef(null)
  const modalRef = useRef(null)

  // Focus first input on open
  useEffect(() => {
    firstInputRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Focus trap
  useEffect(() => {
    const el = modalRef.current
    if (!el) return
    const focusable = el.querySelectorAll(
      'button, input, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const trap = (e) => {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    el.addEventListener('keydown', trap)
    return () => el.removeEventListener('keydown', trap)
  }, [done])

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('sending')

    try {
      const response = await fetch('/api/resume-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!response.ok) throw new Error('Resume request failed')

      setDone(true)
      setStatus('idle')
      setForm({ name: '', email: '', phone: '' })
    } catch {
      setStatus('error')
    }
  }

  return (
    <div
      className="rm-overlay"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        className="rm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rm-title"
      >
        <button className="rm-close" onClick={onClose} aria-label={m.close}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {done ? (
          <div className="rm-success" role="status">
            <div className="rm-success-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p className="rm-success-msg">{m.success}</p>
            <button className="btn btn-outline rm-close-btn" onClick={onClose}>
              {m.close}
            </button>
          </div>
        ) : (
          <>
            <h2 id="rm-title" className="rm-title">{m.title}</h2>
            <p className="rm-subtitle">{m.subtitle}</p>

            <form className="rm-form" onSubmit={handleSubmit} noValidate>
              <div className="rm-field">
                <label htmlFor="rm-name">{m.name}</label>
                <input
                  ref={firstInputRef}
                  id="rm-name"
                  name="name"
                  type="text"
                  placeholder={m.namePH}
                  value={form.name}
                  onChange={handleChange}
                  required
                  autoComplete="name"
                />
              </div>

              <div className="rm-field">
                <label htmlFor="rm-email">{m.email}</label>
                <input
                  id="rm-email"
                  name="email"
                  type="email"
                  placeholder={m.emailPH}
                  value={form.email}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="rm-field">
                <label htmlFor="rm-phone">{m.phone}</label>
                <input
                  id="rm-phone"
                  name="phone"
                  type="tel"
                  placeholder={m.phonePH}
                  value={form.phone}
                  onChange={handleChange}
                  required
                  autoComplete="tel"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary rm-submit"
                disabled={status === 'sending'}
                aria-busy={status === 'sending'}
              >
                {m.submit}
              </button>

              {status === 'error' && (
                <p className="rm-error" role="alert">{m.error}</p>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  )
}
