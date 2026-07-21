import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import '../shared/exp.css'
import './NonEuclideanPortals.css'
import { ROOMS } from './rooms.js'
import { moveVector, resolveMove } from './playerControls.js'
import { Portal } from './Portal.js'
import { PortalManager } from './portalManager.js'
import { crossedPortal, relativePortalMatrix } from './portalMath.js'

const EYE = 1.6
const SPEED = 3.2 // units/sec

export default function NonEuclideanPortals() {
  const wrapRef = useRef()
  const [started, setStarted] = useState(false)
  const [roomLabel, setRoomLabel] = useState('THE SMALL ROOM')
  const apiRef = useRef({})

  useEffect(() => {
    const wrap = wrapRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf

    const camera = new THREE.PerspectiveCamera(72, wrap.clientWidth / wrap.clientHeight, 0.05, 500)
    camera.position.set(0, EYE, 2)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setClearColor(0x0a0a0f)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(wrap.clientWidth, wrap.clientHeight)
    wrap.appendChild(renderer.domElement)

    // Build a scene per room (each with its own lights + portal meshes), and
    // instantiate the manager that renders linked-room views into portal targets.
    const roomScenes = new Map()
    const portalsById = new Map()
    const portalsByRoom = new Map()
    for (const r of Object.values(ROOMS)) {
      const s = new THREE.Scene()
      s.background = new THREE.Color(0x0a0a0f)
      s.fog = new THREE.Fog(0x0a0a0f, 8, 80)
      s.add(new THREE.AmbientLight(0x5560a0, 0.5))
      const dl = new THREE.DirectionalLight(0xffffff, 0.8)
      dl.position.set(4, 10, 6)
      s.add(dl)
      s.add(buildRoomMesh(r))
      const ps = []
      for (const def of r.portals) {
        const p = new Portal(def, r.id)
        s.add(p.mesh)
        portalsById.set(def.id, p)
        ps.push(p)
      }
      portalsByRoom.set(r.id, ps)
      roomScenes.set(r.id, s)
    }
    let currentRoomId = 'small'
    const manager = new PortalManager(renderer, roomScenes, portalsById)

    // Player state.
    const player = { yaw: 0, pitch: 0, pos: new THREE.Vector3(0, EYE, 2) }
    const keys = { f: false, b: false, l: false, r: false }

    const onKey = (down) => (e) => {
      const k = e.code
      if (k === 'KeyW' || k === 'ArrowUp') keys.f = down
      else if (k === 'KeyS' || k === 'ArrowDown') keys.b = down
      else if (k === 'KeyA' || k === 'ArrowLeft') keys.l = down
      else if (k === 'KeyD' || k === 'ArrowRight') keys.r = down
    }
    const kd = onKey(true)
    const ku = onKey(false)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)

    // Mouse look via Pointer Lock; drag-look fallback.
    const onMouse = (e) => {
      if (document.pointerLockElement !== renderer.domElement) return
      player.yaw -= e.movementX * 0.0022
      player.pitch = clamp(player.pitch - e.movementY * 0.0022, -1.3, 1.3)
    }
    document.addEventListener('mousemove', onMouse)

    let dragging = false
    let lastX = 0
    let lastY = 0
    const onDown = (e) => {
      if (document.pointerLockElement === renderer.domElement) return
      dragging = true; lastX = e.clientX; lastY = e.clientY
    }
    const onMove = (e) => {
      if (!dragging) return
      player.yaw -= (e.clientX - lastX) * 0.004
      player.pitch = clamp(player.pitch - (e.clientY - lastY) * 0.004, -1.3, 1.3)
      lastX = e.clientX; lastY = e.clientY
    }
    const onUp = () => { dragging = false }
    renderer.domElement.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    apiRef.current.requestLock = () => renderer.domElement.requestPointerLock?.()?.catch?.(() => {})

    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const clock = new THREE.Clock()
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05)
      const prevPos = player.pos.clone()
      const delta = moveVector(player.yaw, keys, SPEED * dt)
      player.pos = resolveMove(player.pos, delta, ROOMS[currentRoomId].walls)

      // portal traversal: did we cross any portal in the current room?
      for (const portal of (portalsByRoom.get(currentRoomId) || [])) {
        if (crossedPortal(prevPos, player.pos, portal.matrix, portal.def.halfW, portal.def.height)) {
          const exit = portalsById.get(portal.def.link)
          const rel = relativePortalMatrix(portal.matrix, exit.matrix)
          // rebase position
          player.pos.applyMatrix4(rel)
          // rebase yaw: the relative matrix includes a 180° flip
          player.yaw += yawOf(rel)
          currentRoomId = exit.roomId
          setRoomLabel(LABELS[currentRoomId] || currentRoomId.toUpperCase())
          break
        }
      }

      camera.position.copy(player.pos)
      camera.rotation.set(0, 0, 0, 'YXZ')
      camera.rotateY(player.yaw)
      camera.rotateX(player.pitch)

      // render portal destination views, then the current room
      const curScene = roomScenes.get(currentRoomId)
      const curPortals = portalsByRoom.get(currentRoomId) || []
      manager.renderPortalViews(currentRoomId, camera, curPortals)
      renderer.render(curScene, camera)

      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      document.removeEventListener('mousemove', onMouse)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      roomScenes.forEach((s) => {
        s.traverse((o) => {
          if (o.geometry) o.geometry.dispose()
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material]
            mats.forEach((m) => m.dispose())
          }
        })
      })
      portalsById.forEach((p) => p.dispose())
      renderer.dispose()
      if (renderer.domElement.parentNode === wrap) wrap.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div ref={wrapRef} className={`exp-wrap nep-wrap${started ? ' locked' : ''}`}>
      {started && <div className="nep-crosshair" />}
      {started && <div className="nep-roomlabel">{roomLabel}</div>}
      {!started && (
        <div
          className="nep-start"
          onClick={() => { setStarted(true); apiRef.current.requestLock?.() }}
        >
          <h2>NON-EUCLIDEAN PORTALS</h2>
          <p>클릭해 시작 · WASD 이동 · 마우스로 시점</p>
        </div>
      )}
    </div>
  )
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }

const LABELS = { small: 'THE SMALL ROOM', hall: 'IMPOSSIBLE HALL' }

function yawOf(m) {
  // extract yaw (rotation about y) from a rigid matrix
  const e = m.elements
  return Math.atan2(e[8], e[10])
}

// Floor + ceiling + perimeter walls (from room.walls AABBs), matte greyscale.
function buildRoomMesh(room) {
  const g = new THREE.Group()
  const { w, d, h } = room.size
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.95 })
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1c1c26, roughness: 0.9 })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat)
  floor.rotation.x = -Math.PI / 2
  g.add(floor)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat)
  ceil.rotation.x = Math.PI / 2
  ceil.position.y = h
  g.add(ceil)
  for (const wl of room.walls) {
    const bw = wl.max[0] - wl.min[0]
    const bd = wl.max[1] - wl.min[1]
    const box = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bd), wallMat)
    box.position.set((wl.min[0] + wl.max[0]) / 2, h / 2, (wl.min[1] + wl.max[1]) / 2)
    g.add(box)
  }
  return g
}
