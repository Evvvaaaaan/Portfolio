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
      { side: 'east', gap: { center: 0, width: 2 } }, // arch to corridor
    ]),
    portals: [
      { id: 'hall-door', position: [0, 1.5, 30], yaw: Math.PI, halfW: 1, height: 3, link: 'small-door' },
      { id: 'hall-arch', position: [18, 1.5, 0], yaw: Math.PI / 2, halfW: 1, height: 3, link: 'corridor-mouth' },
    ],
  },
  // Long corridor whose two ends link to each other, so walking forward never ends.
  corridor: {
    id: 'corridor',
    accent: 0x818cf8,
    size: { w: 4, d: 40, h: 4 },
    walls: wallBox(4, 40, [
      { side: 'north', gap: { center: 0, width: 2 } }, // far loop portal
      { side: 'south', gap: { center: 0, width: 2 } }, // near end + mouth
      { side: 'east', gap: { center: 18, width: 2 } }, // opening for corridor-mouth
    ]),
    portals: [
      // near end (entry from hall) and far end loop back to each other
      { id: 'corridor-near', position: [0, 1.5, 20], yaw: Math.PI, halfW: 1, height: 3, link: 'corridor-far' },
      { id: 'corridor-far',  position: [0, 1.5, -20], yaw: 0, halfW: 1, height: 3, link: 'corridor-near' },
      // mouth: a side portal that returns to the hall
      { id: 'corridor-mouth', position: [2, 1.5, 18], yaw: -Math.PI / 2, halfW: 1, height: 3, link: 'hall-arch' },
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
