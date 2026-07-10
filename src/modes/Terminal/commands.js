// 터미널 명령 해석기 — 순수 함수. UI 상태를 만지지 않는다.
export function runCommand(rawInput, ctx) {
  const input = rawInput.trim()
  if (!input) return { output: [] }
  const [cmd, ...args] = input.split(/\s+/)
  const arg = args.join(' ')
  const { projects, t } = ctx

  switch (cmd) {
    case 'help':
      return {
        output: [
          'Available commands:',
          '  ls              list portfolio files',
          '  cat about.md    who is Evan?',
          '  projects        list projects',
          '  open <slug>     open a project page',
          '  skills          tech stack',
          '  contact         how to reach me',
          '  clear           clear the screen',
          '  exit            back to the site',
        ],
      }
    case 'ls':
      return { output: ['about.md', 'projects/', 'skills.txt', 'contact.txt'] }
    case 'cat':
      if (arg === 'about.md') return { output: [t.about.body1, '', t.about.body2] }
      if (arg === 'skills.txt') return { output: [t.skills.sub] }
      if (arg === 'contact.txt') return contactOutput()
      return { output: [`cat: ${arg || '?'}: No such file`] }
    case 'projects':
      return { output: projects.map((p) => `${p.slug.padEnd(12)} ${p.title} — ${p.category}`) }
    case 'open': {
      const p = projects.find((x) => x.slug === arg)
      if (!p) return { output: [`open: ${arg || '?'}: not found (try 'projects')`] }
      return { output: [`Opening ${p.title}...`], action: { type: 'navigate', to: `/projects/${p.slug}` } }
    }
    case 'skills':
      return { output: [t.skills.sub] }
    case 'contact':
      return contactOutput()
    case 'clear':
      return { output: [], action: { type: 'clear' } }
    case 'exit':
      return { output: ['bye.'], action: { type: 'exit' } }
    case 'sudo':
      if (arg === 'hire-me') return { output: ['Permission granted. → vmfhrmfoald36@gmail.com'] }
      return { output: [`sudo: ${arg || '?'}: command not found`] }
    default:
      return { output: [`command not found: ${cmd} (try 'help')`] }
  }
}

function contactOutput() {
  return {
    output: [
      'email    : vmfhrmfoald36@gmail.com',
      'github   : github.com/Evvvaaaaan',
      'linkedin : linkedin.com/in/evvvaaaaan',
    ],
  }
}
