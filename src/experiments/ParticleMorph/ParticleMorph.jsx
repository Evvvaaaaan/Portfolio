import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import '../shared/exp.css'
import './ParticleMorph.css'

const SIM = 320
const COUNT = SIM * SIM
const MORPH_MS = 2200
const IDLE_MS = 12000

// ── 타깃 형상 생성 ──────────────────────────────────────────

function sampleText(text) {
  const w = 1024
  const h = 320
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 210px "Pretendard", "Apple SD Gothic Neo", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h / 2)
  const img = ctx.getImageData(0, 0, w, h).data
  const pts = []
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (img[(y * w + x) * 4 + 3] > 128) pts.push([x, y])
    }
  }
  const data = new Float32Array(COUNT * 4)
  for (let i = 0; i < COUNT; i++) {
    const [px, py] = pts[(Math.random() * pts.length) | 0]
    data[i * 4 + 0] = (px / w - 0.5) * 3.8 + (Math.random() - 0.5) * 0.01
    data[i * 4 + 1] = -(py / h - 0.5) * 1.19 + (Math.random() - 0.5) * 0.01
    data[i * 4 + 2] = (Math.random() - 0.5) * 0.16
    data[i * 4 + 3] = 1
  }
  return data
}

function sampleSphere() {
  const data = new Float32Array(COUNT * 4)
  const R = 1.25
  for (let i = 0; i < COUNT; i++) {
    const y = 1 - (2 * i) / (COUNT - 1)
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const th = i * 2.399963229728653
    data[i * 4 + 0] = Math.cos(th) * r * R
    data[i * 4 + 1] = y * R
    data[i * 4 + 2] = Math.sin(th) * r * R
    data[i * 4 + 3] = 1
  }
  return data
}

function sampleTorusKnot() {
  const data = new Float32Array(COUNT * 4)
  const p = 2
  const q = 3
  for (let i = 0; i < COUNT; i++) {
    const t = Math.random() * Math.PI * 2
    const r = 0.62 * (2 + Math.cos(q * t)) * 0.5
    const x = r * Math.cos(p * t)
    const y = r * Math.sin(p * t)
    const z = 0.62 * Math.sin(q * t) * 0.5
    const j = 0.07
    data[i * 4 + 0] = x + (Math.random() - 0.5) * j
    data[i * 4 + 1] = y + (Math.random() - 0.5) * j
    data[i * 4 + 2] = z + (Math.random() - 0.5) * j
    data[i * 4 + 3] = 1
  }
  return data
}

// ── 셰이더 ──────────────────────────────────────────────────

const SIM_FRAG = /* glsl */ `
  uniform sampler2D uPos;
  uniform sampler2D uTargetA;
  uniform sampler2D uTargetB;
  uniform float uMix;
  uniform float uTime;
  uniform vec3 uMouse;
  uniform float uMouseActive;
  varying vec2 vUv;

  vec3 flow(vec3 p, float t) {
    return vec3(
      sin(p.y * 2.1 + t) + cos(p.z * 1.7 + t * 0.8),
      sin(p.z * 1.9 + t * 1.1) + cos(p.x * 2.3 + t * 0.7),
      sin(p.x * 1.5 + t * 0.9) + cos(p.y * 2.7 + t * 1.2)
    );
  }

  void main() {
    vec3 pos = texture2D(uPos, vUv).xyz;
    vec3 target = mix(texture2D(uTargetA, vUv).xyz, texture2D(uTargetB, vUv).xyz, uMix);
    pos += (target - pos) * 0.075;
    pos += flow(pos * 1.6, uTime * 0.35) * 0.0016;
    vec3 d = pos - uMouse;
    float r2 = dot(d, d);
    pos += normalize(d + 1e-6) * 0.30 * exp(-r2 * 6.0) * uMouseActive;
    gl_FragColor = vec4(pos, 1.0);
  }
`

const RENDER_VERT = /* glsl */ `
  uniform sampler2D uPos;
  uniform sampler2D uPosPrev;
  attribute vec2 aRef;
  varying float vSpeed;

  void main() {
    vec3 p = texture2D(uPos, aRef).xyz;
    vec3 pp = texture2D(uPosPrev, aRef).xyz;
    vSpeed = clamp(length(p - pp) * 34.0, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(4.6 / -mv.z, 1.0, 3.5);
    gl_Position = projectionMatrix * mv;
  }
`

const RENDER_FRAG = /* glsl */ `
  varying float vSpeed;

  void main() {
    float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
    vec3 col = mix(vec3(0.486, 0.227, 0.929), vec3(0.910, 0.475, 0.976), vSpeed);
    gl_FragColor = vec4(col, a * 0.8);
  }
`

