import './ComingSoon.css'

export default function ComingSoon({ title }) {
  return (
    <div className="coming-soon">
      <div className="coming-soon-inner">
        <span className="coming-soon-tag">experiment</span>
        <h2>{title ?? 'Untitled'}</h2>
        <p>준비 중입니다</p>
      </div>
    </div>
  )
}
