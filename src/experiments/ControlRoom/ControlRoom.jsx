import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js'
import { dampFactor } from '../../components/SpaceBackground/damping.js'
import '../shared/exp.css'
import './ControlRoom.css'

// 실제로 동작하는 페이지 네 개를 CSS3DRenderer로 3D 공간 속 모니터에 그대로
// 얹는다. WebGL은 베젤·조명·바닥만 그리고, 화면 안쪽은 진짜 살아있는 iframe —
// 스크린샷이 아니라 각자 따로 시간이 흐르는 페이지다. 두 렌더러를 같은
// 카메라로 겹쳐 그리므로, WebGL 캔버스를 투명하게 비워두면 그 구멍으로
// CSS3D 레이어(화면)가 비치고, 베젤은 그 구멍 가장자리를 감싼다.

const SCREENS = [
  { id: 'home', label: 'HOME', path: '/', title: 'Portfolio main page', color: 0x8fa8ff },
  { id: 'lab', label: 'LAB', path: '/gallery', title: 'Lab gallery', color: 0xc084fc },
  { id: 'guestbook', label: 'GUEST', path: '/guestbook', title: 'Guestbook', color: 0x5eead4 },
  { id: 'project', label: 'FINDX', path: '/projects/findx', title: 'Project — FindX', color: 0xffb454 },
]

const SCREEN_W = 3.6
const SCREEN_H = 2.0
const DOM_W = 480 // CSS px — 실제 iframe 해상도. worldWidth/DOM_W가 CSS3DObject 스케일이 된다.
const DOM_H = Math.round((DOM_W * SCREEN_H) / SCREEN_W)
const ARC_RADIUS = 8.6
const ARC_SPREAD = 92 // deg, 전체 부채꼴 — 화면 폭보다 현이 커야 이웃 화면과 안 겹친다
const SCREEN_Y = 2.0
const FRAME_THICK = 0.16
const FRAME_DEPTH = 0.16

function makeScreen(def, index) {
  const angle = THREE.MathUtils.degToRad(
    -ARC_SPREAD / 2 + (ARC_SPREAD / (SCREENS.length - 1)) * index
  )
  const x = Math.sin(angle) * ARC_RADIUS
  const z = -Math.cos(angle) * ARC_RADIUS

  const group = new THREE.Group()
  group.position.set(x, SCREEN_Y, z)
  group.rotation.y = angle

  // 후광 — 프레임보다 한 겹 크게, 뒤로 살짝 물려 가장자리만 삐져나온다.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN_W + 0.6, SCREEN_H + 0.6),
    new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.28 })
  )
  glow.position.z = -0.19
  group.add(glow)

  // 프레임 — 화면 네 변을 감싸는 얇은 테두리 네 개. 가운데는 아예 지오메트리가
  // 없는 진짜 구멍이라, 그 자리에서 WebGL이 비워둔 픽셀로 CSS3D 레이어(화면)가
  // 그대로 비친다. 통짜 상자로 만들면 화면 전체를 덮어버려 늘 새까맣게 보인다.
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.6, metalness: 0.3 })
  const halfW = SCREEN_W / 2
  const halfH = SCREEN_H / 2
  const strips = [
    { w: SCREEN_W + FRAME_THICK * 2, h: FRAME_THICK, x: 0, y: halfH + FRAME_THICK / 2 },
    { w: SCREEN_W + FRAME_THICK * 2, h: FRAME_THICK, x: 0, y: -halfH - FRAME_THICK / 2 },
    { w: FRAME_THICK, h: SCREEN_H, x: -halfW - FRAME_THICK / 2, y: 0 },
    { w: FRAME_THICK, h: SCREEN_H, x: halfW + FRAME_THICK / 2, y: 0 },
  ]
  for (const s of strips) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, FRAME_DEPTH), frameMat)
    strip.position.set(s.x, s.y, -FRAME_DEPTH / 2 + 0.02)
    group.add(strip)
  }

  // 화면 자리에는 지오메트리가 없어서 두 가지가 동시에 빈다: 뒤쪽 후광이
  // 구멍으로 그대로 새어나와 살아있는 페이지를 통째로 물들이고, 클릭 판정도
  // 없다. colorWrite를 끈 불투명 평면 하나가 둘 다 메운다 — 색은 한 픽셀도
  // 칠하지 않으니(= WebGL 캔버스가 그 자리에 계속 비어 CSS3D 화면이 그대로
  // 비친다) 깊이만 기록해 뒤의 후광을 잘라내고, 그 자체가 레이캐스트 과녁이
  // 된다. 후광과 프레임 앞면 사이에 끼워야 후광만 가리고 테두리는 남는다.
  const aperture = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),
    new THREE.MeshBasicMaterial({ colorWrite: false })
  )
  aperture.position.z = -0.1
  group.add(aperture)

  const el = document.createElement('div')
  el.className = 'control-room-screen'
  el.style.width = `${DOM_W}px`
  el.style.height = `${DOM_H}px`
  const iframe = document.createElement('iframe')
  iframe.src = def.path
  iframe.title = `Evan portfolio — ${def.title}`
  iframe.loading = 'lazy'
  el.appendChild(iframe)

  const cssObject = new CSS3DObject(el)
  const scale = SCREEN_W / DOM_W
  cssObject.scale.set(scale, scale, scale)
  cssObject.position.set(x, SCREEN_Y, z)
  cssObject.rotation.y = angle

  const light = new THREE.PointLight(def.color, 5, 6, 2)
  light.position.set(x + Math.sin(angle) * 1.4, 0.6, z - Math.cos(angle) * 1.4)

  // 화면이 실제로 바라보는 방향. rotation.y = angle이 평면의 기본 법선 +z를
  // 여기로 돌려놓는다. 원점에서 화면을 잇는 반지름 방향(sin, 0, -cos)과는
  // z 부호가 다르다 — 그쪽을 쓰면 카메라가 화면 뒤로 날아가 등짝을 본다.
  const facing = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle))

  return { def, group, aperture, cssObject, light, worldPos: new THREE.Vector3(x, SCREEN_Y, z), facing }
}

