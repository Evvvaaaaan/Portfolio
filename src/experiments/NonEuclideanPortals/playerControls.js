import { Vector3 } from 'three'

// Camera-relative movement delta on the x/z plane. yaw=0 looks toward -z.
export function moveVector(yaw, input, speed) {
  let fx = 0
  let fz = 0
  if (input.f) fz -= 1
  if (input.b) fz += 1
  if (input.l) fx -= 1
  if (input.r) fx += 1
  const len = Math.hypot(fx, fz)
  if (len === 0) return new Vector3(0, 0, 0)
  fx /= len
  fz /= len
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  // rotate (fx,fz) by yaw about y
  const dx = fx * cos + fz * sin
  const dz = -fx * sin + fz * cos
  return new Vector3(dx * speed, 0, dz * speed)
}

// Clamp movement along one axis (x or z), given the fixed coordinate on the
// other axis. A wall only constrains this axis if the fixed coordinate falls
// within the wall's exact (unpadded) span on the other axis; the axis being
// moved is padded by `radius`. This is what lets the player slide freely
// along a wall's face while still being stopped head-on.
function clampAxis(fixedOther, start, d, walls, radius, otherIdx, axisIdx) {
  let allowed = d
  for (const w of walls) {
    if (fixedOther < w.min[otherIdx] || fixedOther > w.max[otherIdx]) continue
    const axisLo = w.min[axisIdx] - radius
    const axisHi = w.max[axisIdx] + radius
    if (start <= axisLo) {
      if (d > 0) allowed = Math.min(allowed, axisLo - start)
    } else if (start >= axisHi) {
      if (d < 0) allowed = Math.max(allowed, axisHi - start)
    } else {
      // already inside the padded band on this axis
      const movingDeeper = (d > 0 && start + d <= axisHi) || (d < 0 && start + d >= axisLo)
      if (movingDeeper) allowed = d > 0 ? Math.min(allowed, 0) : Math.max(allowed, 0)
    }
  }
  return allowed
}

// Apply delta.x then delta.z independently, clamping each axis against any
// wall AABB the player (a circle of `radius`) would penetrate. This yields
// wall slide: a blocked axis stops at the wall face while the other axis's
// motion is preserved. y is passed through unchanged.
export function resolveMove(pos, delta, walls, radius = 0.35) {
  const out = pos.clone()
  if (delta.x !== 0) {
    out.x += clampAxis(out.z, out.x, delta.x, walls, radius, 1, 0)
  }
  if (delta.z !== 0) {
    out.z += clampAxis(out.x, out.z, delta.z, walls, radius, 0, 1)
  }
  return out
}