export default function ParticleMorph() {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.setClearColor(0x05060c, 1)
    mount.appendChild(renderer.domElement)

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 50)
    camera.position.z = 3.1

    // 시뮬레이션(ping-pong) 셋업
    const rtOpts = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      depthBuffer: false,
      stencilBuffer: false,
    }
    const rtA = new THREE.WebGLRenderTarget(SIM, SIM, rtOpts)
    const rtB = new THREE.WebGLRenderTarget(SIM, SIM, rtOpts)
    let rtRead = rtA
    let rtWrite = rtB

    const makeDataTex = (data) => {
      const t = new THREE.DataTexture(data, SIM, SIM, THREE.RGBAFormat, THREE.FloatType)
      t.needsUpdate = true
      return t
    }

    const targets = [sampleText('EVAN'), sampleSphere(), sampleText('실험'), sampleTorusKnot()].map(makeDataTex)

    const initData = new Float32Array(COUNT * 4)
    for (let i = 0; i < COUNT; i++) {
      const r = 2.6 * Math.cbrt(Math.random())
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      initData[i * 4 + 0] = r * Math.sin(ph) * Math.cos(th)
      initData[i * 4 + 1] = r * Math.sin(ph) * Math.sin(th)
      initData[i * 4 + 2] = r * Math.cos(ph)
      initData[i * 4 + 3] = 1
    }
    const initTex = makeDataTex(initData)

    const simScene = new THREE.Scene()
    const simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const simMat = new THREE.ShaderMaterial({
      uniforms: {
        uPos: { value: initTex },
        uTargetA: { value: targets[0] },
        uTargetB: { value: targets[1] },
        uMix: { value: 0 },
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector3(99, 99, 0) },
        uMouseActive: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }',
      fragmentShader: SIM_FRAG,
    })
    simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat))

    // 포인트 렌더 셋업
    const geo = new THREE.BufferGeometry()
    const refs = new Float32Array(COUNT * 2)
    for (let i = 0; i < COUNT; i++) {
      refs[i * 2 + 0] = ((i % SIM) + 0.5) / SIM
      refs[i * 2 + 1] = ((i / SIM) | 0) / SIM + 0.5 / SIM
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))
    geo.setAttribute('aRef', new THREE.BufferAttribute(refs, 2))
    const renderMat = new THREE.ShaderMaterial({
      uniforms: { uPos: { value: null }, uPosPrev: { value: null } },
      vertexShader: RENDER_VERT,
      fragmentShader: RENDER_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const scene = new THREE.Scene()
    scene.add(new THREE.Points(geo, renderMat))

    // 모핑 상태
    let current = 0
    let morphStart = -1
    let lastInteract = performance.now()

    const morphNext = () => {
      if (morphStart >= 0) return
      simMat.uniforms.uTargetA.value = targets[current]
      current = (current + 1) % targets.length
      simMat.uniforms.uTargetB.value = targets[current]
      morphStart = performance.now()
    }

    // 입력
    const mouse3 = new THREE.Vector3()
    const ndc = new THREE.Vector2()
    let downX = 0
    let downY = 0
    const onMove = (e) => {
      const rect = mount.getBoundingClientRect()
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      mouse3.set(ndc.x, ndc.y, 0.5).unproject(camera)
      const dir = mouse3.sub(camera.position).normalize()
      const t = -camera.position.z / dir.z
      simMat.uniforms.uMouse.value.copy(camera.position).addScaledVector(dir, t)
      simMat.uniforms.uMouseActive.value = 1
      lastInteract = performance.now()
    }
    const onLeave = () => {
      simMat.uniforms.uMouseActive.value = 0
    }
    const onDown = (e) => {
      downX = e.clientX
      downY = e.clientY
    }
    const onUp = (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) < 6) morphNext()
      lastInteract = performance.now()
    }
    mount.addEventListener('pointermove', onMove)
    mount.addEventListener('pointerleave', onLeave)
    mount.addEventListener('pointerdown', onDown)
    mount.addEventListener('pointerup', onUp)

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', onResize)

    // 루프
    let raf = 0
    let running = true
    const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!running) return
      const now = performance.now()
      simMat.uniforms.uTime.value = now / 1000

      if (morphStart >= 0) {
        const k = Math.min(1, (now - morphStart) / MORPH_MS)
        simMat.uniforms.uMix.value = easeInOut(k)
        if (k >= 1) {
          simMat.uniforms.uTargetA.value = targets[current]
          simMat.uniforms.uMix.value = 0
          morphStart = -1
        }
      } else if (!reduced && now - lastInteract > IDLE_MS) {
        morphNext()
        lastInteract = now
      }

      renderer.setRenderTarget(rtWrite)
      renderer.render(simScene, simCam)
      renderer.setRenderTarget(null)
      renderMat.uniforms.uPosPrev.value = simMat.uniforms.uPos.value === initTex ? rtWrite.texture : simMat.uniforms.uPos.value
      renderMat.uniforms.uPos.value = rtWrite.texture
      simMat.uniforms.uPos.value = rtWrite.texture
      ;[rtRead, rtWrite] = [rtWrite, rtRead]

      renderer.render(scene, camera)
    }
    loop()

    const onVis = () => {
      running = !document.hidden
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', onResize)
      mount.removeEventListener('pointermove', onMove)
      mount.removeEventListener('pointerleave', onLeave)
      mount.removeEventListener('pointerdown', onDown)
      mount.removeEventListener('pointerup', onUp)
      rtA.dispose()
      rtB.dispose()
      targets.forEach((t) => t.dispose())
      initTex.dispose()
      geo.dispose()
      renderMat.dispose()
      simMat.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="particle-morph" ref={mountRef}>
      <p className="pm-hint">클릭 — 다음 형상 · 마우스 — 파티클 밀어내기</p>
    </div>
  )
}
