import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../../context/LangContext'
import { useMode } from '../ModeContext.jsx'
import { projects } from '../../data/projects.js'
import { runCommand } from './commands.js'
import './Terminal.css'

const BANNER = [
  'evan@portfolio — labmode/terminal',
  "type 'help' to get started, 'exit' to leave.",
  '',
]

export default function Terminal() {
  const { t } = useLang()
  const { exitMode } = useMode()
  const navigate = useNavigate()
  const [lines, setLines] = useState(BANNER)
  const [value, setValue] = useState('')
  const inputRef = useRef(null)
  const screenRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const el = screenRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const submit = (e) => {
    e.preventDefault()
    const res = runCommand(value, { projects, t })
    let next = [...lines, `$ ${value}`, ...res.output]
    if (res.action?.type === 'clear') next = []
    setLines(next)
    setValue('')
    if (res.action?.type === 'exit') exitMode()
    if (res.action?.type === 'navigate') {
      exitMode()
      navigate(res.action.to)
    }
  }

  return (
    <div
      className="terminal-overlay"
      role="dialog"
      aria-label="Terminal portfolio"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="terminal-screen" ref={screenRef}>
        {lines.map((l, i) => (
          <pre key={i} className="terminal-line">{l || ' '}</pre>
        ))}
        <form className="terminal-input-row" onSubmit={submit}>
          <span className="terminal-prompt" aria-hidden="true">$</span>
          <input
            ref={inputRef}
            className="terminal-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label="Terminal input"
          />
        </form>
      </div>
    </div>
  )
}
