import { useEffect, useRef, useState } from 'react'
import '../shared/exp.css'
import './InkFlow.css'

// Navier-Stokes stable fluids (GPU) — advect → splat → vorticity → project

const BASE_VERT = `
  precision highp float;
  attribute vec2 aPosition;
  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  uniform vec2 texelSize;
  void main () {
    vUv = aPosition * 0.5 + 0.5;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`

const SHADERS = {
  advection: `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform float dt;
    uniform float dissipation;
    void main () {
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
      gl_FragColor = dissipation * texture2D(uSource, coord);
    }
  `,
  splat: `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;
    void main () {
      vec2 p = vUv - point;
      p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0);
    }
  `,
  curl: `
    precision mediump float; precision mediump sampler2D;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).y;
      float R = texture2D(uVelocity, vR).y;
      float T = texture2D(uVelocity, vT).x;
      float B = texture2D(uVelocity, vB).x;
      gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
    }
  `,
  vorticity: `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curlStrength;
    uniform float dt;
    void main () {
      float L = texture2D(uCurl, vL).x;
      float R = texture2D(uCurl, vR).x;
      float T = texture2D(uCurl, vT).x;
      float B = texture2D(uCurl, vB).x;
      float C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= curlStrength * C;
      force.y *= -1.0;
      vec2 vel = texture2D(uVelocity, vUv).xy;
      gl_FragColor = vec4(vel + force * dt, 0.0, 1.0);
    }
  `,
  divergence: `
    precision mediump float; precision mediump sampler2D;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).x;
      float R = texture2D(uVelocity, vR).x;
      float T = texture2D(uVelocity, vT).y;
      float B = texture2D(uVelocity, vB).y;
      gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
    }
  `,
  clear: `
    precision mediump float; precision mediump sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;
    void main () {
      gl_FragColor = value * texture2D(uTexture, vUv);
    }
  `,
  pressure: `
    precision mediump float; precision mediump sampler2D;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      float divergence = texture2D(uDivergence, vUv).x;
      gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
    }
  `,
  gradientSubtract: `
    precision mediump float; precision mediump sampler2D;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity -= 0.5 * vec2(R - L, T - B);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
  `,
  display: `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    void main () {
      vec3 c = texture2D(uTexture, vUv).rgb;
      c += pow(max(c - 0.35, 0.0), vec3(1.4)) * 0.9;   // 밝은 부분만 부드럽게 블룸
      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - d * d * 0.55;                          // 비네트
      gl_FragColor = vec4(pow(c, vec3(0.92)), 1.0);
    }
  `,
}

function hsv(h, s, v) {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  const m = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6]
  return m
}

