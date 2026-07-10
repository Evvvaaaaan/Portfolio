import { describe, it, expect } from 'vitest'
import { runCommand } from './commands.js'

const ctx = {
  projects: [
    { slug: 'findx', title: 'FindX', category: 'Fullstack' },
    { slug: 'spotline', title: 'Spotline', category: 'AI · Fullstack' },
  ],
  t: {
    about: { body1: 'ABOUT_ONE', body2: 'ABOUT_TWO' },
    skills: { sub: 'SKILLS_SUB' },
  },
}

describe('runCommand', () => {
  it('help lists commands', () => {
    const res = runCommand('help', ctx)
    expect(res.output.join('\n')).toContain('ls')
    expect(res.output.join('\n')).toContain('exit')
  })

  it('empty input outputs nothing', () => {
    expect(runCommand('   ', ctx)).toEqual({ output: [] })
  })

  it('cat about.md prints about copy from ctx', () => {
    const res = runCommand('cat about.md', ctx)
    expect(res.output).toContain('ABOUT_ONE')
    expect(res.output).toContain('ABOUT_TWO')
  })

  it('projects lists slugs and titles', () => {
    const out = runCommand('projects', ctx).output.join('\n')
    expect(out).toContain('findx')
    expect(out).toContain('Spotline')
  })

  it('open <slug> returns navigate action; unknown slug errors', () => {
    expect(runCommand('open findx', ctx).action).toEqual({ type: 'navigate', to: '/projects/findx' })
    expect(runCommand('open nope', ctx).action).toBeUndefined()
  })

  it('exit and clear return actions', () => {
    expect(runCommand('exit', ctx).action).toEqual({ type: 'exit' })
    expect(runCommand('clear', ctx).action).toEqual({ type: 'clear' })
  })

  it('unknown command suggests help', () => {
    expect(runCommand('wat', ctx).output[0]).toContain("try 'help'")
  })

  it('sudo hire-me easter egg', () => {
    expect(runCommand('sudo hire-me', ctx).output.join(' ')).toContain('vmfhrmfoald36@gmail.com')
  })
})
