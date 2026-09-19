export const PAPER_WIDTH = 480
export const PAPER_HEIGHT = 640
export const PAPER_CORNERS = [[1, 1], [0, 1], [0, 0], [1, 0]]

export function fitPaper(width, height) {
  const scale = Math.max(0.1, Math.min((width - 88) / PAPER_WIDTH, (height - 88) / PAPER_HEIGHT, 1.12))
  return { scale, x: (width - PAPER_WIDTH * scale) / 2, y: (height - PAPER_HEIGHT * scale) / 2 }
}

// Independent cylindrical bends, a travelling breeze, and damped touch waves.
// The same projection positions the mesh and the accessible corner handle.
export function paperPoint(u, v, curl, time, wind, lift, ripples = [], gust = 0) {
  let x = u * PAPER_WIDTH
  let y = v * PAPER_HEIGHT
  let z = 0
  const curls = typeof curl === 'number' ? [curl] : curl
  for (let i = 0; i < curls.length; i++) {
    if (curls[i] <= 0.001) continue
    const [cx, cy] = PAPER_CORNERS[i]
    const distance = Math.max(0, ((cx ? u : 1 - u) * PAPER_WIDTH + (cy ? v : 1 - v) * PAPER_HEIGHT - (PAPER_WIDTH + PAPER_HEIGHT) * 0.68) / Math.SQRT2)
    const radius = PAPER_WIDTH * 0.28 / curls[i]
    const angle = Math.min(distance / radius, 2.8)
    const shift = (Math.sin(angle) * radius - distance) / Math.SQRT2
    x += shift * (cx ? 1 : -1)
    y += shift * (cy ? 1 : -1)
    z += (1 - Math.cos(angle)) * radius
  }
  z += Math.sin(v * 5.2 - time * 1.8 + u * 2) * Math.sin(v * Math.PI) * wind * 14
  z += Math.sin(u * 4 + v * 6 - time * 8) * Math.sin(v * Math.PI) * gust * 45 * lift
  for (const ripple of ripples) {
    const age = time - ripple.start
    const distance = Math.hypot((u - ripple.u) * 0.75, v - ripple.v)
    const envelope = Math.exp(-age * 2.8) * Math.exp(-Math.pow((distance - age * 0.55) * 5, 2))
    z += Math.sin(distance * 24 - age * 14) * envelope * 28 * lift
  }
  x -= PAPER_WIDTH / 2
  y -= PAPER_HEIGHT / 2
  const angle = -0.075 * lift
  const tiltedX = x * Math.cos(angle) - y * Math.sin(angle)
  const tiltedY = x * Math.sin(angle) + y * Math.cos(angle)
  const perspective = 1 / (1 - z / 1600)
  return [tiltedX * perspective + PAPER_WIDTH / 2, (tiltedY - z * 0.24) * perspective + PAPER_HEIGHT / 2, z]
}
