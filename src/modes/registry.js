import { lazy } from 'react'

// Lab Modes 레지스트리. 각 모드 구현 태스크에서 modes 배열에 항목을 추가한다.
// 항목 형태: { id, title, description, color, component(lazy) }
export const modes = [
  {
    id: 'terminal',
    title: 'Terminal',
    description: 'Browse this portfolio like a CLI.',
    color: '#4af626',
    component: lazy(() => import('./Terminal/Terminal.jsx')),
  },
]

export function getMode(id) {
  return modes.find((m) => m.id === id) ?? null
}

export function validateModes(list) {
  const errors = []
  const seen = new Set()
  for (const m of list) {
    for (const key of ['id', 'title', 'description', 'color', 'component']) {
      if (!m[key]) errors.push(`${m.id ?? '?'}: missing ${key}`)
    }
    if (seen.has(m.id)) errors.push(`duplicate id: ${m.id}`)
    seen.add(m.id)
  }
  return errors
}
