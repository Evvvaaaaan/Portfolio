import { useState } from 'react'
import { useLang } from '../../context/LangContext'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import './Contact.css'

export default function Contact() {
  const ref = useScrollReveal()
  const { t } = useLang()
  const f = t.contact.form
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [status, setStatus] = useState('idle')

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('sending')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!response.ok) throw new Error('Contact request failed')

      setStatus('sent')
      setForm({ name: '', email: '', message: '' })
    } catch {
      setStatus('error')
    }
  }

  return (
    <section className="contact section" id="contact" ref={ref}>
      <div className="container">
        <div className="contact-inner">
          <div className="contact-info">
            <p className="section-label fade-up">{t.contact.label}</p>
            <h2 className="contact-title fade-up delay-1">
              {t.contact.title[0]}<br />
              <span className="gradient-text">{t.contact.title[1]}</span>
            </h2>
            <p className="contact-body fade-up delay-2">{t.contact.body}</p>

            <div className="contact-links fade-up delay-3">
              <a href="mailto:vmfhrmfoald36@gmail.com" className="contact-link">
                <div className="contact-link-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                  </svg>
                </div>
                <div>
                  <span className="link-label">{t.contact.emailLabel}</span>
                  <span className="link-value">vmfhrmfoald36@gmail.com</span>
                </div>
              </a>

              <a href="https://www.linkedin.com/in/evvvaaaaan/" target="_blank" rel="noreferrer" className="contact-link">
                <div className="contact-link-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </div>
                <div>
                  <span className="link-label">{t.contact.linkedinLabel}</span>
                  <span className="link-value">linkedin.com/in/evvvaaaaan</span>
                </div>
              </a>

              <a href="https://github.com/Evvvaaaaan" target="_blank" rel="noreferrer" className="contact-link">
                <div className="contact-link-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                </div>
                <div>
                  <span className="link-label">{t.contact.githubLabel}</span>
                  <span className="link-value">github.com/Evvvaaaaan</span>
                </div>
              </a>
            </div>
          </div>

          <div className="contact-form-wrap fade-up delay-2">
            {status === 'sent' ? (
              <div className="form-success" role="alert">
                <div className="success-icon" aria-hidden="true">✓</div>
                <h3>{f.successTitle}</h3>
                <p>{f.successBody}</p>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleSubmit} noValidate>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="name">{f.name}</label>
                    <input
                      id="name" name="name" type="text"
                      placeholder={f.namePH}
                      value={form.name}
                      onChange={handleChange}
                      required
                      autoComplete="name"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">{f.email}</label>
                    <input
                      id="email" name="email" type="email"
                      placeholder={f.emailPH}
                      value={form.email}
                      onChange={handleChange}
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="message">{f.message}</label>
                  <textarea
                    id="message" name="message"
                    rows={5}
                    placeholder={f.messagePH}
                    value={form.message}
                    onChange={handleChange}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary form-submit"
                  disabled={status === 'sending'}
                  aria-busy={status === 'sending'}
                >
                  {status === 'sending' ? (
                    <><span className="spinner" aria-hidden="true" /> {f.sending}</>
                  ) : (
                    <>
                      {f.send}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>
                    </>
                  )}
                </button>

                {status === 'error' && (
                  <p className="form-error" role="alert">{f.error}</p>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
