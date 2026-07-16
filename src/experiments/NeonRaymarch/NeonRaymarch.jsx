import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import '../shared/exp.css'
import './NeonRaymarch.css'

// SDF 레이마칭 — 자이로이드 셸 ∩ 구 + 궤도 메타볼, smooth min 융합

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uPower;
  uniform float uGlow;
  uniform float uShift;
  uniform vec3 uCamPos;
  uniform mat3 uCamRot;

  float sdGyroid(vec3 p, float f) {
    p *= f;
    return abs(dot(sin(p), cos(p.zxy))) / f - 0.06;
  }

  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  float map(vec3 p) {
    float shell = max(sdGyroid(p, uPower), length(p) - 1.6);
    float balls = 1e9;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec3 c = 1.05 * vec3(
        sin(uTime * 0.50 + fi * 2.1),
        cos(uTime * 0.40 + fi * 1.7),
        sin(uTime * 0.30 + fi * 2.6)
      );
      balls = min(balls, length(p - c) - 0.30);
    }
    return smin(shell, balls, 0.35);
  }

  vec3 normalAt(vec3 p) {
    vec2 e = vec2(0.002, 0.0);
    return normalize(vec3(
      map(p + e.xyy) - map(p - e.xyy),
      map(p + e.yxy) - map(p - e.yxy),
      map(p + e.yyx) - map(p - e.yyx)
    ));
  }

  vec3 palette(float t) {
    return 0.5 + 0.5 * cos(6.28318 * (t + uShift) + vec3(0.0, 0.33, 0.67));
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
    vec3 ro = uCamPos;
    vec3 rd = uCamRot * normalize(vec3(uv, -1.7));

    float t = 0.0;
    float glow = 0.0;
    float hit = -1.0;
    for (int i = 0; i < 90; i++) {
      vec3 p = ro + rd * t;
      float d = map(p);
      glow += 0.02 / (0.012 + abs(d));
      if (d < 0.0012) { hit = t; break; }
      t += d * 0.85;
      if (t > 12.0) break;
    }

    vec3 col = vec3(0.010, 0.008, 0.022);
    if (hit > 0.0) {
      vec3 p = ro + rd * hit;
      vec3 n = normalAt(p);
      float fres = pow(1.0 - max(dot(n, -rd), 0.0), 2.5);
      vec3 base = palette(length(p) * 0.22 + uTime * 0.02);
      float diff = max(dot(n, normalize(vec3(0.7, 0.9, 0.4))), 0.0);
      col = base * (0.12 + 0.5 * diff) + base * fres * 1.6;
    }
    col += palette(0.55 + t * 0.015) * glow * uGlow;
    col *= 1.0 - 0.35 * dot(uv * 0.5, uv * 0.5);
    col = pow(col, vec3(0.85));
    gl_FragColor = vec4(col, 1.0);
  }
`

export default function NeonRaymarch() {
  const mountRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * 0.75)
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.domElement.classList.add('nr-canvas')
    mount.insertBefore(renderer.domElement, panelRef.current)

    const uniforms = {
      uRes: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uPower: { value: 5.2 },
      uGlow: { value: 0.05 },
      uShift: { value: 0.0 },
      uCamPos: { value: new THREE.Vector3() },
      uCamRot: { value: new THREE.Matrix3() },
    }
    const scene = new THREE.Scene()
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: 'void main(){ gl_Position = vec4(position, 1.0); }',
      fragmentShader: FRAG,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
    scene.add(quad)

    const setRes = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight)
      const size = renderer.getDrawingBufferSize(new THREE.Vector2())
      uniforms.uRes.value.copy(size)
    }
    setRes()

    // 궤도 카메라 (드래그 + 관성 + 휠 줌)
    let yaw = 0.6
    let pitch = 0.25
    let vyaw = 0
    let vpitch = 0
    let radius = 3.4
    let dragging = false
    let px = 0
    let py = 0
    const onDown = (e) => {
      if (e.target.closest('.nr-panel')) return
      dragging = true
      px = e.clientX
      py = e.clientY
    }
    const onMove = (e) => {
      if (!dragging) return
      vyaw = (e.clientX - px) * 0.005
      vpitch = (e.clientY - py) * 0.005
      yaw += vyaw
      pitch = Math.max(-1.35, Math.min(1.35, pitch + vpitch))
      px = e.clientX
      py = e.clientY
    }
    const onUp = () => {
      dragging = false
    }
    const onWheel = (e) => {
      e.preventDefault()
      radius = Math.max(2.2, Math.min(5.0, radius + e.deltaY * 0.002))
    }
    mount.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    mount.addEventListener('wheel', onWheel, { passive: false })

    // 파라미터 패널
    const bind = (name, uniform) => {
      const el = panelRef.current.querySelector(`input[name="${name}"]`)
      const fn = () => {
        uniforms[uniform].value = parseFloat(el.value)
      }
      el.addEventListener('input', fn)
      return () => el.removeEventListener('input', fn)
    }
    const unbinds = [bind('form', 'uPower'), bind('glow', 'uGlow'), bind('hue', 'uShift')]

    let raf = 0
    let running = true
    const m = new THREE.Matrix4()
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!running) return
      const t = performance.now() / 1000
      uniforms.uTime.value = reduced ? 12.0 : t

      if (!dragging) {
        yaw += vyaw + (reduced ? 0 : 0.0016)
        pitch += vpitch
        pitch = Math.max(-1.35, Math.min(1.35, pitch))
        vyaw *= 0.95
        vpitch *= 0.95
      }

      const cp = new THREE.Vector3(
        radius * Math.cos(pitch) * Math.sin(yaw),
        radius * Math.sin(pitch),
        radius * Math.cos(pitch) * Math.cos(yaw)
      )
      uniforms.uCamPos.value.copy(cp)
      m.lookAt(cp, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0))
      uniforms.uCamRot.value.setFromMatrix4(m)

      renderer.render(scene, cam)
    }
    loop()

    const onVis = () => {
      running = !document.hidden
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('resize', setRes)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', setRes)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      mount.removeEventListener('pointerdown', onDown)
      mount.removeEventListener('wheel', onWheel)
      unbinds.forEach((fn) => fn())
      quad.geometry.dispose()
      mat.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="neon-raymarch" ref={mountRef}>
      <div className="nr-panel" ref={panelRef}>
        <label>
          Form
          <input name="form" type="range" min="3" max="9" step="0.01" defaultValue="5.2" />
        </label>
        <label>
          Glow
          <input name="glow" type="range" min="0" max="0.14" step="0.001" defaultValue="0.05" />
        </label>
        <label>
          Hue
          <input name="hue" type="range" min="0" max="1" step="0.01" defaultValue="0" />
        </label>
      </div>
      <p className="nr-hint">드래그 — 궤도 · 휠 — 줌</p>
    </div>
  )
}
