import { describe, it, expect } from 'vitest'
import { modes, getMode, validateModes } from './registry.js'

describe('mode registry', () => {
  it('has no validation errors', () => {
    expect(validateModes(modes)).toEqual([])
  })

  it('getMode returns the mode for a registered id and null otherwise', () => {
    for (const m of modes) expect(getMode(m.id)).toBe(m)
    expect(getMode('nope')).toBeNull()
  })

  it('validateModes reports duplicates and missing fields', () => {
    const ok = { id: 'a', title: 'A', description: 'a', color: '#fff', component: () => null }
    const errors = validateModes([ok, { ...ok, title: '' }])
    expect(errors).toContain('duplicate id: a')
    expect(errors).toContain('a: missing title')
  })
})
