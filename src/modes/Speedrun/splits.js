// 주의: 데스크톱 메인은 슬라이드 덱이라 각 id가 두 요소에 있다 —
// 인플로우 스크롤 앵커 div(100vh)와 fixed 슬라이드 안의 section.
// 섹션은 멀면 display:none이므로 관찰은 id가 일치하는 모든 요소를 대상으로
// 한다 (데스크톱은 앵커 div가, 모바일은 section이 신호를 준다).
export const MISSIONS = [
  { id: 'home', label: 'Reach Hero', selector: '#home' },
  { id: 'about', label: 'Visit About', selector: '#about' },
  { id: 'projects', label: 'Visit Projects', selector: '#projects' },
  { id: 'skills', label: 'Visit Skills', selector: '#skills' },
  { id: 'contact', label: 'Visit Contact', selector: '#contact' },
]

export function createRun(now) {
  return { startedAt: now, splits: {}, finishedAt: null }
}

export function completeMission(run, id, now) {
  if (run.finishedAt != null || run.splits[id] != null) return run
  const splits = { ...run.splits, [id]: now - run.startedAt }
  const finished = MISSIONS.every((m) => splits[m.id] != null)
  return { ...run, splits, finishedAt: finished ? now : null }
}

export function formatMs(ms) {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const cs = Math.floor((ms % 1000) / 10)
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

const BEST_KEY = 'labmode.speedrun.best'

export function loadBest() {
  const v = Number(localStorage.getItem(BEST_KEY))
  return Number.isFinite(v) && v > 0 ? v : null
}

export function saveBest(ms) {
  const best = loadBest()
  if (best == null || ms < best) {
    localStorage.setItem(BEST_KEY, String(ms))
    return true
  }
  return false
}
