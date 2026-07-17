import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { latLngToVector3, vector3ToLatLng } from './geo.js'
import { loadLandDots } from './landDots.js'
import landMaskUrl from '../../assets/earth-land-mask.png'

const GLOBE_R = 1
const PIN_R = 1.03
const INTRO_MS = 1800
const PIN_SCALE = 0.06
const LATEST_SCALE = 0.1

function makeGlowTexture(inner, outer) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, inner)
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function makePinSprite(texture, entry) {
  const material = new THREE.SpriteMaterial({
    map: texture,
    blending: THREE.AdditiveBlending,
    depthWrite: false, // 구가 depth를 쓰므로 뒷면 핀은 자동으로 가려진다
    transparent: true,
  })
  const sprite = new THREE.Sprite(material)
  const [x, y, z] = latLngToVector3(entry.lat, entry.lng, PIN_R)
  sprite.position.set(x, y, z)
  sprite.scale.setScalar(PIN_SCALE)
  sprite.userData.entry = entry
  return sprite
}

export default function GuestbookGlobe({ entries, tempPin, onPickLocation, onPickPin }) {
  const mountRef = useRef(null)
  const stateRef = useRef(null)
  // 콜백을 ref로 들고 있어 장면 재구성 없이 최신 콜백을 쓴다
  const callbacksRef = useRef({})
  useEffect(() => {
    callbacksRef.current = { onPickLocation, onPickPin }
  })

  // 장면 구성 (마운트 시 1회)
  useEffect(() => {
    const mount = mountRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 100)
    camera.position.set(0, 0.4, 3.2)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 1.7
    controls.maxDistance = 5
    controls.rotateSpeed = 0.55

    const globe = new THREE.Group()
    scene.add(globe)

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_R, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x0a101f }),
    )
    globe.add(sphere)

    loadLandDots(landMaskUrl, { radius: GLOBE_R + 0.005, step: 2 })
      .then((positions) => {
        if (!stateRef.current) return // 이미 언마운트됨
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        const dots = new THREE.Points(geo, new THREE.PointsMaterial({
          color: 0x7fa8ff,
          size: 0.012,
          transparent: true,
          opacity: 0.85,
        }))
        stateRef.current.landDots = dots
        globe.add(dots)
      })
      .catch(() => {}) // 마스크 로드 실패 시 도트 없이 구만 표시

    const pinGroup = new THREE.Group()
    globe.add(pinGroup)

    const glowTex = makeGlowTexture('rgba(160,200,255,0.9)', 'rgba(80,120,255,0)')
    const tempTex = makeGlowTexture('rgba(255,210,140,0.9)', 'rgba(255,140,60,0)')

    // 클릭과 드래그 회전을 이동 거리로 구분한다
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let downAt = null
    let lastInteract = 0

    const onPointerDown = (e) => {
      downAt = { x: e.clientX, y: e.clientY }
      lastInteract = performance.now()
    }
    const onPointerUp = (e) => {
      lastInteract = performance.now()
      if (!downAt) return
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y)
      downAt = null
      if (moved > 6) return

      const rect = renderer.domElement.getBoundingClientRect()
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)

      const pinHits = raycaster.intersectObjects(pinGroup.children)
      if (pinHits.length > 0) {
        callbacksRef.current.onPickPin?.(pinHits[0].object.userData.entry)
        return
      }
      const sphereHits = raycaster.intersectObject(sphere)
      if (sphereHits.length > 0) {
        const local = globe.worldToLocal(sphereHits[0].point.clone())
        const [lat, lng] = vector3ToLatLng(local.x, local.y, local.z)
        callbacksRef.current.onPickLocation?.(lat, lng)
      }
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', onResize)

    const state = {
      globe, pinGroup, glowTex, tempTex, reduced,
      latestSprite: null, tempSprite: null, intro: null, introPlayed: false, landDots: null,
    }
    stateRef.current = state

    let raf
    const animate = () => {
      raf = requestAnimationFrame(animate)
      const t = performance.now()

      if (state.intro) {
        // 페이지 진입 인트로: 최신 핀이 정면을 향할 때까지 slerp
        const k = Math.min((t - state.intro.start) / INTRO_MS, 1)
        const ease = 1 - Math.pow(1 - k, 3)
        globe.quaternion.slerpQuaternions(state.intro.from, state.intro.to, ease)
        if (k >= 1) state.intro = null
      } else if (!state.reduced && t - lastInteract > 3000) {
        globe.rotateY(0.0009) // 유휴 시 슬로우 스핀
      }

      if (state.latestSprite) {
        state.latestSprite.scale.setScalar(LATEST_SCALE * (1 + 0.22 * Math.sin(t / 320)))
      }
      if (state.tempSprite) {
        state.tempSprite.scale.setScalar(PIN_SCALE * 1.4 * (1 + 0.15 * Math.sin(t / 200)))
      }

      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)

      sphere.geometry.dispose()
      sphere.material.dispose()
      if (state.landDots) {
        state.landDots.geometry.dispose()
        state.landDots.material.dispose()
      }
      glowTex.dispose()
      tempTex.dispose()
      for (const sprite of state.pinGroup.children) {
        sprite.material.dispose()
      }
      if (state.tempSprite) {
        state.tempSprite.material.dispose()
      }

      controls.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      stateRef.current = null
    }
  }, [])

  // entries → 핀 동기화 + 첫 로드 시 인트로 예약
  useEffect(() => {
    const state = stateRef.current
    if (!state) return

    for (const child of [...state.pinGroup.children]) {
      child.material.dispose()
      state.pinGroup.remove(child)
    }
    state.latestSprite = null

    entries.forEach((entry, i) => {
      const sprite = makePinSprite(state.glowTex, entry)
      if (i === 0) {
        sprite.scale.setScalar(LATEST_SCALE)
        state.latestSprite = sprite
      }
      state.pinGroup.add(sprite)
    })

    if (entries.length > 0 && !state.introPlayed && !state.reduced) {
      state.introPlayed = true
      const [x, y, z] = latLngToVector3(entries[0].lat, entries[0].lng, 1)
      state.intro = {
        from: state.globe.quaternion.clone(),
        to: new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(x, y, z).normalize(),
          new THREE.Vector3(0, 0.12, 1).normalize(), // 카메라 방향(살짝 위)
        ),
        start: performance.now(),
      }
    }
  }, [entries])

  // 작성 위치 임시 핀 동기화 (pinGroup 밖에 두어 핀 클릭 레이캐스트에서 제외)
  useEffect(() => {
    const state = stateRef.current
    if (!state) return

    if (state.tempSprite) {
      state.globe.remove(state.tempSprite)
      state.tempSprite.material.dispose()
      state.tempSprite = null
    }
    if (tempPin) {
      const sprite = makePinSprite(state.tempTex, tempPin)
      sprite.userData.entry = null
      state.globe.add(sprite)
      state.tempSprite = sprite
    }
  }, [tempPin])

  return <div ref={mountRef} className="gb-canvas" />
}
