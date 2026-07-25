// Pure uniform Catmull-Rom interpolation over plain [x,y,z] arrays.
// No three.js import — unit-testable without WebGL (mirrors flightPath.js).

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

function catmullVec(P0, P1, P2, P3, t) {
  return [
    catmull(P0[0], P1[0], P2[0], P3[0], t),
    catmull(P0[1], P1[1], P2[1], P3[1], t),
    catmull(P0[2], P1[2], P2[2], P3[2], t),
  ]
}

// Interpolate an array of vec3 control points at u in [0,1]. Boundary handled
// by clamping the phantom endpoints to the first/last point.
function splineAt(points, u) {
  const n = points.length
  if (n === 1) return points[0].slice()
  const segCount = n - 1
  const clamped = Math.min(Math.max(u, 0), 1)
  const scaled = clamped * segCount
  let seg = Math.floor(scaled)
  if (seg >= segCount) seg = segCount - 1
  const localT = scaled - seg
  const p0 = points[Math.max(seg - 1, 0)]
  const p1 = points[seg]
  const p2 = points[seg + 1]
  const p3 = points[Math.min(seg + 2, n - 1)]
  return catmullVec(p0, p1, p2, p3, localT)
}

export function samplePath(waypoints, t) {
  return {
    position: splineAt(waypoints.map((w) => w.position), t),
    lookAt: splineAt(waypoints.map((w) => w.lookAt), t),
  }
}

export function stopT(index, count) {
  if (count <= 1) return 0
  return index / (count - 1)
}
