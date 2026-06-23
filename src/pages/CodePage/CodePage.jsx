import { useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { experiments } from '../../experiments/index.js'
import './CodePage.css'

// Apply regex only to text nodes, not inside existing HTML tags
function applyToText(html, regex, replacement) {
  return html.replace(/(<[^>]*>)|([^<]+)/g, (m, tag, text) =>
    tag ? tag : text.replace(regex, replacement)
  )
}

function highlight(code, lang) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  if (lang === 'css') {
    let h = esc(code)
    h = applyToText(h, /(\/\*[\s\S]*?\*\/)/g, '<span class="cp-comment">$1</span>')
    h = applyToText(h, /([.#:@]?[\w-]+)(\s*\{)/g, '<span class="cp-selector">$1</span>$2')
    h = applyToText(h, /\b([\w-]+)(\s*:)(?!\s*\/)/g, '<span class="cp-prop">$1</span>$2')
    h = applyToText(h, /:\s*([^;{}\n]+)/g, (m, v) => ': <span class="cp-value">' + v + '</span>')
    return h
  }

  let h = esc(code)
  h = applyToText(h, /(\/\/[^\n]*)/g, '<span class="cp-comment">$1</span>')
  h = applyToText(h,
    /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g,
    '<span class="cp-string">$1</span>')
  h = applyToText(h,
    /\b(import|export|default|from|const|let|var|function|return|if|else|for|of|in|new|class|extends|async|await|true|false|null|undefined)\b/g,
    '<span class="cp-kw">$1</span>')
  h = applyToText(h,
    /\b(useState|useEffect|useCallback|useRef|useParams|lazy|Suspense)\b/g,
    '<span class="cp-hook">$1</span>')
  h = applyToText(h, /(&lt;\/?)([\w.]+)/g, '$1<span class="cp-tag">$2</span>')
  h = applyToText(h, /\b(\d+(\.\d+)?)\b/g, '<span class="cp-num">$1</span>')
  return h
}

export default function CodePage() {
  const { id } = useParams()
  const exp = experiments.find((e) => e.id === id)

  const [activeIdx, setActiveIdx] = useState(0)
  const [copied, setCopied] = useState(false)

  if (!exp || !exp.sources) return <Navigate to={`/gallery/${id}`} replace />

  const active = exp.sources[activeIdx]

  const copy = () => {
    navigator.clipboard.writeText(active.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const lines = active.code.split('\n')
  const html = highlight(active.code, active.lang)
  const lineCount = lines.length

  return (
    <div className="cp-page">
      <div className="cp-bar">
        <div className="cp-bar-left">
          <Link to={`/gallery/${id}`} className="cp-back">← Demo</Link>
          <Link to="/gallery" className="cp-back cp-back-lab">Lab</Link>
        </div>
        <div className="cp-bar-meta">
          <span className="cp-bar-title">{exp.title}</span>
          <span className="cp-bar-sep">/</span>
          <span className="cp-bar-label">Source</span>
        </div>
      </div>

      <div className="cp-body">
        <div className="cp-file-tabs">
          {exp.sources.map((s, i) => (
            <button
              key={s.name}
              className={`cp-tab${i === activeIdx ? ' active' : ''}`}
              onClick={() => setActiveIdx(i)}
            >
              {s.name}
            </button>
          ))}
          <button className="cp-copy" onClick={copy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        <div className="cp-code-wrap">
          <div className="cp-line-nums" aria-hidden="true">
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <pre className="cp-pre">
            <code
              className={`cp-code lang-${active.lang}`}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </pre>
        </div>
      </div>
    </div>
  )
}
