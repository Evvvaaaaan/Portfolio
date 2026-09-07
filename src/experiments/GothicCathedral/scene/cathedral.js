import * as THREE from 'three'

// 고딕 대성당을 규칙에서 세운다. 모델 파일은 하나도 쓰지 않는다 — 베이(bay)
// 하나의 치수에서 기둥·아치·볼트·창이 전부 파생되고, 그 베이를 반복해 신랑을
// 만든 뒤 서쪽 정면과 부축벽을 붙이는 순서다. 실제 고딕 성당이 지어진 순서와
// 같은 순서로 코드가 흐른다.

// ── 첨두아치 ─────────────────────────────────────────────────────────
// 두 개의 원호가 정점에서 만나는 곡선. 스프링잉선 위 ±d에 중심이 있고
// 반지름은 R = span/2 + d다. 정점 높이 H가 주어지면 d가 닫힌 형태로 나온다:
//   H² = R² - d² = (span/2 + d)² - d² = span²/4 + span·d
// 반원(H = span/2)이면 d = 0이 되어 로마네스크 아치로 돌아간다 — 고딕을
// 고딕이게 하는 건 이 d다.
export function pointedArch(span, rise) {
  const d = (rise * rise - (span * span) / 4) / span
  const R = span / 2 + d
  return {
    d,
    R,
    // 중심에서 u만큼 떨어진 곳의 높이
    at(u) {
      const t = Math.abs(u) + d
      return Math.sqrt(Math.max(R * R - t * t, 0))
    },
  }
}

// 아치를 3차원 점열로. axis는 아치가 걸쳐지는 방향.
export function archPoints(axis, span, rise, center, segs = 48) {
  const arch = pointedArch(span, rise)
  const pts = []
  for (let i = 0; i <= segs; i++) {
    const u = -span / 2 + (span * i) / segs
    const y = arch.at(u)
    pts.push(
      axis === 'x'
        ? new THREE.Vector3(center.x + u, center.y + y, center.z)
        : new THREE.Vector3(center.x, center.y + y, center.z + u),
    )
  }
  return pts
}

// 단면 사각형을 곡선을 따라 밀어낸다 — 아치의 돌 부재가 된다.
function sweep(points, w, h, steps = 64) {
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2, -h / 2)
  shape.lineTo(w / 2, -h / 2)
  shape.lineTo(w / 2, h / 2)
  shape.lineTo(-w / 2, h / 2)
  shape.closePath()
  const path = new THREE.CatmullRomCurve3(points)
  return new THREE.ExtrudeGeometry(shape, { extrudePath: path, steps, bevelEnabled: false })
}

// ── 리브 볼트 ────────────────────────────────────────────────────────
// 교차볼트는 배럴볼트 두 개가 만나 생기는 공간의 천장이다. 두 볼륨의 교집합
// 이므로 천장 높이는 두 배럴 천장 중 "낮은 쪽"이다. 이 정의 하나로 웹 곡면과
// 대각 리브가 동시에 결정된다 — 리브를 따로 배치할 필요 없이, 두 높이가
// 같아지는 선이 곧 대각선이라 리브가 곡면 위에 정확히 얹힌다.
export function vaultHeight(x, z, a, b, riseA, riseB) {
  const ax = pointedArch(a, riseA)
  const az = pointedArch(b, riseB)
  return Math.min(ax.at(x), az.at(z))
}

function vaultWebGeometry(a, b, riseA, riseB, segs = 30) {
  const pos = []
  const idx = []
  for (let i = 0; i <= segs; i++) {
    const x = -a / 2 + (a * i) / segs
    for (let j = 0; j <= segs; j++) {
      const z = -b / 2 + (b * j) / segs
      pos.push(x, vaultHeight(x, z, a, b, riseA, riseB), z)
    }
  }
  const row = segs + 1
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < segs; j++) {
      const p = i * row + j
      idx.push(p, p + 1, p + row, p + 1, p + row + 1, p + row)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

// 대각 리브: 곡면 위를 그대로 따라간다.
function diagonalRibPoints(a, b, riseA, riseB, sign, segs = 40) {
  const pts = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const x = -a / 2 + a * t
    const z = sign * (-b / 2 + b * t)
    pts.push(new THREE.Vector3(x, vaultHeight(x, z, a, b, riseA, riseB), z))
  }
  return pts
}

