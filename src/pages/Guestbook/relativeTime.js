const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]

// ISO 시각 → '3일 전' 같은 로케일별 상대 시간. 미래/방금은 1분 전으로 클램프.
export function formatRelativeTime(iso, lang = 'en', now = Date.now()) {
  const diffSec = Math.max(60, Math.round((now - new Date(iso).getTime()) / 1000))
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'always' })
  for (const [unit, sec] of UNITS) {
    if (diffSec >= sec) return rtf.format(-Math.floor(diffSec / sec), unit)
  }
  return rtf.format(-1, 'minute')
}
