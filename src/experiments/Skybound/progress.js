import { AIRCRAFT } from './aircraft.js'

export const PROGRESS_KEY = 'skybound-progress-v1'
export const CHECKPOINT_GOLD = 100
export const newProgress = () => ({ gold: 0, owned: ['trainer'], selected: 'trainer' })

export function loadProgress(storage) {
  try {
    const saved = JSON.parse((storage || localStorage).getItem(PROGRESS_KEY))
    if (!saved || !Number.isSafeInteger(saved.gold) || saved.gold < 0) return newProgress()
    const owned = AIRCRAFT.filter((aircraft) => aircraft.price === 0 || (Array.isArray(saved.owned) && saved.owned.includes(aircraft.id))).map((aircraft) => aircraft.id)
    return { gold: saved.gold, owned, selected: owned.includes(saved.selected) ? saved.selected : 'trainer' }
  } catch { return newProgress() }
}

export function saveProgress(progress, storage) {
  try { (storage || localStorage).setItem(PROGRESS_KEY, JSON.stringify(progress)); return true }
  catch { return false }
}

export function purchaseAircraft(progress, id) {
  const aircraft = AIRCRAFT.find((item) => item.id === id)
  if (!aircraft || progress.owned.includes(id) || progress.gold < aircraft.price) return progress
  return { gold: progress.gold - aircraft.price, owned: [...progress.owned, id], selected: id }
}