// ── 부재 만들기 도우미 ───────────────────────────────────────────────
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)

// 다발기둥: 굵은 심주 하나에 가는 부주 여러 개가 붙는다. 고딕 내부가
// 수직으로 읽히는 건 이 부주들이 만드는 세로선 때문이다.
function compoundPier(height, r = 1.0, shafts = 8) {
  const parts = []
  parts.push({ geo: box(r * 3.1, 0.5, r * 3.1), pos: [0, 0.25, 0] })
  parts.push({ geo: box(r * 2.7, 0.4, r * 2.7), pos: [0, 0.68, 0] })
  parts.push({
    geo: new THREE.CylinderGeometry(r, r * 1.06, height - 1.6, 16),
    pos: [0, 0.88 + (height - 1.6) / 2, 0],
  })
  for (let i = 0; i < shafts; i++) {
    const a = (i / shafts) * Math.PI * 2
    parts.push({
      geo: new THREE.CylinderGeometry(r * 0.3, r * 0.3, height - 2.2, 10),
      pos: [Math.cos(a) * r * 1.12, 0.88 + (height - 2.2) / 2, Math.sin(a) * r * 1.12],
    })
  }
  // 주두(capital): 나팔처럼 벌어지며 아치를 받는다.
  const cap = []
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    cap.push(new THREE.Vector2(r * (1.05 + Math.pow(t, 2.2) * 0.85), t * 1.1))
  }
  parts.push({ geo: new THREE.LatheGeometry(cap, 20), pos: [0, height - 1.3, 0] })
  parts.push({ geo: box(r * 3.0, 0.34, r * 3.0), pos: [0, height - 0.05, 0] })
  return parts
}

// 첨탑(pinnacle): 부축벽과 탑 모서리에 세워 수직선을 잇는다.
function pinnacle(h = 4, r = 0.55) {
  return [
    { geo: box(r * 2.4, h * 0.45, r * 2.4), pos: [0, h * 0.225, 0] },
    { geo: new THREE.ConeGeometry(r * 1.5, h * 0.7, 8), pos: [0, h * 0.45 + h * 0.35, 0] },
  ]
}

// ── 창: 개구부를 둘러싼 석재 + 트레이서리 + 유리 ──────────────────────
// 벽에 구멍을 뚫는 대신 개구부 둘레에 벽 조각을 세운다 — CSG 없이 진짜
// 구멍이 생기고, 창틀·창대·아치머리가 자연스럽게 부재로 남는다.
function lancetWindow({ width, height, rise, mullions, glassColor }) {
  const stone = []
  const glass = []
  const jamb = 0.5

  stone.push({ geo: box(jamb, height, 1.2), pos: [-width / 2 - jamb / 2, height / 2, 0] })
  stone.push({ geo: box(jamb, height, 1.2), pos: [width / 2 + jamb / 2, height / 2, 0] })

  const head = archPoints('x', width + jamb, rise, new THREE.Vector3(0, height, 0), 40)
  stone.push({ geo: sweep(head, 1.2, 0.7, 48), pos: [0, 0, 0], raw: true })

  for (let i = 1; i < mullions; i++) {
    const x = -width / 2 + (width * i) / mullions
    stone.push({ geo: box(0.22, height + rise * 0.55, 0.9), pos: [x, (height + rise * 0.55) / 2, 0] })
  }

  // 유리: 아치머리까지 채운다. 창은 벽이 아니라 빛이라는 게 고딕의 논지다.
  const glassH = height + rise * 0.72
  glass.push({
    geo: new THREE.PlaneGeometry(width, glassH, 4, 10),
    pos: [0, glassH / 2, 0],
    color: glassColor,
  })
  return { stone, glass, top: height + rise }
}

