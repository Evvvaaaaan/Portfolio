const CANDIDATE_SELECTOR = [
  '#home h1', '#home p', '#home a', '#home button',
  '#about h2', '#about p',
  '#projects h2', '#projects .project-card',
  '#skills h2', '#skills li',
  '#contact h2', '#contact p', '#contact form',
].join(', ')

export const MAX_BODIES = 80

// 뷰포트 안에 보이는 요소만 골라 큰 것부터 최대 MAX_BODIES개 반환
export function collectTargets(doc = document, viewportH = window.innerHeight) {
  const els = [...doc.querySelectorAll(CANDIDATE_SELECTOR)]
  const picked = []
  for (const el of els) {
    if (picked.some((p) => p.el.contains(el))) continue
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) continue
    if (r.bottom <= 0 || r.top >= viewportH) continue
    picked.push({ el, rect: { x: r.left, y: r.top, w: r.width, h: r.height } })
  }
  return picked
    .sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)
    .slice(0, MAX_BODIES)
}
