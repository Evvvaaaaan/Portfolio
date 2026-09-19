import { fitPaper, paperPoint } from './paper.js'

const VERTEX = `#version 300 es
in vec3 position;
in vec3 normal;
in vec2 uv;
uniform vec2 viewport;
out vec2 vUv;
out vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normal;
  gl_Position = vec4(position.x / viewport.x * 2.0 - 1.0, 1.0 - position.y / viewport.y * 2.0, -position.z / 2000.0, 1.0);
}`

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D paper;
uniform vec3 paperBack;
uniform vec2 lightPosition;
in vec2 vUv;
in vec3 vNormal;
out vec4 color;
void main() {
  vec3 normal = normalize(vNormal);
  normal *= normal.z < 0.0 ? -1.0 : 1.0;
  vec3 direction = normalize(vec3(lightPosition, 1.0));
  float light = clamp(dot(normal, direction) + 0.16, 0.42, 1.08);
  vec4 ink = texture(paper, vUv);
  vec3 surface = gl_FrontFacing ? ink.rgb : paperBack;
  float grain = fract(sin(dot(vUv * 1300.0, vec2(12.9898, 78.233))) * 43758.5453);
  float sheen = pow(max(dot(normal, normalize(direction + vec3(0.0, 0.0, 1.0))), 0.0), 36.0) * 0.035;
  float edge = smoothstep(0.0, 0.004, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  color = vec4(surface * light + (grain - 0.5) * 0.026 + sheen - (1.0 - edge) * 0.055, ink.a);
}`

export function supportsPaper() {
  const proto = HTMLCanvasElement.prototype
  return 'layoutSubtree' in proto && 'requestPaint' in proto && 'captureElementImage' in proto
    && ('updateElementGeometry' in proto || 'getElementTransform' in proto)
}

export function createPaperScene(canvas, element, handles, { onReady, onFailure, onEditReady }) {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true })
  if (!gl || (!gl.texElementSubImage2D && !gl.texElementImage2D)) throw new Error('HTML textures unavailable')
  const shaders = []
  const buffers = []
  const program = gl.createProgram()
  const texture = gl.createTexture()
  let disposed = false, raf = 0, timeout = 0, ready = false, upload = null
  let width = 1, height = 1, fit = fitPaper(1, 1), texWidth = 0, texHeight = 0
  let mode = 'touch', reduced = false, wind = 0.18, lift = 1, gust = 0
  let activeCorner = -1, lastTime = 0, clock = 0, editing = false, ripples = []
  const corners = Array.from({ length: 4 }, (_, i) => ({ curl: i === 0 ? 0.3 : 0, target: 0, velocity: 0, pulseUntil: 0 }))
  const curls = [0.3, 0, 0, 0]
  const light = { x: -0.25, y: -0.4, targetX: -0.25, targetY: -0.4 }

  function setEditable(value) {
    element.inert = !value
    // Experimental canvas descendants can remain in Chromium's AX tree despite inert.
    element.setAttribute('aria-hidden', String(!value))
    for (const input of element.querySelectorAll('textarea')) {
      input.readOnly = !value
      input.tabIndex = value ? 0 : -1
    }
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(raf)
    clearTimeout(timeout)
    observer.disconnect()
    canvas.removeEventListener('paint', paint)
    canvas.removeEventListener('webglcontextlost', lost)
    document.removeEventListener('visibilitychange', visibility)
    canvas.clearElementGeometry?.(element)
    element.style.transform = ''
    buffers.forEach(buffer => gl.deleteBuffer(buffer))
    shaders.forEach(shader => gl.deleteShader(shader))
    gl.deleteTexture(texture)
    gl.deleteProgram(program)
  }
  const fail = () => { dispose(); onFailure() }
  const observer = new ResizeObserver(() => resize())
  const lost = (event) => { event.preventDefault(); fail() }
  const visibility = () => {
    cancelAnimationFrame(raf)
    if (!document.hidden && !disposed) { lastTime = 0; raf = requestAnimationFrame(frame); canvas.requestPaint() }
  }

  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
      const shader = gl.createShader(type)
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
  } catch (error) { dispose(); throw error }

  const columns = 40, rows = 52, count = (columns + 1) * (rows + 1)
  const positions = new Float32Array(count * 3), uv = new Float32Array(count * 2), indices = []
  const normals = new Float32Array(count * 3)
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
    const i = y * (columns + 1) + x
    uv[i * 2] = x / columns; uv[i * 2 + 1] = y / rows
    if (x < columns && y < rows) {
      const next = i + columns + 1
      indices.push(i, next, i + 1, i + 1, next, next + 1)
    }
  }
  gl.useProgram(program)
  const attribute = (name, data, size, usage) => {
    const buffer = gl.createBuffer()
    buffers.push(buffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, usage)
    const location = gl.getAttribLocation(program, name)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0)
    return buffer
  }
  const positionBuffer = attribute('position', positions, 3, gl.DYNAMIC_DRAW)
  const normalBuffer = attribute('normal', normals, 3, gl.DYNAMIC_DRAW)
  attribute('uv', uv, 2, gl.STATIC_DRAW)
  const indexBuffer = gl.createBuffer()
  buffers.push(indexBuffer)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, key, gl.LINEAR)
  for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE)
  const viewport = gl.getUniformLocation(program, 'viewport')
  const lightPosition = gl.getUniformLocation(program, 'lightPosition')
  const paperBack = gl.getUniformLocation(program, 'paperBack')
  gl.uniform3f(paperBack, 0.93, 0.91, 0.86)
  gl.uniform1i(gl.getUniformLocation(program, 'paper'), 0)
  gl.enable(gl.DEPTH_TEST)
  gl.clearColor(0, 0, 0, 0)

  function syncGeometry() {
    const matrix = new DOMMatrix().translate(fit.x, fit.y).scale(fit.scale)
    if (canvas.updateElementGeometry) canvas.updateElementGeometry(element, { canvasTransform: matrix })
    else element.style.transform = canvas.getElementTransform(element, matrix).toString()
  }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    width = rect.width; height = rect.height
    fit = fitPaper(width, height)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(viewport, width, height)
    if (ready) syncGeometry()
    canvas.requestPaint()
  }

  function paint() {
    if (disposed) return
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture)
      if (!upload) {
        if (gl.texElementSubImage2D) {
          upload = () => {
            const snapshot = canvas.captureElementImage(element)
            try {
              if (snapshot.width !== texWidth || snapshot.height !== texHeight) {
                texWidth = snapshot.width; texHeight = snapshot.height
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, texWidth, texHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
              }
              gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, snapshot)
            } finally { snapshot.close() }
          }
        } else {
          // Chromium 152 uses three arguments; 148 uses the earlier six.
          try {
            gl.texElementImage2D(gl.TEXTURE_2D, gl.RGBA8, element)
            upload = () => gl.texElementImage2D(gl.TEXTURE_2D, gl.RGBA8, element)
          } catch (error) {
            if (!(error instanceof TypeError)) throw error
            upload = () => gl.texElementImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element)
          }
        }
      }
      upload()
      if (gl.getError() !== gl.NO_ERROR) throw new Error('HTML texture upload failed')
      if (!ready) {
        ready = true
        clearTimeout(timeout)
        syncGeometry()
        draw()
        onReady()
      } else draw()
    } catch { fail() }
  }

  function draw() {
    if (!ready || disposed) return
    for (let i = 0; i < count; i++) {
      const p = paperPoint(uv[i * 2], uv[i * 2 + 1], curls, clock, mode === 'touch' && !reduced ? wind * lift : 0, lift, ripples, gust)
      positions[i * 3] = fit.x + p[0] * fit.scale
      positions[i * 3 + 1] = fit.y + p[1] * fit.scale
      positions[i * 3 + 2] = p[2] * fit.scale
    }
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
      const i = (y * (columns + 1) + x) * 3
      const left = (y * (columns + 1) + Math.max(0, x - 1)) * 3
      const right = (y * (columns + 1) + Math.min(columns, x + 1)) * 3
      const top = (Math.max(0, y - 1) * (columns + 1) + x) * 3
      const bottom = (Math.min(rows, y + 1) * (columns + 1) + x) * 3
      const ax = positions[right] - positions[left], ay = positions[right + 1] - positions[left + 1], az = positions[right + 2] - positions[left + 2]
      const bx = positions[bottom] - positions[top], by = positions[bottom + 1] - positions[top + 1], bz = positions[bottom + 2] - positions[top + 2]
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx
      const length = Math.hypot(nx, ny, nz) || 1
      normals[i] = nx / length; normals[i + 1] = ny / length; normals[i + 2] = nz / length
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions)
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, normals)
    gl.uniform2f(lightPosition, light.x, light.y)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0)
    const cornerIndices = [count - 1, rows * (columns + 1), 0, columns]
    handles.forEach((handle, i) => {
      const vertex = cornerIndices[i] * 3
      handle.style.transform = `translate(${positions[vertex]}px, ${positions[vertex + 1]}px) translate(-50%, -50%)`
    })
  }

  function frame(now) {
    if (disposed || document.hidden) return
    const dt = Math.min((now - (lastTime || now)) / 1000, 1 / 30)
    lastTime = now
    clock += dt
    corners.forEach((corner, i) => {
      if (activeCorner !== i && now > corner.pulseUntil) corner.target = mode === 'touch' && !reduced && i === 0 ? 0.3 : 0
      corner.velocity += ((corner.target - corner.curl) * 110 - corner.velocity * 19) * dt
      corner.curl = reduced ? corner.target : Math.max(0, Math.min(1.8, corner.curl + corner.velocity * dt))
      curls[i] = corner.curl
    })
    lift += ((mode === 'touch' ? 1 : 0) - lift) * (1 - Math.exp(-12 * dt))
    if (reduced) lift = mode === 'touch' ? 1 : 0
    gust *= Math.exp(-2.4 * dt)
    ripples = ripples.filter(ripple => clock - ripple.start < 2.4)
    light.x += (light.targetX - light.x) * (1 - Math.exp(-6 * dt))
    light.y += (light.targetY - light.y) * (1 - Math.exp(-6 * dt))
    const settled = mode === 'write' && curls.every(curl => curl < 0.002) && lift < 0.002
    if (settled) { curls.fill(0); lift = 0 }
    canvas.dataset.settled = String(settled)
    const canEdit = settled && ready
    if (canEdit !== editing) {
      setEditable(canEdit)
      if (canEdit) { syncGeometry(); onEditReady() }
      editing = canEdit
    }
    draw()
    raf = requestAnimationFrame(frame)
  }

  setEditable(false)
  canvas.addEventListener('paint', paint)
  canvas.addEventListener('webglcontextlost', lost)
  document.addEventListener('visibilitychange', visibility)
  observer.observe(canvas)
  timeout = setTimeout(fail, 5000)
  resize()
  raf = requestAnimationFrame(frame)

  return {
    dispose,
    setMode(value) {
      mode = value; activeCorner = -1; ripples = []; gust = 0
      corners.forEach((corner, i) => {
        corner.pulseUntil = 0
        corner.target = value === 'touch' && !reduced && i === 0 ? 0.3 : 0
      })
      if (value === 'touch') { setEditable(false); editing = false }
    },
    setWind(value) { wind = value },
    setReducedMotion(value) {
      reduced = value
      if (value) { ripples = []; gust = 0; light.targetX = light.x = -0.25; light.targetY = light.y = -0.4 }
    },
    setStock(color) { gl.uniform3fv(paperBack, color); canvas.requestPaint() },
    moveLight(x, y) {
      if (reduced) return
      light.targetX = x == null ? -0.25 : (x / width - 0.5) * 0.9
      light.targetY = y == null ? -0.4 : (y / height - 0.5) * 0.7 - 0.25
    },
    blow() { if (mode === 'touch' && !reduced) gust = 1.6 },
    poke(x, y) {
      if (mode !== 'touch' || reduced) return
      let closest = -1, distance = 24 * fit.scale
      for (let i = 0; i < count; i++) {
        const d = Math.hypot(positions[i * 3] - x, positions[i * 3 + 1] - y)
        if (d < distance) { distance = d; closest = i }
      }
      if (closest >= 0) ripples = [...ripples.slice(-3), { u: uv[closest * 2], v: uv[closest * 2 + 1], start: clock }]
    },
    grab(index = 0) { activeCorner = index; return corners[index].curl },
    drag(value) { if (activeCorner >= 0) corners[activeCorner].target = Math.max(0, Math.min(1.8, value)) },
    release() { activeCorner = -1 },
    nudge(amount, index = 0) {
      const corner = corners[index]
      corner.target = Math.max(0, Math.min(1.8, corner.target + amount)); corner.pulseUntil = performance.now() + 800
    },
  }
}