// 장미창: 방사형 트레이서리. 바퀴살 사이마다 다른 색 유리가 들어간다.
function roseWindow({ radius, spokes, palette, rng }) {
  const stone = []
  const glass = []
  stone.push({ geo: new THREE.TorusGeometry(radius, 0.42, 10, 48), pos: [0, 0, 0] })
  stone.push({ geo: new THREE.TorusGeometry(radius * 0.34, 0.26, 8, 32), pos: [0, 0, 0] })
  stone.push({ geo: new THREE.TorusGeometry(radius * 0.68, 0.2, 8, 40), pos: [0, 0, 0] })
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2
    stone.push({
      geo: box(radius * 0.94, 0.24, 0.5),
      pos: [Math.cos(a) * radius * 0.5, Math.sin(a) * radius * 0.5, 0],
      rotZ: a,
    })
    // 바퀴살 끝의 작은 원형 트레이서리(foil)
    stone.push({
      geo: new THREE.TorusGeometry(radius * 0.14, 0.12, 6, 20),
      pos: [Math.cos(a + Math.PI / spokes) * radius * 0.82, Math.sin(a + Math.PI / spokes) * radius * 0.82, 0],
    })
  }
  for (let i = 0; i < spokes; i++) {
    const a0 = (i / spokes) * Math.PI * 2
    const a1 = ((i + 1) / spokes) * Math.PI * 2
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.absarc(0, 0, radius * 0.97, a0, a1, false)
    shape.closePath()
    glass.push({
      geo: new THREE.ShapeGeometry(shape, 12),
      pos: [0, 0, 0],
      color: palette[Math.floor(rng() * palette.length)],
    })
  }
  return { stone, glass }
}

