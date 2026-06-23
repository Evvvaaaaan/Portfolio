import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import '../shared/exp.css'

// Helper to generate glowing canvas textures of '0' and '1'
function makeCharTexture(char, color = '#00f3ff', size = 64) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  ctx.font = `bold ${size * 0.72}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  
  // Outer glow
  ctx.shadowColor = color
  ctx.shadowBlur = 12
  ctx.fillStyle = color
  ctx.fillText(char, size / 2, size / 2)
  
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// 21x21 grid representing a complex digital maze.
// 1 = solid binary wall, 0 = walkable path
// The player starts at top-left: row 1, col 1.
// The maze exit at the bottom-right (rows 16-19, cols 11-19) opens into a vast cosmic void.
const MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,0,1],
  [1,0,1,0,0,0,1,0,1,0,0,0,1,0,1,0,0,0,1,0,1],
  [1,1,1,1,1,1,1,0,1,1,1,1,1,0,1,1,1,1,1,0,1],
  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,0,1,0,1,0,1,0,1,1,1,0,1,0,1,1,1],
  [1,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0,0,0,1],
  [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1,0,1,1,1,0,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,1,0,1,0,0,0,1,0,1],
  [1,1,1,1,1,0,1,0,1,1,1,0,1,0,1,1,1,0,1,0,1],
  [1,0,0,0,1,0,0,0,1,0,1,0,0,0,1,0,0,0,1,0,1],
  [1,0,1,0,1,1,1,1,1,0,1,1,1,1,1,0,1,1,1,0,1],
  [1,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,0,1,1,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,0,1,0,1,1,1,0,1,0,0,0,0,0,0,0,0,0,1], // Space Zone begins here (cols 11-19 are open)
  [1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,1], // Space Zone
  [1,0,1,1,1,1,1,0,1,0,1,0,0,0,0,0,0,0,0,0,1], // Space Zone
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1], // Space Zone
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1]  // Exit door at (20, 19)
]

const CELL_SIZE = 4.0

export default function BinaryWorld() {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  
  // HUD DOM element refs
  const coordsRef = useRef(null)
  const statusRef = useRef(null)
  const hintRef = useRef(null)
  const crosshairRef = useRef(null)
  const speedRef = useRef(null)

  const speedMultRef = useRef(1.0)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    let raf

    // 1. Scene, Camera, Renderer, Fog
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x010103)
    scene.fog = new THREE.FogExp2(0x010103, 0.015)

    const camera = new THREE.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 0.1, 1000)
    // Start at top-left corner: cell (1, 1) -> coords (-36, 1.8, -36)
    camera.position.set(-36, 1.8, -36)
    camera.rotation.order = 'YXZ'

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)

    // Generate cyan (0) and magenta (1) textures
    const tex0 = makeCharTexture('0', '#00f3ff')
    const tex1 = makeCharTexture('1', '#d946ef')
    const disposables = [tex0, tex1]

    // Floor Cyber Grid
    const gridHelper = new THREE.GridHelper(200, 50, 0xd946ef, 0x0a0f24)
    gridHelper.position.y = 0
    scene.add(gridHelper)

    // Sprite materials (Shared)
    const mat0 = new THREE.SpriteMaterial({ map: tex0, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending })
    const mat1 = new THREE.SpriteMaterial({ map: tex1, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending })
    disposables.push(mat0, mat1)

    // 2. Generate Towering Binary Maze Walls
    const wallSprites = []
    
    for (let r = 0; r < MAP.length; r++) {
      for (let c = 0; c < MAP[r].length; c++) {
        if (MAP[r][c] === 1) {
          const cx = (c - 10) * CELL_SIZE
          const cz = (r - 10) * CELL_SIZE

          // Spawn vertical columns of binary digits rising high into the sky (up to 15 meters)
          // Spaced densely inside the 4x4x15 space
          const wallDigitsCount = 35
          for (let i = 0; i < wallDigitsCount; i++) {
            const isOne = Math.random() > 0.5
            const sprite = new THREE.Sprite(isOne ? mat1 : mat0)
            
            const rx = cx + (Math.random() - 0.5) * (CELL_SIZE * 0.9)
            const rz = cz + (Math.random() - 0.5) * (CELL_SIZE * 0.9)
            const ry = Math.random() * 14.5 + 0.1 // Tall heights up to 14.6m

            sprite.position.set(rx, ry, rz)
            
            const baseScale = 1.0 + Math.random() * 0.4
            sprite.scale.setScalar(baseScale)

            // Dynamic properties for vertical scrolling & base values
            sprite.userData = {
              baseScale: baseScale,
              speed: 0.8 + Math.random() * 1.6,
              yMin: 0.1,
              yMax: 14.6
            }

            scene.add(sprite)
            wallSprites.push(sprite)
          }
        }
      }
    }

    // 3. Cosmic Space Void (At the end of the maze: rows 16-19, cols 11-19)
    // Spawn floating orbit stars & binary codes ascending high (up to 30 meters)
    const spaceSprites = []
    const starTex = makeCharTexture('+', '#ffffff', 32)
    const starMat = new THREE.SpriteMaterial({ map: starTex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending })
    disposables.push(starTex, starMat)

    for (let i = 0; i < 220; i++) {
      const isOne = Math.random() > 0.5
      const isStar = Math.random() > 0.6
      
      const sprite = new THREE.Sprite(
        isStar ? starMat : (isOne ? mat1 : mat0)
      )

      // Distribute in the bottom-right space zone area
      // cols 11-19 corresponds to X: [4, 36], rows 16-19 corresponds to Z: [24, 36]
      const rx = 4 + Math.random() * 32
      const rz = 24 + Math.random() * 12
      const ry = 0.5 + Math.random() * 28.0 // Towering up to 28m high

      sprite.position.set(rx, ry, rz)
      
      const baseScale = isStar ? 0.3 + Math.random() * 0.3 : 0.8 + Math.random() * 0.5
      sprite.scale.setScalar(baseScale)

      sprite.userData = {
        baseScale: baseScale,
        speed: (Math.random() - 0.5) * 0.3, // slow float
        yMin: 0.5,
        yMax: 28.5,
        driftSpeed: 0.1 + Math.random() * 0.2,
        angle: Math.random() * Math.PI * 2,
        centerX: rx,
        centerZ: rz,
        orbitRadius: 1.5 + Math.random() * 3.5
      }

      scene.add(sprite)
      spaceSprites.push(sprite)
    }

    // Light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.05)
    scene.add(ambientLight)

    // 4. Movement and Input States
    const keys = { w: false, a: false, s: false, d: false, space: false }
    const velocity = new THREE.Vector3()
    let canJump = false

    const onKeyDown = (e) => {
      const k = e.key.toLowerCase()
      if (k === 'w' || k === 'arrowup') keys.w = true
      if (k === 'a' || k === 'arrowleft') keys.a = true
      if (k === 's' || k === 'arrowdown') keys.s = true
      if (k === 'd' || k === 'arrowright') keys.d = true
      if (e.key === ' ') {
        keys.space = true
        e.preventDefault()
      }
      if (e.key === '1') setSpeedMultiplier(0.5)
      if (e.key === '2') setSpeedMultiplier(1.0)
      if (e.key === '3') setSpeedMultiplier(2.0)
      if (e.key === '4') setSpeedMultiplier(4.0)
    }

    const onKeyUp = (e) => {
      const k = e.key.toLowerCase()
      if (k === 'w' || k === 'arrowup') keys.w = false
      if (k === 'a' || k === 'arrowleft') keys.a = false
      if (k === 's' || k === 'arrowdown') keys.s = false
      if (k === 'd' || k === 'arrowright') keys.d = false
      if (e.key === ' ') keys.space = false
    }

    const setSpeedMultiplier = (mult) => {
      speedMultRef.current = mult
      if (speedRef.current) {
        speedRef.current.textContent = `SPEED_MULT: [${mult.toFixed(1)}x] (Key: 1/2/3/4)`
      }
    }

    // PointerLock mouse look
    const onMouseMove = (e) => {
      if (document.pointerLockElement !== container) return
      const speed = 0.0022
      camera.rotation.y -= e.movementX * speed
      camera.rotation.x -= e.movementY * speed
      camera.rotation.x = Math.max(-Math.PI / 2.05, Math.min(Math.PI / 2.05, camera.rotation.x))
    }

    const onLockChange = () => {
      const locked = document.pointerLockElement === container
      if (statusRef.current) {
        statusRef.current.textContent = locked ? 'STATUS: 探索(EXPLORE) - ACTIVE' : 'STATUS: 대기(STANDBY)'
        statusRef.current.style.color = locked ? '#00f3ff' : '#d946ef'
      }
      if (hintRef.current) {
        hintRef.current.style.display = locked ? 'none' : 'flex'
      }
      if (crosshairRef.current) {
        crosshairRef.current.style.display = locked ? 'block' : 'none'
      }
    }

    const onPointerDown = () => {
      container.requestPointerLock()
    }

    container.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerlockchange', onLockChange)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)

    // Handle viewport resize
    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    // 5. Update Loop Solver
    const clock = new THREE.Clock()
    const playerRadius = 0.75
    const floorHeight = 1.8

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(clock.getDelta(), 0.1)

      const playerPos = camera.position

      // A. Dynamic Proximity-based Rendering & Wall Scrolling
      // Only scale up and display sprites near the player
      const maxRenderDist = 30.0
      const fadeStartDist = 15.0
      
      wallSprites.forEach((sprite) => {
        const ud = sprite.userData
        
        // Scroll vertically
        sprite.position.y -= ud.speed * dt
        if (sprite.position.y < ud.yMin) {
          sprite.position.y = ud.yMax
        }

        const dist = playerPos.distanceTo(sprite.position)
        if (dist < maxRenderDist) {
          sprite.visible = true
          // Scale based on distance (shrinks into a point as it goes further away)
          if (dist < fadeStartDist) {
            sprite.scale.setScalar(ud.baseScale)
          } else {
            const factor = 1 - (dist - fadeStartDist) / (maxRenderDist - fadeStartDist)
            sprite.scale.setScalar(ud.baseScale * factor)
          }
        } else {
          sprite.visible = false
        }
      })

      // B. Animate Space Void particles (orbiting and floating upwards)
      spaceSprites.forEach((sprite) => {
        const ud = sprite.userData
        sprite.position.y += ud.speed * dt
        if (sprite.position.y > ud.yMax) {
          sprite.position.y = ud.yMin
        }
        
        ud.angle += ud.driftSpeed * dt
        sprite.position.x = ud.centerX + Math.cos(ud.angle) * ud.orbitRadius
        sprite.position.z = ud.centerZ + Math.sin(ud.angle) * ud.orbitRadius

        // Proximity scaling also applies to space sprites
        const dist = playerPos.distanceTo(sprite.position)
        if (dist < maxRenderDist) {
          sprite.visible = true
          if (dist < fadeStartDist) {
            sprite.scale.setScalar(ud.baseScale)
          } else {
            const factor = 1 - (dist - fadeStartDist) / (maxRenderDist - fadeStartDist)
            sprite.scale.setScalar(ud.baseScale * factor)
          }
        } else {
          sprite.visible = false
        }
      })

      // C. FPS Movement and Collision physics
      velocity.y -= 7.5 * dt

      const moveDirection = new THREE.Vector3()
      if (keys.w) moveDirection.z -= 1
      if (keys.s) moveDirection.z += 1
      if (keys.a) moveDirection.x -= 1
      if (keys.d) moveDirection.x += 1
      moveDirection.normalize()

      const baseMoveSpeed = 5.6
      const moveSpeed = baseMoveSpeed * speedMultRef.current
      const camYaw = camera.rotation.y
      
      const forwardVec = new THREE.Vector3(
        moveDirection.x * Math.cos(camYaw) + moveDirection.z * Math.sin(camYaw),
        0,
        -moveDirection.x * Math.sin(camYaw) + moveDirection.z * Math.cos(camYaw)
      ).normalize().multiplyScalar(moveSpeed)

      velocity.x = forwardVec.x
      velocity.z = forwardVec.z

      if (keys.space && canJump) {
        velocity.y = 4.8
        canJump = false
      }

      camera.position.x += velocity.x * dt
      camera.position.y += velocity.y * dt
      camera.position.z += velocity.z * dt

      // Ground collision
      if (camera.position.y < floorHeight) {
        camera.position.y = floorHeight
        velocity.y = 0
        canJump = true
      }

      // 2D grid cell wall collision solver (AABB corner pushback)
      const pX = camera.position.x
      const pZ = camera.position.z
      const buffer = playerRadius + 0.15

      // Grid index offset (+10.5 because center cell of 21x21 grid is 10)
      const playerCol = Math.floor((pX / CELL_SIZE) + 10.5)
      const playerRow = Math.floor((pZ / CELL_SIZE) + 10.5)

      for (let r = playerRow - 1; r <= playerRow + 1; r++) {
        for (let c = playerCol - 1; c <= playerCol + 1; c++) {
          if (r < 0 || r >= MAP.length || c < 0 || c >= MAP[0].length) continue
          if (MAP[r][c] === 1) {
            const wallX = (c - 10) * CELL_SIZE
            const wallZ = (r - 10) * CELL_SIZE
            
            const closestX = Math.max(wallX - CELL_SIZE / 2, Math.min(pX, wallX + CELL_SIZE / 2))
            const closestZ = Math.max(wallZ - CELL_SIZE / 2, Math.min(pZ, wallZ + CELL_SIZE / 2))
            
            const dx = pX - closestX
            const dz = pZ - closestZ
            const dist = Math.sqrt(dx * dx + dz * dz)
            
            if (dist < buffer && dist > 0.001) {
              const pushX = (dx / dist) * (buffer - dist)
              const pushZ = (dz / dist) * (buffer - dist)
              camera.position.x += pushX
              camera.position.z += pushZ
            }
          }
        }
      }

      // Update coordinates readout directly in DOM
      if (coordsRef.current) {
        coordsRef.current.textContent = `LOC_COORD: X:[${camera.position.x.toFixed(2)}] Y:[${camera.position.y.toFixed(2)}] Z:[${camera.position.z.toFixed(2)}]`
      }

      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(tick)

    // Clean up
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      container.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerlockchange', onLockChange)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onMouseMove)
      
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
      })
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
    }
  }, [])

  return (
    <div className="exp-wrap" ref={containerRef} style={{ position: 'relative', cursor: 'pointer' }}>
      
      {/* 3D WebGL Canvas */}
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* 1st Person HUD Overlay */}
      <div style={{
        position: 'absolute',
        top: 24,
        left: 24,
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#00f3ff',
        textShadow: '0 0 8px rgba(0,243,255,0.4)',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        zIndex: 10
      }}>
        <div style={{ fontWeight: 'bold', letterSpacing: '0.1em' }}>BINARY_ARCHIVE_NODE.00</div>
        <div ref={statusRef} style={{ color: '#d946ef', textShadow: '0 0 8px rgba(217,70,239,0.4)' }}>
          STATUS: 대기(STANDBY)
        </div>
        <div ref={coordsRef}>
          LOC_COORD: X:[-36.00] Y:[1.80] Z:[-36.00]
        </div>
        <div ref={speedRef} style={{ color: '#f59e0b', textShadow: '0 0 8px rgba(245,158,11,0.4)' }}>
          SPEED_MULT: [1.0x] (Key: 1/2/3/4)
        </div>
      </div>

      <div style={{
        position: 'absolute',
        bottom: 24,
        right: 24,
        fontFamily: 'monospace',
        fontSize: '11px',
        color: 'rgba(255,255,255,0.4)',
        pointerEvents: 'none',
        zIndex: 10,
        textAlign: 'right'
      }}>
        W-A-S-D: 이동 · SPACE: 점프 · 1/2/3/4: 속도 조절
      </div>

      {/* Screen crosshair */}
      <div
        ref={crosshairRef}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: '#00f3ff',
          boxShadow: '0 0 10px #00f3ff',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 10,
          display: 'none'
        }}
      />

      {/* Click-to-lock screen overlay */}
      <div
        ref={hintRef}
        className="exp-hint"
        style={{
          pointerEvents: 'none',
          background: 'rgba(2,2,6,0.88)',
          padding: '20px 32px',
          borderRadius: '16px',
          border: '1px solid rgba(0,243,255,0.25)',
          boxShadow: '0 0 30px rgba(0,243,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center'
        }}
      >
        <span style={{ color: '#00f3ff', fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.05em' }}>
          화면을 클릭하여 1인칭 가상 공간에 입장하세요
        </span>
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '8px', lineHeight: '1.5' }}>
          W-A-S-D : 이동 · Space : 점프 · 마우스 : 방향 보기 <br />
          속도 단축키 : 1(느림) / 2(보통) / 3(빠름) / 4(매우빠름) <br />
          Esc 키를 누르면 원래 시점으로 돌아옵니다
        </span>
      </div>
    </div>
  )
}
