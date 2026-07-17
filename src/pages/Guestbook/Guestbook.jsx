import { useCallback, useEffect, useState } from 'react'
import { useLang } from '../../context/LangContext'
import { GUESTBOOK_EMOJI } from './emoji.js'
import { formatRelativeTime } from './relativeTime.js'
import GuestbookGlobe from './GuestbookGlobe.jsx'
import './Guestbook.css'

export default function Guestbook() {
  const { lang, t } = useLang()
  const g = t.guestbook

  const [entries, setEntries] = useState([])
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState(null)     // { lat, lng } | null
  const [activeEntry, setActiveEntry] = useState(null)
  const [status, setStatus] = useState('idle')       // idle | sending | error
  const [errorMsg, setErrorMsg] = useState('')
  const [toast, setToast] = useState(false)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const res = await fetch('/api/guestbook')
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      setEntries(data.entries || [])
    } catch {
      setLoadError(true)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount pattern; load() sets state only after its internal await/fetch resolves
  useEffect(() => { load() }, [load])

  const handlePickLocation = useCallback((lat, lng) => {
    setActiveEntry(null)
    setStatus('idle')
    setSelected({ lat: Math.round(lat * 10) / 10, lng: Math.round(lng * 10) / 10 })
  }, [])

  const handlePickPin = useCallback((entry) => {
    setSelected(null)
    setActiveEntry(entry)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setStatus('sending')
    try {
      const res = await fetch('/api/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: form.get('nickname'),
          message: form.get('message'),
          emoji: form.get('emoji') || null,
          website: form.get('website'),
          lat: selected.lat,
          lng: selected.lng,
        }),
      })
      if (!res.ok) {
        setStatus('error')
        setErrorMsg(
          res.status === 429 ? g.form.errorRate
          : res.status === 400 ? g.form.errorInvalid
          : g.form.errorServer,
        )
        return
      }
      const data = await res.json()
      if (data.entry) setEntries((prev) => [data.entry, ...prev])
      setSelected(null)
      setStatus('idle')
      setToast(true)
      setTimeout(() => setToast(false), 3000)
    } catch {
      setStatus('error')
      setErrorMsg(g.form.errorServer)
    }
  }

  return (
    <div className="guestbook-page">
      <GuestbookGlobe
        entries={entries}
        tempPin={selected}
        onPickLocation={handlePickLocation}
        onPickPin={handlePickPin}
      />

      <div className="gb-head">
        <h1>{g.title}</h1>
        <p>{g.hint}</p>
      </div>

      {loadError && (
        <div className="gb-load-error" role="alert">
          {g.loadError}{' '}
          <button type="button" onClick={load}>{g.retry}</button>
        </div>
      )}

      {selected && (
        <form className="gb-form" onSubmit={handleSubmit}>
          <h2>{g.form.title}</h2>
          <p className="gb-coords">{selected.lat.toFixed(1)}°, {selected.lng.toFixed(1)}°</p>
          <label>
            {g.form.nickname}
            <input name="nickname" maxLength={20} required placeholder={g.form.nicknamePH} />
          </label>
          <label>
            {g.form.message}
            <textarea name="message" maxLength={200} required rows={3} placeholder={g.form.messagePH} />
          </label>
          <fieldset className="gb-emoji">
            <legend>{g.form.emoji}</legend>
            <div className="gb-emoji-grid">
              {GUESTBOOK_EMOJI.map((em) => (
                <label key={em} className="gb-emoji-item">
                  <input type="radio" name="emoji" value={em} />
                  <span>{em}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {/* 허니팟: 사람 눈에 안 보이는 필드. 봇이 채우면 서버가 조용히 버린다 */}
          <input type="text" name="website" className="gb-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          {status === 'error' && <p className="gb-error" role="alert">{errorMsg}</p>}
          <div className="gb-actions">
            <button type="button" className="gb-btn-ghost" onClick={() => setSelected(null)}>
              {g.form.cancel}
            </button>
            <button type="submit" className="gb-btn" disabled={status === 'sending'}>
              {status === 'sending' ? g.form.sending : g.form.submit}
            </button>
          </div>
        </form>
      )}

      {activeEntry && (
        <div className="gb-card" role="dialog" aria-label={activeEntry.nickname}>
          <button type="button" className="gb-card-close" onClick={() => setActiveEntry(null)} aria-label="Close">
            ×
          </button>
          <div className="gb-card-head">
            {activeEntry.emoji && <span className="gb-card-emoji">{activeEntry.emoji}</span>}
            <strong>{activeEntry.nickname}</strong>
            <time>{formatRelativeTime(activeEntry.created_at, lang)}</time>
          </div>
          <p className="gb-card-msg">{activeEntry.message}</p>
        </div>
      )}

      {toast && <div className="gb-toast">{g.form.success}</div>}
    </div>
  )
}