// ── 성당 전체 ────────────────────────────────────────────────────────
export function buildCathedral(params) {
  const {
    bays = 7,
    bayLen = 7.2,
    naveW = 13,
    aisleW = 6.4,
    pierH = 15,
    vaultRise = 0.62,   // 신랑 폭 대비 볼트 라이즈 비율
    palette = ['#c2352f', '#2f5bc4', '#2f9c6a', '#e0a52e', '#8a4bb8'],
    rng = Math.random,
  } = params

  const group = new THREE.Group()
  const disposables = []
  const windows = [] // 빛기둥 계산용 창 목록

  const stone = new THREE.MeshStandardMaterial({ color: 0xe2d7c1, roughness: 0.94, metalness: 0 })
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0xc4b79c, roughness: 0.97, metalness: 0 })
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x9d9483, roughness: 0.86, metalness: 0 })
  const vaultMat = new THREE.MeshStandardMaterial({
    color: 0xc4b79c, roughness: 0.97, metalness: 0, side: THREE.DoubleSide,
  })
  disposables.push(stone, stoneDark, floorMat, vaultMat)

  const glassMats = new Map()
  const glassMaterial = (hex) => {
    if (!glassMats.has(hex)) {
      const c = new THREE.Color(hex)
      const m = new THREE.MeshStandardMaterial({
        color: c,
        emissive: c,
        emissiveIntensity: 0.85,
        roughness: 0.35,
        metalness: 0,
        side: THREE.DoubleSide,
      })
      glassMats.set(hex, m)
      disposables.push(m)
    }
    return glassMats.get(hex)
  }

  const L = bays * bayLen              // 신랑 길이
  const outerZ = naveW / 2 + aisleW    // 측랑 바깥 벽
  // 높이는 아래에서 위로 파생된다: 기둥 → 아케이드 → 트리포리움 → 클리어스토리
  // → 볼트 스프링잉 → 정점. 어느 하나를 독립 상수로 두면 순서가 뒤집혀 볼트가
  // 무너진다.
  const arcadeRise = bayLen * 0.62
  const aisleSpring = pierH * 0.62
  const aisleCrown = aisleSpring + aisleW * 0.55
  const clerBase = pierH + arcadeRise + 3.4
  const naveSpring = clerBase + 11.2
  const naveCrown = naveSpring + naveW * vaultRise
  const add = (geo, mat, pos, rot) => {
    const mesh = new THREE.Mesh(geo, mat)
    if (pos) mesh.position.set(pos[0], pos[1], pos[2])
    if (rot) mesh.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    disposables.push(geo)
    return mesh
  }

  // 바닥 — 석판을 한 장씩 깐다. 미세한 색차가 있어야 돌로 읽힌다.
  // 석판 사이 틈으로 배경이 새지 않도록 아래에 통판을 먼저 깐다.
  add(box(L + bayLen * 3, 0.6, outerZ * 2 + 8), stoneDark, [L / 2 - bayLen, -0.62, 0])
  for (let i = 0; i < bays + 2; i++) {
    for (let j = -3; j <= 3; j++) {
      const w = bayLen * 0.94
      const d = (outerZ * 2) / 7
      const slab = add(box(w, 0.4, d * 0.94), floorMat.clone(), [
        -bayLen + i * bayLen + bayLen / 2, -0.2, j * d,
      ])
      slab.material.color.offsetHSL(0, 0, (rng() - 0.5) * 0.07)
      disposables.push(slab.material)
      slab.castShadow = false
    }
  }

  // ── 기둥: 아케이드(신랑/측랑 경계)와 바깥 벽기둥
  for (let i = 0; i <= bays; i++) {
    const x = i * bayLen
    for (const z of [-naveW / 2, naveW / 2]) {
      for (const part of compoundPier(pierH)) {
        add(part.geo, stone, [x + part.pos[0], part.pos[1], z + part.pos[2]])
      }
    }
    for (const z of [-outerZ, outerZ]) {
      add(box(2.2, aisleCrown - 1.5, 2.2), stoneDark, [x, (aisleCrown - 1.5) / 2, z])
    }
  }

  // ── 아케이드 아치: 기둥과 기둥 사이
  for (let i = 0; i < bays; i++) {
    const cx = i * bayLen + bayLen / 2
    for (const z of [-naveW / 2, naveW / 2]) {
      const pts = archPoints('x', bayLen, arcadeRise, new THREE.Vector3(cx, pierH - 0.1, z), 40)
      add(sweep(pts, 1.4, 1.7, 48), stone)
    }
  }

  // ── 측랑 바깥 벽 + 창
  for (let i = 0; i < bays; i++) {
    const cx = i * bayLen + bayLen / 2
    for (const z of [-outerZ, outerZ]) {
      const sign = Math.sign(z)
      const win = lancetWindow({
        width: bayLen * 0.44,
        height: 6.2,
        rise: 2.4,
        mullions: 2,
        glassColor: palette[Math.floor(rng() * palette.length)],
      })
      const wg = new THREE.Group()
      wg.position.set(cx, 3.2, z)
      wg.rotation.y = sign > 0 ? 0 : Math.PI
      for (const s of win.stone) {
        const m = new THREE.Mesh(s.geo, stone)
        if (!s.raw) m.position.set(s.pos[0], s.pos[1], s.pos[2])
        m.castShadow = true
        wg.add(m)
        disposables.push(s.geo)
      }
      for (const g of win.glass) {
        const m = new THREE.Mesh(g.geo, glassMaterial(g.color))
        m.position.set(g.pos[0], g.pos[1], g.pos[2])
        wg.add(m)
        disposables.push(g.geo)
        windows.push({
          center: new THREE.Vector3(cx, 3.2 + g.pos[1], z),
          width: bayLen * 0.44,
          height: g.geo.parameters.height,
          axis: 'z',
          sign,
          color: g.color,
          revealY: 3.2 + win.top,
        })
      }
      group.add(wg)
      // 창 위아래를 메우는 벽면
      add(box(bayLen, 3.2, 1.0), stoneDark, [cx, 1.6, z])
      add(box(bayLen, 2.4, 1.0), stoneDark, [cx, aisleCrown - 1.2, z])
    }
  }

  // ── 측랑 볼트
  for (let i = 0; i < bays; i++) {
    const cx = i * bayLen + bayLen / 2
    for (const sideZ of [-1, 1]) {
      const cz = sideZ * (naveW / 2 + aisleW / 2)
      const springing = aisleSpring
      const web = vaultWebGeometry(bayLen, aisleW, aisleCrown - springing, (aisleCrown - springing) * 0.9, 18)
      add(web, vaultMat, [cx, springing, cz])
      for (const sign of [1, -1]) {
        const pts = diagonalRibPoints(bayLen, aisleW, aisleCrown - springing, (aisleCrown - springing) * 0.9, sign, 28)
        for (const p of pts) p.add(new THREE.Vector3(cx, springing, cz))
        add(sweep(pts, 0.4, 0.55, 32), stone)
      }
    }
  }

  // ── 트리포리움: 아케이드와 클리어스토리 사이의 낮은 아치 띠
  for (let i = 0; i < bays; i++) {
    const cx = i * bayLen + bayLen / 2
    for (const z of [-naveW / 2 + 0.4, naveW / 2 - 0.4]) {
      for (let k = 0; k < 3; k++) {
        const sx = cx - bayLen / 2 + (bayLen * (k + 0.5)) / 3
        const pts = archPoints('x', bayLen / 3.4, 1.1, new THREE.Vector3(sx, pierH + arcadeRise + 1.4, z), 20)
        add(sweep(pts, 0.5, 0.5, 20), stone)
        add(box(0.5, 2.2, 0.5), stone, [sx - bayLen / 6.8, pierH + arcadeRise + 0.3, z])
      }
    }
  }

  // ── 클리어스토리: 신랑 상부 벽과 큰 창. 여기서 들어온 빛이 바닥까지 닿는다.
  for (let i = 0; i < bays; i++) {
    const cx = i * bayLen + bayLen / 2
    for (const z of [-naveW / 2, naveW / 2]) {
      const sign = Math.sign(z)
      const color = palette[Math.floor(rng() * palette.length)]
      const win = lancetWindow({
        width: bayLen * 0.5,
        height: 7.4,
        rise: 3.0,
        mullions: 3,
        glassColor: color,
      })
      const wg = new THREE.Group()
      wg.position.set(cx, clerBase, z)
      for (const s of win.stone) {
        const m = new THREE.Mesh(s.geo, stone)
        if (!s.raw) m.position.set(s.pos[0], s.pos[1], s.pos[2])
        m.castShadow = true
        wg.add(m)
        disposables.push(s.geo)
      }
      for (const g of win.glass) {
        const m = new THREE.Mesh(g.geo, glassMaterial(g.color))
        m.position.set(g.pos[0], g.pos[1], g.pos[2])
        wg.add(m)
        disposables.push(g.geo)
        windows.push({
          center: new THREE.Vector3(cx, clerBase + g.pos[1], z),
          width: bayLen * 0.5,
          height: g.geo.parameters.height,
          axis: 'z',
          sign,
          color,
          revealY: clerBase + win.top,
        })
      }
      group.add(wg)
      add(box(bayLen, 3.2, 1.0), stone, [cx, clerBase - 1.6, z])
      add(box(bayLen, 2.0, 1.0), stone, [cx, clerBase + 11.4, z])
    }
  }

  // ── 신랑 리브 볼트: 이 성당의 천장
  for (let i = 0; i < bays; i++) {
    const cx = i * bayLen + bayLen / 2
    const riseA = naveCrown - naveSpring
    const riseB = riseA * 0.94
    add(vaultWebGeometry(bayLen, naveW, riseA, riseB, 26), vaultMat, [cx, naveSpring, 0])
    for (const sign of [1, -1]) {
      const pts = diagonalRibPoints(bayLen, naveW, riseA, riseB, sign, 40)
      for (const p of pts) p.add(new THREE.Vector3(cx, naveSpring, 0))
      add(sweep(pts, 0.62, 0.9, 48), stone)
    }
    // 횡단 리브: 베이 경계마다
    const tr = archPoints('z', naveW, riseB, new THREE.Vector3(cx - bayLen / 2, naveSpring, 0), 36)
    add(sweep(tr, 0.7, 1.0, 40), stone)
  }
  {
    const riseB = (naveCrown - naveSpring) * 0.94
    const tr = archPoints('z', naveW, riseB, new THREE.Vector3(L, naveSpring, 0), 36)
    add(sweep(tr, 0.7, 1.0, 40), stone)
  }

  // ── 부벽과 플라잉 버트리스: 볼트가 바깥으로 미는 힘을 땅으로 내려보낸다.
  for (let i = 0; i <= bays; i++) {
    const x = i * bayLen
    for (const sideZ of [-1, 1]) {
      const bz = sideZ * (outerZ + 3.2)
      add(box(2.6, aisleCrown + 3, 3.4), stoneDark, [x, (aisleCrown + 3) / 2, bz])
      for (const part of pinnacle(6.5, 0.7)) {
        add(part.geo, stone, [x + part.pos[0], aisleCrown + 3 + part.pos[1], bz + part.pos[2]])
      }
      // 비량(flyer): 부벽 꼭대기에서 신랑 볼트 스프링잉으로 건너간다.
      const span = Math.abs(bz) - naveW / 2
      const pts = []
      const segs = 26
      for (let k = 0; k <= segs; k++) {
        const t = k / segs
        const z = sideZ * (naveW / 2 + span * (1 - t))
        const y = aisleCrown + 2.4 + (naveSpring - aisleCrown - 2.4) * Math.pow(1 - t, 0.6)
        pts.push(new THREE.Vector3(x, y, z))
      }
      add(sweep(pts, 1.0, 1.3, 32), stoneDark)
    }
  }

  // ── 동쪽 끝: 큰 창 하나로 마무리
  {
    const color = palette[Math.floor(rng() * palette.length)]
    const win = lancetWindow({ width: naveW * 0.62, height: 16, rise: 6, mullions: 4, glassColor: color })
    const wg = new THREE.Group()
    wg.position.set(L + 0.6, 6, 0)
    wg.rotation.y = Math.PI / 2
    for (const s of win.stone) {
      const m = new THREE.Mesh(s.geo, stone)
      if (!s.raw) m.position.set(s.pos[0], s.pos[1], s.pos[2])
      wg.add(m)
      disposables.push(s.geo)
    }
    for (const g of win.glass) {
      const m = new THREE.Mesh(g.geo, glassMaterial(g.color))
      m.position.set(g.pos[0], g.pos[1], g.pos[2])
      wg.add(m)
      disposables.push(g.geo)
      windows.push({
        center: new THREE.Vector3(L + 0.6, 6 + g.pos[1], 0),
        width: naveW * 0.62,
        height: g.geo.parameters.height,
        axis: 'x',
        sign: 1,
        color,
        revealY: 6 + win.top,
      })
    }
    group.add(wg)
    add(box(1.4, naveCrown, naveW + 2), stoneDark, [L + 1.2, naveCrown / 2, 0])
  }

  // ── 서쪽 정면: 장미창 + 쌍탑
  const westX = -1.2
  {
    const rose = roseWindow({ radius: naveW * 0.33, spokes: 12, palette, rng })
    const rg = new THREE.Group()
    rg.position.set(westX, clerBase + 5.5, 0)
    rg.rotation.y = Math.PI / 2
    for (const s of rose.stone) {
      const m = new THREE.Mesh(s.geo, stone)
      m.position.set(s.pos[0], s.pos[1], s.pos[2])
      if (s.rotZ) m.rotation.z = s.rotZ
      rg.add(m)
      disposables.push(s.geo)
    }
    for (const g of rose.glass) {
      const m = new THREE.Mesh(g.geo, glassMaterial(g.color))
      m.position.set(g.pos[0], g.pos[1], g.pos[2] - 0.05)
      rg.add(m)
      disposables.push(g.geo)
    }
    group.add(rg)
    windows.push({
      center: new THREE.Vector3(westX, clerBase + 5.5, 0),
      width: naveW * 0.66,
      height: naveW * 0.66,
      axis: 'x',
      sign: -1,
      color: palette[0],
      revealY: clerBase + 5.5 + naveW * 0.33,
      rose: true,
    })

    // 정면 벽 (장미창 둘레를 비워 둔다)
    add(box(1.4, clerBase + 1.2, naveW + 2), stoneDark, [westX, (clerBase + 1.2) / 2, 0])
    add(box(1.4, 5.0, naveW + 2), stoneDark, [westX, clerBase + 5.5 + naveW * 0.33 + 2.5, 0])
    for (const sideZ of [-1, 1]) {
      add(box(1.4, naveW * 0.7, naveW * 0.17), stoneDark, [
        westX, clerBase + 5.5, sideZ * (naveW * 0.42),
      ])
    }
    // 서쪽 대문: 첨두 포탈
    const portal = archPoints('z', 6.4, 3.4, new THREE.Vector3(westX, 8.2, 0), 32)
    add(sweep(portal, 1.9, 1.2, 36), stone)
  }

  const towerH = naveCrown + 14
  for (const sideZ of [-1, 1]) {
    const tz = sideZ * (naveW / 2 + aisleW / 2)
    add(box(aisleW + 1.4, towerH, aisleW + 1.4), stoneDark, [westX - 2.2, towerH / 2, tz])
    // 종루 개구부 자리의 어두운 띠
    add(box(aisleW + 1.7, 5.5, aisleW * 0.32), stone, [westX - 2.2, towerH - 9, tz])
    add(new THREE.ConeGeometry(aisleW * 0.78, 18, 8), stone, [westX - 2.2, towerH + 9, tz])
    for (const cx of [-1, 1]) {
      for (const cz of [-1, 1]) {
        for (const part of pinnacle(7, 0.6)) {
          add(part.geo, stone, [
            westX - 2.2 + cx * (aisleW * 0.55),
            towerH + part.pos[1],
            tz + cz * (aisleW * 0.55),
          ])
        }
      }
    }
  }

  // ── 지붕: 볼트 위를 덮는 목조 가구. 밖에서 보면 이게 없을 때 볼트가 그대로
  // 노출돼 "짓다 만 건물"로 읽힌다. 신랑은 박공, 측랑은 외쪽 지붕이다.
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.85, metalness: 0.1 })
  disposables.push(roofMat)
  {
    const eave = naveCrown + 1.2
    const ridge = naveCrown + naveW * 0.42
    const slope = Math.hypot(naveW / 2 + 0.8, ridge - eave)
    const pitchAngle = Math.atan2(ridge - eave, naveW / 2 + 0.8)
    for (const sideZ of [-1, 1]) {
      const roof = add(box(L + 2.4, 0.5, slope), roofMat, [
        L / 2, (eave + ridge) / 2, (sideZ * (naveW / 2 + 0.8)) / 2,
      ])
      roof.rotation.x = sideZ * pitchAngle
    }
    // 박공 벽 (동·서 양끝)
    const gable = new THREE.Shape()
    gable.moveTo(-naveW / 2 - 0.8, eave)
    gable.lineTo(naveW / 2 + 0.8, eave)
    gable.lineTo(0, ridge)
    gable.closePath()
    for (const gx of [-0.2, L + 0.2]) {
      const g = new THREE.ExtrudeGeometry(gable, { depth: 1.2, bevelEnabled: false })
      g.rotateY(Math.PI / 2)
      add(g, stoneDark, [gx, 0, 0])
    }

    // 측랑 외쪽 지붕: 신랑 벽에서 바깥 벽으로 흘러내린다.
    const aHigh = clerBase - 1.0
    const aLow = aisleCrown + 1.6
    const aSlope = Math.hypot(aisleW, aHigh - aLow)
    const aAngle = Math.atan2(aHigh - aLow, aisleW)
    for (const sideZ of [-1, 1]) {
      const roof = add(box(L + 2.4, 0.45, aSlope), roofMat, [
        L / 2, (aHigh + aLow) / 2, sideZ * (naveW / 2 + aisleW / 2),
      ])
      roof.rotation.x = -sideZ * aAngle
    }
  }

  // 지면: 밖에서 볼 때 건물이 허공에 뜨지 않도록.
  {
    const ground = add(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({
      color: 0x6f6653, roughness: 1, metalness: 0,
    }), [L / 2, -0.95, 0])
    ground.rotation.x = -Math.PI / 2
    ground.castShadow = false
    disposables.push(ground.material)
  }

  const dims = { L, naveW, aisleW, outerZ, pierH, naveCrown, clerBase, naveSpring, towerH, westX }

  return {
    group,
    windows,
    dims,
    dispose() {
      for (const d of disposables) d.dispose?.()
    },
  }
}
