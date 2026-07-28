import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { SKY_FRAG, SKY_VERT } from './sky.glsl.js'

// 배경 하늘. 렌더 루프는 Gallery가 소유하고 여기는 유니폼 갱신과 draw만
// 담당한다 — 배경과 패널이 같은 프레임에 갱신되어야 어긋나지 않는다.
// WebGL을 쓸 수 없으면 CSS 그라디언트로 대체하고, 이때 setUniforms/render는
// 아무 일도 하지 않는다 (호출부에 분기를 만들지 않기 위해).
const SkyCanvas = forwardRef(function SkyCanvas(props, ref) {
  const canvasRef = useRef(null)
  const gpuRef = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const isDesktop = window.matchMedia('(min-width: 769px) and (min-height: 701px)').matches
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
    } catch {
      setFailed(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isDesktop ? 2 : 1.5))
    renderer.setSize(window.innerWidth, window.innerHeight, false)

    const uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uYaw: { value: 0 },
      uPitch: { value: 0 },
      uAltitude: { value: 1 },
      uVelocity: { value: 0 },
      uTanFov: { value: Math.tan((75 * Math.PI) / 180 / 2) },
      uPlasma: { value: 0 },
      uQuality: { value: isDesktop ? 1 : 0.55 },
    }

    const scene = new THREE.Scene()
    const camera = new THREE.Camera()
    const material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms,
      depthTest: false,
      depthWrite: false,
    })
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))

    const applySize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      renderer.setSize(w, h, false)
      const dpr = renderer.getPixelRatio()
      uniforms.uRes.value.set(w * dpr, h * dpr)
    }
    applySize()
    window.addEventListener('resize', applySize)

    // 컨텍스트 유실 시 그리기를 멈추고, 복구되면 다음 프레임부터 이어 그린다.
    let contextLost = false
    const onLost = (e) => { e.preventDefault(); contextLost = true }
    const onRestored = () => { contextLost = false; applySize() }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)

    gpuRef.current = {
      uniforms,
      draw() {
        if (contextLost) return
        renderer.render(scene, camera)
      },
    }

    return () => {
      window.removeEventListener('resize', applySize)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      gpuRef.current = null
      material.dispose()
      scene.traverse((o) => o.geometry?.dispose())
      renderer.dispose()
    }
  }, [])

  useImperativeHandle(ref, () => ({
    setUniforms(state) {
      const gpu = gpuRef.current
      if (!gpu) return
      const u = gpu.uniforms
      u.uTime.value = state.timeSec
      u.uYaw.value = (state.yawDeg * Math.PI) / 180
      u.uPitch.value = (state.pitchDeg * Math.PI) / 180
      u.uAltitude.value = state.altitude
      u.uVelocity.value = state.velocity
      u.uTanFov.value = Math.tan((state.fovDeg * Math.PI) / 180 / 2)
      u.uPlasma.value = state.plasma
    },
    render() {
      gpuRef.current?.draw()
    },
  }), [])

  if (failed) return <div className="lab-sky lab-sky--fallback" aria-hidden="true" />
  return <canvas ref={canvasRef} className="lab-sky" aria-hidden="true" />
})

export default SkyCanvas
