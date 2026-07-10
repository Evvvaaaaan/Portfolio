import { describe, it, expect, beforeEach } from 'vitest'
import { MISSIONS, createRun, completeMission, formatMs, loadBest, saveBest } from './splits.js'

// node 환경에는 localStorage가 없으므로 스텁
beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  }
})

describe('splits engine', () => {
  it('completes missions and finishes when all are done', () => {
    let run = createRun(1000)
    for (const m of MISSIONS.slice(0, -1)) {
      run = completeMission(run, m.id, 2000)
      expect(run.finishedAt).toBeNull()
    }
    run = completeMission(run, MISSIONS.at(-1).id, 5000)
    expect(run.finishedAt).toBe(5000)
    expect(run.splits[MISSIONS.at(-1).id]).toBe(4000)
  })

  it('is idempotent per mission and frozen after finish', () => {
    let run = createRun(0)
    run = completeMission(run, MISSIONS[0].id, 100)
    const again = completeMission(run, MISSIONS[0].id, 999)
    expect(again).toBe(run)
  })

  it('formatMs renders m:ss.cc', () => {
    expect(formatMs(0)).toBe('0:00.00')
    expect(formatMs(83_456)).toBe('1:23.45')
  })

  it('saveBest keeps the minimum', () => {
    expect(loadBest()).toBeNull()
    expect(saveBest(5000)).toBe(true)
    expect(saveBest(7000)).toBe(false)
    expect(loadBest()).toBe(5000)
  })
})
