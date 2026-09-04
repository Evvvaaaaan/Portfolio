import * as THREE from 'three'
import { PARTS } from './parts.js'

// 절차적 탐사선.
//
// 실제 GLB로 교체할 때 바꿀 파일은 여기 하나다. 계약은 두 가지뿐 —
//   1. PARTS의 모든 id에 해당하는 THREE.Group을 root의 자식으로 둘 것
//   2. 각 그룹의 userData에 home(기본 위치)과 mats(소유 머티리얼)를 채울 것
// 스크롤·분해·라벨 코드는 이 계약만 보고 동작하므로 지오메트리 출처와 무관하다.

const GOLD = 0xc9a227
const ALUMINUM = 0xdcdce4
const DARK = 0x35353d

export function buildProbe({ simple = false } = {}) {
  const root = new THREE.Group()
  const geometries = []
  const materials = []

  function mat(opts) {
    const params = { ...opts, transparent: true }
    if (simple) {
      delete params.clearcoat
      delete params.clearcoatRoughness
      delete params.sheen
    }
    const m = simple
      ? new THREE.MeshStandardMaterial(params)
      : new THREE.MeshPhysicalMaterial(params)
    materials.push(m)
    return m
  }

  function geo(g) {
    geometries.push(g)
    return g
  }

  const foil = () =>
    mat({ color: GOLD, metalness: 1, roughness: 0.36, clearcoat: 0.35, clearcoatRoughness: 0.55 })
  const metal = (roughness = 0.2) =>
    mat({ color: ALUMINUM, metalness: 0.95, roughness })
  const structure = () => mat({ color: DARK, metalness: 0.75, roughness: 0.55 })

  function part(id, build) {
    const g = new THREE.Group()
    g.name = id
    build(g)
    root.add(g)
    return g
  }

  // ── BUS — 10면체 코어 ─────────────────────────────────────────────
  part('bus', (g) => {
    const body = new THREE.Mesh(geo(new THREE.CylinderGeometry(1.05, 1.05, 0.66, 10)), foil())
    g.add(body)
    for (const y of [0.36, -0.36]) {
      const ring = new THREE.Mesh(geo(new THREE.CylinderGeometry(1.1, 1.1, 0.07, 10)), structure())
      ring.position.y = y
      g.add(ring)
    }
    const stem = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 12)), metal(0.35))
    stem.position.y = 0.62
    g.add(stem)
  })

  // ── HIGH-GAIN ANTENNA — 파라볼릭 디시 ─────────────────────────────
  part('dish', (g) => {
    const pts = []
    for (let i = 0; i <= 16; i++) {
      const r = 0.16 + (1.9 - 0.16) * (i / 16)
      pts.push(new THREE.Vector2(r, 0.22 * r * r))
    }
    const face = new THREE.Mesh(geo(new THREE.LatheGeometry(pts, 48)), metal(0.14))
    face.material.side = THREE.DoubleSide
    g.add(face)

    const rim = new THREE.Mesh(geo(new THREE.TorusGeometry(1.9, 0.035, 8, 56)), structure())
    rim.rotation.x = Math.PI / 2
    rim.position.y = 0.22 * 1.9 * 1.9
    g.add(rim)

    const horn = new THREE.Mesh(geo(new THREE.ConeGeometry(0.16, 0.36, 14)), foil())
    horn.position.y = 1.12
    horn.rotation.x = Math.PI
    g.add(horn)

    for (let i = 0; i < 3; i++) {
      const a = (Math.PI * 2 * i) / 3
      const strut = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.022, 0.022, 1.6, 6)), structure())
      strut.position.set(Math.cos(a) * 0.78, 0.62, Math.sin(a) * 0.78)
      strut.lookAt(0, 1.12, 0)
      strut.rotateX(Math.PI / 2)
      g.add(strut)
    }
    g.position.y = 1.35
  })

  // ── RTG × 3 ──────────────────────────────────────────────────────
  part('rtg', (g) => {
    const boom = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 8)), structure())
    boom.rotation.z = Math.PI / 2
    boom.position.set(-1.7, -0.1, 0)
    g.add(boom)
    for (let i = 0; i < 3; i++) {
      const can = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.19, 0.19, 1.05, 16)), metal(0.42))
      can.rotation.z = Math.PI / 2
      can.position.set(-2.62 - i * 0.44, -0.12, 0)
      g.add(can)
      const cap = new THREE.Mesh(geo(new THREE.TorusGeometry(0.19, 0.03, 6, 20)), structure())
      cap.rotation.y = Math.PI / 2
      cap.position.set(-2.62 - i * 0.44, -0.12, 0)
      g.add(cap)
    }
  })

  // ── MAGNETOMETER BOOM — 13 m 신축 붐 ──────────────────────────────
  part('mag', (g) => {
    const rod = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.035, 0.035, 4.4, 6)), structure())
    rod.rotation.z = Math.PI / 2
    rod.position.set(3.1, 0.12, 0)
    g.add(rod)
    for (let i = 1; i <= 4; i++) {
      const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(0.075, 0.018, 6, 14)), metal(0.5))
      ring.rotation.y = Math.PI / 2
      ring.position.set(1.5 + i * 0.8, 0.12, 0)
      g.add(ring)
    }
    const tip = new THREE.Mesh(geo(new THREE.BoxGeometry(0.2, 0.2, 0.2)), foil())
    tip.position.set(5.2, 0.12, 0)
    g.add(tip)
  })

  // ── IMAGING PLATFORM ─────────────────────────────────────────────
  part('sci', (g) => {
    const arm = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8)), structure())
    arm.rotation.z = Math.PI / 3.2
    arm.position.set(0.5, -0.5, 0.24)
    g.add(arm)

    const box = new THREE.Mesh(geo(new THREE.BoxGeometry(0.62, 0.46, 0.54)), foil())
    box.position.set(0.95, -0.92, 0.4)
    g.add(box)

    for (const [dz, r] of [[0.16, 0.14], [-0.16, 0.1]]) {
      const lens = new THREE.Mesh(geo(new THREE.CylinderGeometry(r, r, 0.5, 18)), metal(0.16))
      lens.rotation.z = Math.PI / 2
      lens.position.set(1.5, -0.92, 0.4 + dz)
      g.add(lens)
    }
  })

  // ── GOLDEN RECORD ────────────────────────────────────────────────
  part('rec', (g) => {
    const disc = new THREE.Mesh(
      geo(new THREE.CylinderGeometry(0.44, 0.44, 0.03, 40)),
      mat({ color: 0xe8c063, metalness: 1, roughness: 0.08, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
    )
    disc.rotation.x = Math.PI / 2
    disc.position.set(-0.5, -0.12, 1.02)
    g.add(disc)

    const hub = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16)), structure())
    hub.rotation.x = Math.PI / 2
    hub.position.set(-0.5, -0.12, 1.04)
    g.add(hub)
  })

  // 부품별 기본 위치·소유 머티리얼·라벨 앵커를 기록한다. 스크롤 코드는 이
  // 세 값만 읽는다.
  //
  // anchor는 그룹 원점 기준의 국소 오프셋이다. rtg나 mag처럼 그룹 원점이
  // (0,0,0)이고 메시만 멀리 떨어져 있는 부품은 그룹 위치를 그대로 투영하면
  // 라벨이 탐사선 한가운데 겹쳐 버리므로, 바운딩 박스 중심을 앵커로 쓴다.
  const parts = new Map()
  for (const meta of PARTS) {
    const g = root.getObjectByName(meta.id)
    if (!g) continue
    const mats = new Set()
    g.traverse((o) => {
      if (o.material) mats.add(o.material)
    })
    const center = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3())
    g.userData.home = g.position.clone()
    g.userData.explode = new THREE.Vector3(...meta.explode)
    g.userData.anchor = center.sub(g.position)
    g.userData.mats = [...mats]
    parts.set(meta.id, g)
  }

  return {
    root,
    parts,
    dispose() {
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
    },
  }
}
