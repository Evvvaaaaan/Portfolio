// Pure layout + config for the Cloud Gallery tour. No three.js import — the
// `form` key maps to a geometry builder inside the component; here it is data.

export const SCULPTURES = [
  { id: 'helix',  form: 'torusKnot', label: 'Helix',  caption: '유리 · 아침빛',    material: 'glass'  },
  { id: 'shard',  form: 'crystal',   label: 'Shard',  caption: '거친 금속 · 정오',  material: 'metal'  },
  { id: 'ripple', form: 'wave',      label: 'Ripple', caption: '대리석 · 황혼',     material: 'marble' },
  { id: 'orb',    form: 'sphere',    label: 'Orb',    caption: '광택 크롬 · 역광',   material: 'chrome' },
]

// Lay sculptures out along +Z at a fixed height, evenly spaced. Adds world
// `position` and normalized `tourStop` (t in [0,1]).
export function layout(sculptures = SCULPTURES, { spacing = 14, height = 0 } = {}) {
  const count = sculptures.length
  return sculptures.map((s, i) => ({
    ...s,
    position: [0, height, i * spacing],
    tourStop: count <= 1 ? 0 : i / (count - 1),
  }))
}

// Camera waypoints framing each laid-out sculpture: pulled back (-Z), up (+Y),
// and to the side (-X) for a 3/4 view, looking at the sculpture.
export function waypoints(laidOut, { back = 7, up = 2.5, side = 4 } = {}) {
  return laidOut.map((s) => ({
    position: [s.position[0] - side, s.position[1] + up, s.position[2] - back],
    lookAt: [...s.position],
  }))
}