export default function InkFlow() {
  const mountRef = useRef(null)
  const [unsupported] = useState(() => {
    const probe = document.createElement('canvas').getContext('webgl2')
    return !probe || !probe.getExtension('EXT_color_buffer_float')
  })

  useEffect(() => {
    if (unsupported) return undefined
    const mount = mountRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const canvas = document.createElement('canvas')
    mount.appendChild(canvas)
    const gl = canvas.getContext('webgl2', { alpha: false, depth: false, stencil: false, antialias: false })
    gl.getExtension('EXT_color_buffer_float')
    gl.getExtension('OES_texture_float_linear')

    const dpr = Math.min(window.devicePixelRatio, 2)
    const resize = () => {
      canvas.width = Math.round(mount.clientWidth * dpr)
      canvas.height = Math.round(mount.clientHeight * dpr)
    }
    resize()

    const compile = (type, src) => {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
      return s
    }
    const vert = compile(gl.VERTEX_SHADER, BASE_VERT)
    const programs = {}
    for (const [name, src] of Object.entries(SHADERS)) {
      const prog = gl.createProgram()
      gl.attachShader(prog, vert)
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, src))
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog))
      const uniforms = {}
      const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS)
      for (let i = 0; i < n; i++) {
        const u = gl.getActiveUniform(prog, i).name
        uniforms[u] = gl.getUniformLocation(prog, u)
      }
      programs[name] = { prog, uniforms }
    }

    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW)
    const idx = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const blit = (target) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null)
      gl.viewport(0, 0, target ? target.w : canvas.width, target ? target.h : canvas.height)
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
    }

    let texId = 0
    const createFBO = (w, h, internalFormat, format, filter) => {
      const texture = gl.createTexture()
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, gl.HALF_FLOAT, null)
      const fbo = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      return {
        texture, fbo, w, h,
        attach() {
          const id = texId++ % 16
          gl.activeTexture(gl.TEXTURE0 + id)
          gl.bindTexture(gl.TEXTURE_2D, texture)
          return id
        },
      }
    }
    const createDoubleFBO = (...args) => {
      let fbo1 = createFBO(...args)
      let fbo2 = createFBO(...args)
      return {
        get read() { return fbo1 },
        get write() { return fbo2 },
        get w() { return fbo1.w },
        get h() { return fbo1.h },
        swap() { [fbo1, fbo2] = [fbo2, fbo1] },
      }
    }

    const simRes = (base) => {
      const aspect = canvas.width / canvas.height
      return aspect > 1
        ? { w: Math.round(base * aspect), h: base }
        : { w: base, h: Math.round(base / aspect) }
    }
    const sv = simRes(200)
    const sd = simRes(512)
    const velocity = createDoubleFBO(sv.w, sv.h, gl.RG16F, gl.RG, gl.LINEAR)
    const dye = createDoubleFBO(sd.w, sd.h, gl.RGBA16F, gl.RGBA, gl.LINEAR)
    const pressure = createDoubleFBO(sv.w, sv.h, gl.R16F, gl.RED, gl.NEAREST)
    const divergence = createFBO(sv.w, sv.h, gl.R16F, gl.RED, gl.NEAREST)
    const curl = createFBO(sv.w, sv.h, gl.R16F, gl.RED, gl.NEAREST)

    const bindProgram = (p, texel) => {
      gl.useProgram(p.prog)
      if (p.uniforms.texelSize && texel) gl.uniform2f(p.uniforms.texelSize, 1 / texel.w, 1 / texel.h)
      return p.uniforms
    }

    let hue = Math.random()
    const splat = (x, y, dx, dy) => {
      let u = bindProgram(programs.splat, velocity)
      gl.uniform1i(u.uTarget, velocity.read.attach())
      gl.uniform1f(u.aspectRatio, canvas.width / canvas.height)
      gl.uniform2f(u.point, x, y)
      gl.uniform3f(u.color, dx, dy, 0)
      gl.uniform1f(u.radius, 0.0016)
      blit(velocity.write)
      velocity.swap()

      const c = hsv(hue, 0.85, 0.85)
      u = bindProgram(programs.splat, dye)
      gl.uniform1i(u.uTarget, dye.read.attach())
      gl.uniform1f(u.aspectRatio, canvas.width / canvas.height)
      gl.uniform2f(u.point, x, y)
      gl.uniform3f(u.color, c[0] * 0.28, c[1] * 0.28, c[2] * 0.28)
      gl.uniform1f(u.radius, 0.0016)
      blit(dye.write)
      dye.swap()
    }

    // 포인터
    const pointer = { down: false, moved: false, x: 0, y: 0, dx: 0, dy: 0 }
    const toUv = (e) => {
      const rect = mount.getBoundingClientRect()
      return [(e.clientX - rect.left) / rect.width, 1 - (e.clientY - rect.top) / rect.height]
    }
    const onDown = (e) => {
      const [x, y] = toUv(e)
      pointer.down = true
      pointer.x = x
      pointer.y = y
    }
    const onMove = (e) => {
      if (!pointer.down) return
      const [x, y] = toUv(e)
      pointer.dx = (x - pointer.x) * 8000
      pointer.dy = (y - pointer.y) * 8000
      pointer.x = x
      pointer.y = y
      pointer.moved = Math.abs(pointer.dx) > 0.1 || Math.abs(pointer.dy) > 0.1
    }
    const onUp = () => {
      pointer.down = false
    }
    mount.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    // 첫 화면 splat
    if (!reduced) {
      for (let i = 0; i < 3; i++) {
        hue = Math.random()
        const a = Math.random() * Math.PI * 2
        splat(0.35 + Math.random() * 0.3, 0.35 + Math.random() * 0.3, Math.cos(a) * 900, Math.sin(a) * 900)
      }
    }

    let raf = 0
    let running = true
    let last = performance.now()
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!running) return
      const now = performance.now()
      const dt = Math.min((now - last) / 1000, 0.0166)
      last = now
      hue = (hue + dt * 0.06) % 1

      if (pointer.moved) {
        pointer.moved = false
        splat(pointer.x, pointer.y, pointer.dx, pointer.dy)
      }

      let u = bindProgram(programs.curl, velocity)
      gl.uniform1i(u.uVelocity, velocity.read.attach())
      blit(curl)

      u = bindProgram(programs.vorticity, velocity)
      gl.uniform1i(u.uVelocity, velocity.read.attach())
      gl.uniform1i(u.uCurl, curl.attach())
      gl.uniform1f(u.curlStrength, 14)
      gl.uniform1f(u.dt, dt)
      blit(velocity.write)
      velocity.swap()

      u = bindProgram(programs.divergence, velocity)
      gl.uniform1i(u.uVelocity, velocity.read.attach())
      blit(divergence)

      u = bindProgram(programs.clear, velocity)
      gl.uniform1i(u.uTexture, pressure.read.attach())
      gl.uniform1f(u.value, 0.8)
      blit(pressure.write)
      pressure.swap()

      for (let i = 0; i < 20; i++) {
        u = bindProgram(programs.pressure, velocity)
        gl.uniform1i(u.uPressure, pressure.read.attach())
        gl.uniform1i(u.uDivergence, divergence.attach())
        blit(pressure.write)
        pressure.swap()
      }

      u = bindProgram(programs.gradientSubtract, velocity)
      gl.uniform1i(u.uPressure, pressure.read.attach())
      gl.uniform1i(u.uVelocity, velocity.read.attach())
      blit(velocity.write)
      velocity.swap()

      u = bindProgram(programs.advection, velocity)
      gl.uniform1i(u.uVelocity, velocity.read.attach())
      gl.uniform1i(u.uSource, velocity.read.attach())
      gl.uniform1f(u.dt, dt)
      gl.uniform1f(u.dissipation, 0.999)
      blit(velocity.write)
      velocity.swap()

      u = bindProgram(programs.advection, dye)
      gl.uniform1i(u.uVelocity, velocity.read.attach())
      gl.uniform1i(u.uSource, dye.read.attach())
      gl.uniform1f(u.dt, dt)
      gl.uniform1f(u.dissipation, 0.988)
      blit(dye.write)
      dye.swap()

      u = bindProgram(programs.display)
      gl.uniform1i(u.uTexture, dye.read.attach())
      blit(null)
    }
    loop()

    const onVis = () => {
      running = !document.hidden
      last = performance.now()
    }
    document.addEventListener('visibilitychange', onVis)
    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      mount.removeEventListener('pointerdown', onDown)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      mount.removeChild(canvas)
    }
  }, [unsupported])

  return (
    <div className="ink-flow" ref={mountRef}>
      {unsupported ? (
        <div className="if-unsupported">이 기기는 WebGL2 부동소수점 렌더링을 지원하지 않아 유체 시뮬레이션을 실행할 수 없습니다.</div>
      ) : (
        <p className="if-hint">드래그 — 발광 잉크 흘리기</p>
      )}
    </div>
  )
}
