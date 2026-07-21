import { describe, it, expect } from 'vitest'
import { ROOMS, validateRooms } from './rooms.js'

describe('ROOMS graph', () => {
  it('has valid, symmetric portal links', () => {
    expect(validateRooms(ROOMS)).toEqual([])
  })

  it('every room has an id matching its key and at least one portal', () => {
    for (const [key, room] of Object.entries(ROOMS)) {
      expect(room.id).toBe(key)
      expect(room.portals.length).toBeGreaterThan(0)
    }
  })
})

describe('validateRooms', () => {
  it('flags a dangling link', () => {
    const bad = {
      a: { id: 'a', portals: [{ id: 'a1', link: 'nope' }] },
    }
    expect(validateRooms(bad)).toContain('a1 links to missing portal nope')
  })

  it('flags an asymmetric link', () => {
    const bad = {
      a: { id: 'a', portals: [{ id: 'a1', link: 'b1' }] },
      b: { id: 'b', portals: [{ id: 'b1', link: 'a1' }, { id: 'b2', link: 'a1' }] },
    }
    // a1<->b1 is fine, but b2->a1 while a1->b1 is asymmetric
    expect(validateRooms(bad).some((m) => m.includes('asymmetric'))).toBe(true)
  })
})
