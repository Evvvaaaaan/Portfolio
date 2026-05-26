import { useLang } from '../../context/LangContext'
import './Footer.css'

export default function Footer() {
  const { t } = useLang()

  return (
    <footer className="footer">
      <div className="container footer-inner">
        <span className="footer-logo">
          <span style={{ color: 'var(--accent)' }}>&lt;</span>
          Evan
          <span style={{ color: 'var(--accent)' }}> /&gt;</span>
        </span>
        <p className="footer-copy">
          © {new Date().getFullYear()} Evan. {t.footer.built}.
        </p>
        <div className="footer-links">
          <a href="https://github.com/Evvvaaaaan" target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://www.linkedin.com/in/evvvaaaaan/" target="_blank" rel="noreferrer">LinkedIn</a>
          <a href="mailto:vmfhrmfoald36@gmail.com">Email</a>
        </div>
      </div>
    </footer>
  )
}
