// A room is a local y-up space, floor at y=0. Walls are axis-aligned boxes in
// the x/z plane used for point collision. Portals are vertical rectangles.

export const ROOMS = {
  // Small outer room: looks like a modest 6x6 chamber with a doorway portal.
  small: {
    id: 'small',
    accent: 0x818cf8,
    size: { w: 6, d: 6, h: 3 },
    walls: wallBox(6, 6, [
      { side: 'north', gap: { center: 0, width: 2 } }, // doorway on far wall
    ]),
    portals: [
      { id: 'small-door', position: [0, 1.5, -3], yaw: 0, halfW: 1, height: 3, link: 'hall-door' },
    ],
  },
  // The hall the doorway opens into is vastly larger than the small room.
  hall: {
    id: 'hall',
    accent: 0x818cf8,
    size: { w: 40, d: 60, h: 14 },
    walls: wallBox(40, 60, [
      { side: 'south', gap: { center: 0, width: 2 } }, // doorway back to small
    ]),
    portals: [
      { id: 'hall-door', position: [0, 1.5, 30], yaw: Math.PI, halfW: 1, height: 3, link: 'small-door' },
    ],
  },
}

// Build 4 perimeter wall AABBs for a w×d room centered at origin, with optional
// gaps (doorways) so the player can pass through where a portal sits.
function wallBox(w, d, gaps = []) {
  const t = 0.3 // wall thickness
  const hw = w / 2
  const hd = d / 2
  const byside = Object.fromEntries(gaps.map((g) => [g.side, g.gap]))
  const walls = []
  // north (−z) and south (+z) run along x
  for (const [side, z] of [['north', -hd], ['south', hd]]) {
    const gap = byside[side]
    if (!gap) {
      walls.push({ min: [-hw, z - t], max: [hw, z + t] })
    } else {
      const gl = gap.center - gap.width / 2
      const gr = gap.center + gap.width / 2
      walls.push({ min: [-hw, z - t], max: [gl, z + t] })
      walls.push({ min: [gr, z - t], max: [hw, z + t] })
    }
  }
  // east (+x) and west (−x) run along z
  for (const [side, x] of [['east', hw], ['west', -hw]]) {
    const gap = byside[side]
    if (!gap) {
      walls.push({ min: [x - t, -hd], max: [x + t, hd] })
    } else {
      const gl = gap.center - gap.width / 2
      const gr = gap.center + gap.width / 2
      walls.push({ min: [x - t, -hd], max: [x + t, gl] })
      walls.push({ min: [x - t, gr], max: [x + t, hd] })
    }
  }
  return walls
}

export function validateRooms(rooms) {
  const problems = []
  const byId = {}
  for (const room of Object.values(rooms)) {
    for (const p of room.portals) byId[p.id] = p
  }
  for (const room of Object.values(rooms)) {
    for (const p of room.portals) {
      if (p.link === p.id) problems.push(`${p.id} links to itself`)
      const target = byId[p.link]
      if (!target) {
        problems.push(`${p.id} links to missing portal ${p.link}`)
        continue
      }
      if (target.link !== p.id) {
        problems.push(`asymmetric link: ${p.id}→${p.link} but ${target.id}→${target.link}`)
      }
    }
  }
  return problems
}
