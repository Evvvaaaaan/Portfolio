import { Matrix4, Vector3, Euler, Quaternion } from 'three'

function quatFromYaw(yaw) {
  return new Quaternion().setFromEuler(new Euler(0, yaw, 0))
}

// World placement matrix of a portal from center position + yaw (about y).
export function portalMatrix(position, yaw) {
  return new Matrix4().compose(position, quatFromYaw(yaw), new Vector3(1, 1, 1))
}

const ROT_Y_180 = new Matrix4().makeRotationY(Math.PI)

// Maps entry-room space → exit-room space, with the 180° portal flip.
export function relativePortalMatrix(entry, exit) {
  const entryInv = new Matrix4().copy(entry).invert()
  return new Matrix4().copy(exit).multiply(ROT_Y_180).multiply(entryInv)
}

// True if segment prev→next passes through the portal's front face.
export function crossedPortal(prev, next, entry, halfW, height) {
  const inv = new Matrix4().copy(entry).invert()
  const p = prev.clone().applyMatrix4(inv)
  const n = next.clone().applyMatrix4(inv)
  // Front-to-back means local z goes from >0 to <=0.
  if (!(p.z > 0 && n.z <= 0)) return false
  const t = p.z / (p.z - n.z) // interpolation factor to z=0
  const x = p.x + (n.x - p.x) * t
  const y = p.y + (n.y - p.y) * t
  return x >= -halfW && x <= halfW && y >= 0 && y <= height
}