export default function ControlRoom() {
  const wrapRef = useRef(null)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(52, wrap.clientWidth / wrap.clientHeight, 0.1, 200)
    camera.position.set(0, 3.4, 10.5)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(wrap.clientWidth, wrap.clientHeight)
    renderer.domElement.className = 'control-room-gl'

    const cssRenderer = new CSS3DRenderer()
    cssRenderer.setSize(wrap.clientWidth, wrap.clientHeight)
    cssRenderer.domElement.className = 'control-room-css'

    // CSS3D 레이어를 먼저 깔고 WebGL을 그 위에 쌓는다 — 위쪽 캔버스가 비어
    // 있는 자리마다 아래 레이어(화면)가 그대로 비친다.
    wrap.appendChild(cssRenderer.domElement)
    wrap.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0x1a2030, 0.9))
    const key = new THREE.DirectionalLight(0x8fa8ff, 0.35)
    key.position.set(-4, 8, 4)
    scene.add(key)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: 0.85, metalness: 0.1 })
    )
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)

    const screens = SCREENS.map(makeScreen)
    const focusables = []
    for (const s of screens) {
      scene.add(s.group)
      scene.add(s.cssObject)
      scene.add(s.light)
      focusables.push(s.aperture) // 화면 넓이 전체가 클릭 과녁이다
      s.aperture.userData.screen = s
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 3.5
    controls.maxDistance = 15
    controls.maxPolarAngle = Math.PI / 2 - 0.03
    controls.target.set(0, SCREEN_Y, -3)
    controls.update()

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downPos = null
    const onPointerDown = (e) => {
      downPos = { x: e.clientX, y: e.clientY }
    }
    const onPointerUp = (e) => {
      if (!downPos) return
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y)
      downPos = null
      if (moved > 6) return // 드래그(궤도 회전) 끝은 클릭으로 치지 않는다

      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(focusables, false)[0]
      if (hit) focusScreen(hit.object.userData.screen)
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    let focusTargetPos = null
    let focusCamPos = null
    const focusScreen = (s) => {
      focusTargetPos = s.worldPos.clone()
      focusCamPos = s.worldPos.clone().addScaledVector(s.facing, 4.6).setY(s.worldPos.y)
    }

    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      cssRenderer.setSize(w, h)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    let raf
    let prevMs = null
    const nextTargetVec = new THREE.Vector3()
    const nextCamVec = new THREE.Vector3()
    const tick = (nowMs) => {
      const dtMs = prevMs === null ? 16.7 : Math.min(nowMs - prevMs, 50)
      prevMs = nowMs

      if (focusTargetPos) {
        const k = dampFactor(0.12, dtMs)
        nextTargetVec.copy(controls.target).lerp(focusTargetPos, k)
        controls.target.copy(nextTargetVec)
        nextCamVec.copy(camera.position).lerp(focusCamPos, k)
        camera.position.copy(nextCamVec)
      }

      controls.update()
      renderer.render(scene, camera)
      cssRenderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) o.material.dispose()
      })
      renderer.dispose()
      wrap.removeChild(renderer.domElement)
      wrap.removeChild(cssRenderer.domElement)
    }
  }, [])

  return (
    <div className="control-room-exp" ref={wrapRef}>
      <aside className="control-room-notes">
        <span className="cr-kicker">Broadcast desk</span>
        <p>Four live pages, mounted on real monitors in one room.</p>
        <p>Drag to look around. Click a screen to walk up to it.</p>
      </aside>
    </div>
  )
}
