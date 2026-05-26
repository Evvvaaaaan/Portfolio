import { useEffect, useRef } from 'react'
import * as THREE from 'three'

function createStarTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64

  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.18, 'rgba(255, 255, 255, 0.92)')
  gradient.addColorStop(0.42, 'rgba(210, 225, 255, 0.35)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

export default function SpaceBackground() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x0a0a0f, 1)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000)
    camera.position.z = 400

    // Stars: tiny soft sprites with depth variation, so they read as distant light.
    const STARS = 6500
    const sPos = new Float32Array(STARS * 3)
    const sCol = new Float32Array(STARS * 3)

    for (let i = 0; i < STARS; i++) {
      sPos[i * 3]     = (Math.random() - 0.5) * 2600
      sPos[i * 3 + 1] = (Math.random() - 0.5) * 2600
      sPos[i * 3 + 2] = -900 + Math.random() * 1500

      const brightness = 0.42 + Math.random() * 0.58
      const warmth = Math.random()
      sCol[i * 3] = brightness * (warmth > 0.82 ? 1 : 0.92)
      sCol[i * 3 + 1] = brightness * (warmth > 0.82 ? 0.93 : 0.96)
      sCol[i * 3 + 2] = brightness
    }

    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3))
    starGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3))
    const starTexture = createStarTexture()
    const starMat = new THREE.PointsMaterial({
      size: 2.1,
      map: starTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      alphaTest: 0.02,
    })
    scene.add(new THREE.Points(starGeo, starMat))

    let id
    const clock = new THREE.Clock()
    const tick = () => {
      id = requestAnimationFrame(tick)
      const t = clock.getElapsedTime()
      scene.rotation.y = t * 0.005
      scene.rotation.x = Math.sin(t * 0.003) * 0.04
      renderer.render(scene, camera)
    }
    tick()

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', onResize)
      starGeo.dispose()
      starMat.dispose()
      starTexture.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <canvas
      ref={ref}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  )
}
