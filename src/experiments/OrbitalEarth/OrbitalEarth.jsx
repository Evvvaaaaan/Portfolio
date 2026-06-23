import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import '../shared/exp.css'
import './OrbitalEarth.css'

// 국가 경계 데이터 (Natural Earth, 한국어 국가명·ISO·인구·GDP 포함)
const GEO_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson'

const DEG = Math.PI / 180
const SEG = 64        // 아크 분할
const ARC_COUNT = 12  // 동시 통신선 수
const TEX_W = 4096    // 지표 텍스처 가로
const TEX_H = 2048

// 통신 네트워크 허브 도시 (실제 위경도)
const HUBS = [
  { name: 'Seoul', lat: 37.57, lon: 126.98 },
  { name: 'Tokyo', lat: 35.68, lon: 139.69 },
  { name: 'Hong Kong', lat: 22.32, lon: 114.17 },
  { name: 'Singapore', lat: 1.35, lon: 103.82 },
  { name: 'Mumbai', lat: 19.08, lon: 72.88 },
  { name: 'Dubai', lat: 25.2, lon: 55.27 },
  { name: 'Frankfurt', lat: 50.11, lon: 8.68 },
  { name: 'London', lat: 51.51, lon: -0.13 },
  { name: 'Paris', lat: 48.86, lon: 2.35 },
  { name: 'New York', lat: 40.71, lon: -74.01 },
  { name: 'Los Angeles', lat: 34.05, lon: -118.24 },
  { name: 'São Paulo', lat: -23.55, lon: -46.63 },
  { name: 'Sydney', lat: -33.87, lon: 151.21 },
  { name: 'Johannesburg', lat: -26.2, lon: 28.04 },
  { name: 'Moscow', lat: 55.75, lon: 37.62 },
  { name: 'Toronto', lat: 43.65, lon: -79.38 },
]

// 위경도 → 구면 3D (등장방형 텍스처와 정렬되는 표준 매핑)
function llToVec3(lat, lon, r = 1) {
  const phi = (90 - lat) * DEG
  const theta = (lon + 180) * DEG
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  )
}

// 구면 3D(단위 벡터) → 위경도
function vec3ToLL(v) {
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, v.y))) / DEG
  let lon = Math.atan2(v.z, -v.x) / DEG - 180
  while (lon < -180) lon += 360
  while (lon > 180) lon -= 360
  return { lat, lon }
}

// 위도별 생물군계 색 (실제 지구 지표 느낌)
function landColor(lat) {
  const a = Math.abs(lat)
  if (a > 68) return [200, 212, 216] // 한대·툰드라
  if (a > 50) return [93, 115, 85]   // 냉대림
  if (a > 34) return [111, 138, 79]  // 온대
  if (a > 18) return [154, 139, 84]  // 건조·사바나 (사하라·아라비아·호주 내륙)
  return [70, 119, 63]               // 열대
}

// ISO 2자리 코드 → 국기 이모지
function flagEmoji(props) {
  let iso = props.ISO_A2
  if (!iso || iso === '-99') iso = props.ISO_A2_EH
  if (!iso || iso.length !== 2 || iso === '-99') return '🌐'
  const A = 0x1f1e6
  const base = 'A'.charCodeAt(0)
  const cps = [...iso.toUpperCase()].map((c) => A + (c.charCodeAt(0) - base))
  if (cps.some((x) => x < A || x > A + 25)) return '🌐'
  return String.fromCodePoint(...cps)
}

const CONTINENT_KO = {
  Asia: '아시아',
  Europe: '유럽',
  Africa: '아프리카',
  'North America': '북아메리카',
  'South America': '남아메리카',
  Oceania: '오세아니아',
  Antarctica: '남극',
  'Seven seas (open ocean)': '공해',
}

function formatPop(pop) {
  if (!pop || pop <= 0) return '—'
  if (pop >= 1e8) return `약 ${(pop / 1e8).toFixed(2)}억 명`
  if (pop >= 1e4) return `약 ${Math.round(pop / 1e4).toLocaleString()}만 명`
  return `약 ${Math.round(pop).toLocaleString()}명`
}

// GDP_MD: 백만 USD 단위
function formatGDP(md) {
  if (!md || md <= 0) return '—'
  if (md >= 1e6) return `약 ${(md / 1e6).toFixed(2)}조 달러`
  return `약 ${Math.round(md / 100).toLocaleString()}억 달러`
}

export default function OrbitalEarth() {
  const wrapRef = useRef()
  const apiRef = useRef({})
  const selRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error

  useEffect(() => {
    const wrap = wrapRef.current
    let raf
    let disposed = false

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, wrap.clientWidth / wrap.clientHeight, 0.05, 100)
    camera.position.set(0, 0.6, 2.8)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setClearColor(0x05070d, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(wrap.clientWidth, wrap.clientHeight)
    wrap.appendChild(renderer.domElement)

    // ── 확대·축소 + 회전 컨트롤 ──
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.enablePan = false
    controls.rotateSpeed = 0.55
    controls.zoomSpeed = 0.85
    controls.minDistance = 1.25
    controls.maxDistance = 6
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.35

    let userActive = false
    let idleTimer
    controls.addEventListener('start', () => {
      userActive = true
      clearTimeout(idleTimer)
    })
    controls.addEventListener('end', () => {
      idleTimer = setTimeout(() => { userActive = false }, 2500)
    })

    // ── 조명 (태양 + 약한 환경광으로 주야 경계 표현) ──
    scene.add(new THREE.AmbientLight(0x2a3f5c, 0.55))
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.25)
    sun.position.set(2.2, 1.0, 1.6)
    scene.add(sun)

    // ── 별 배경 ──
    const starN = 1400
    const starPos = new Float32Array(starN * 3)
    for (let i = 0; i < starN; i++) {
      const v = new THREE.Vector3(
        Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1
      ).normalize().multiplyScalar(20 + Math.random() * 30)
      starPos[i * 3] = v.x
      starPos[i * 3 + 1] = v.y
      starPos[i * 3 + 2] = v.z
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xcdd8ee, size: 0.08, transparent: true, opacity: 0.7, sizeAttenuation: true,
    }))
    scene.add(stars)

    // ── 지구 본체 (회전하는 그룹) ──
    const globe = new THREE.Group()
    scene.add(globe)

    const earthMat = new THREE.MeshPhongMaterial({ color: 0x12365c, shininess: 18, specular: 0x223344 })
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), earthMat)
    globe.add(earth)

    // 선택 국가 하이라이트 오버레이 (지표 살짝 위)
    const ovCanvas = document.createElement('canvas')
    ovCanvas.width = 2048
    ovCanvas.height = 1024
    const ovCtx = ovCanvas.getContext('2d')
    const ovTex = new THREE.CanvasTexture(ovCanvas)
    ovTex.colorSpace = THREE.SRGBColorSpace
    const overlay = new THREE.Mesh(
      new THREE.SphereGeometry(1.0015, 96, 96),
      new THREE.MeshBasicMaterial({ map: ovTex, transparent: true, depthWrite: false })
    )
    globe.add(overlay)

    // 프레넬 대기 글로우 (림에 밀착한 얇은 빛 띠)
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.055, 64, 64),
      new THREE.ShaderMaterial({
        uniforms: { glowColor: { value: new THREE.Color(0x5aa6ff) } },
        vertexShader: `
          varying vec3 vN; varying vec3 vP;
          void main(){ vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz;
            gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `
          uniform vec3 glowColor; varying vec3 vN; varying vec3 vP;
          void main(){ vec3 vd = normalize(-vP);
            float f = pow(clamp(0.74 - dot(vN, vd), 0.0, 1.0), 4.0) * 1.6;
            gl_FragColor = vec4(glowColor, f); }`,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      })
    )
    scene.add(atmo)

    // ── 통신 네트워크: 허브 노드 + 흐르는 아크 ──
    const dotCanvas = document.createElement('canvas')
    dotCanvas.width = dotCanvas.height = 64
    const dctx = dotCanvas.getContext('2d')
    const dg = dctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    dg.addColorStop(0, 'rgba(180,230,255,1)')
    dg.addColorStop(0.4, 'rgba(90,180,255,0.7)')
    dg.addColorStop(1, 'rgba(90,180,255,0)')
    dctx.fillStyle = dg
    dctx.fillRect(0, 0, 64, 64)
    const dotTex = new THREE.CanvasTexture(dotCanvas)

    const hubVecs = HUBS.map((h) => llToVec3(h.lat, h.lon, 1.012))
    const nodes = hubVecs.map((v) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dotTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }))
      s.position.copy(v)
      s.scale.setScalar(0.055)
      globe.add(s)
      return s
    })

    const arcs = []
    const tmp = new THREE.Vector3()
    const buildArc = (arc) => {
      let i = (Math.random() * HUBS.length) | 0
      let j = (Math.random() * HUBS.length) | 0
      while (j === i) j = (Math.random() * HUBS.length) | 0
      const a = hubVecs[i], b = hubVecs[j]
      const lift = 0.1 + a.angleTo(b) * 0.22
      const positions = new Float32Array((SEG + 1) * 3)
      for (let k = 0; k <= SEG; k++) {
        const t = k / SEG
        tmp.copy(a).lerp(b, t).normalize().multiplyScalar(1.012 + Math.sin(Math.PI * t) * lift)
        positions[k * 3] = tmp.x
        positions[k * 3 + 1] = tmp.y
        positions[k * 3 + 2] = tmp.z
      }
      arc.geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      arc.progress = -Math.random() * 0.9
      arc.speed = 0.45 + Math.random() * 0.6
      arc.mat.color.setHSL(0.52 + Math.random() * 0.12, 0.95, 0.62)
    }
    for (let i = 0; i < ARC_COUNT; i++) {
      const geo = new THREE.BufferGeometry()
      const mat = new THREE.LineBasicMaterial({
        transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
      })
      const arc = { geo, mat }
      buildArc(arc)
      arc.line = new THREE.Line(geo, mat)
      arc.line.frustumCulled = false
      globe.add(arc.line)
      arcs.push(arc)
    }

    // ── 국가 데이터 로드 → 지표 텍스처 생성 + 클릭 인덱스 구축 ──
    let index = [] // [{ props, polys:[{rings,seam,bbox}], bbox }]

    const ringSeam = (ring) => {
      for (let i = 1; i < ring.length; i++) {
        if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) return true
      }
      return false
    }
    const buildIndex = (features) => features.map((f) => {
      const g = f.geometry
      const raw = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
      const polys = raw.map((rings) => {
        let seam = false
        let minx = 180, miny = 90, maxx = -180, maxy = -90
        for (const ring of rings) {
          if (ringSeam(ring)) seam = true
          for (const [x, y] of ring) {
            if (x < minx) minx = x; if (x > maxx) maxx = x
            if (y < miny) miny = y; if (y > maxy) maxy = y
          }
        }
        return { rings, seam, bbox: [minx, miny, maxx, maxy] }
      })
      const bb = polys.reduce((acc, p) => [
        Math.min(acc[0], p.bbox[0]), Math.min(acc[1], p.bbox[1]),
        Math.max(acc[2], p.bbox[2]), Math.max(acc[3], p.bbox[3]),
      ], [180, 90, -180, -90])
      return { props: f.properties, polys, bbox: bb }
    })

    const pxOf = (lon) => ((lon + 180) / 360) * TEX_W
    const pyOf = (lat) => ((90 - lat) / 180) * TEX_H

    // 링을 픽셀 좌표로 변환 (경도 unwrap → 자오선(±180°) 가로 스미어 방지)
    const ringPixels = (ring) => {
      const out = new Array(ring.length)
      let lon = ring[0][0]
      out[0] = [pxOf(lon), pyOf(ring[0][1])]
      for (let k = 1; k < ring.length; k++) {
        let d = ring[k][0] - ring[k - 1][0]
        d -= Math.round(d / 360) * 360
        lon += d
        out[k] = [pxOf(lon), pyOf(ring[k][1])]
      }
      return out
    }

    // 등장방형 캔버스에 바다·육지·빙하를 그려 지표 텍스처 생성
    const drawSurface = (features) => {
      const c = document.createElement('canvas')
      c.width = TEX_W; c.height = TEX_H
      const ctx = c.getContext('2d')
      const sc = document.createElement('canvas')
      sc.width = TEX_W >> 1; sc.height = TEX_H >> 1
      const sctx = sc.getContext('2d')
      const SX = sc.width / TEX_W, SY = sc.height / TEX_H

      // 바다 (위도 그라데이션)
      const og = ctx.createLinearGradient(0, 0, 0, TEX_H)
      og.addColorStop(0, '#0a1f38')
      og.addColorStop(0.5, '#123a63')
      og.addColorStop(1, '#0a1f38')
      ctx.fillStyle = og
      ctx.fillRect(0, 0, TEX_W, TEX_H)
      sctx.fillStyle = '#7a7a7a' // 바다 = 강한 반사
      sctx.fillRect(0, 0, sc.width, sc.height)

      // 육지
      for (const feat of features) {
        const g = feat.geometry
        const raw = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
        const [r, gr, b] = landColor(feat.properties.LABEL_Y ?? 0)
        const jit = (((feat.properties.NE_ID || 0) % 17) - 8) * 1.4
        const cl = (v) => Math.max(0, Math.min(255, Math.round(v + jit)))
        ctx.fillStyle = `rgb(${cl(r)},${cl(gr)},${cl(b)})`
        ctx.strokeStyle = 'rgba(210,228,222,0.22)'
        ctx.lineWidth = 1
        sctx.fillStyle = '#0a0a0a' // 육지 = 약한 반사

        for (const rings of raw) {
          const ringsPx = rings.map(ringPixels)
          for (const off of [-TEX_W, 0, TEX_W]) {
            ctx.beginPath()
            sctx.beginPath()
            for (const pts of ringsPx) {
              for (let k = 0; k < pts.length; k++) {
                const x = pts[k][0] + off
                const y = pts[k][1]
                if (k === 0) { ctx.moveTo(x, y); sctx.moveTo(x * SX, y * SY) }
                else { ctx.lineTo(x, y); sctx.lineTo(x * SX, y * SY) }
              }
              ctx.closePath()
              sctx.closePath()
            }
            ctx.fill('evenodd')
            ctx.stroke()
            sctx.fill('evenodd')
          }
        }
      }

      // 극지 빙하 (위아래 그라데이션 오버레이)
      const ice = (y0, y1) => {
        const ig = ctx.createLinearGradient(0, y0, 0, y1)
        ig.addColorStop(0, 'rgba(235,243,247,0.92)')
        ig.addColorStop(1, 'rgba(235,243,247,0)')
        ctx.fillStyle = ig
        ctx.fillRect(0, Math.min(y0, y1), TEX_W, Math.abs(y1 - y0))
      }
      ice(0, TEX_H * 0.07)
      ice(TEX_H, TEX_H * 0.9)

      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
      const spec = new THREE.CanvasTexture(sc)
      return { tex, spec }
    }

    fetch(GEO_URL)
      .then((r) => { if (!r.ok) throw new Error('geo'); return r.json() })
      .then((data) => {
        if (disposed) return
        const features = data.features.filter((f) => f.geometry)
        index = buildIndex(features)
        const { tex, spec } = drawSurface(features)
        earthMat.map = tex
        earthMat.specularMap = spec
        earthMat.color.set(0xffffff)
        earthMat.specular.set(0x5b7a9a)
        earthMat.shininess = 22
        earthMat.needsUpdate = true
        setStatus('ready')
      })
      .catch(() => { if (!disposed) setStatus('error') })

    // ── 클릭 → 국가 판정 ──
    const ringContains = (ring, lon, lat, seam) => {
      let x = lon
      if (seam && x < 0) x += 360
      let inside = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        let xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
        if (seam) { if (xi < 0) xi += 360; if (xj < 0) xj += 360 }
        if (((yi > lat) !== (yj > lat)) && (x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
          inside = !inside
        }
      }
      return inside
    }
    const polyContains = (poly, lon, lat) => {
      const [minx, miny, maxx, maxy] = poly.bbox
      if (!poly.seam && (lon < minx || lon > maxx)) return false
      if (lat < miny || lat > maxy) return false
      let c = false
      for (const ring of poly.rings) if (ringContains(ring, lon, lat, poly.seam)) c = !c
      return c
    }
    const findCountry = (lat, lon) => {
      for (const item of index) {
        const [minx, miny, maxx, maxy] = item.bbox
        if (lat < miny || lat > maxy) continue
        const seamItem = item.polys.some((p) => p.seam)
        if (!seamItem && (lon < minx || lon > maxx)) continue
        for (const poly of item.polys) if (polyContains(poly, lon, lat)) return item
      }
      return null
    }

    // 선택 국가 하이라이트 그리기
    const OVS_X = ovCanvas.width / TEX_W
    const OVS_Y = ovCanvas.height / TEX_H
    const drawHighlight = (item) => {
      ovCtx.clearRect(0, 0, ovCanvas.width, ovCanvas.height)
      if (item) {
        ovCtx.fillStyle = 'rgba(90,180,255,0.42)'
        ovCtx.strokeStyle = 'rgba(150,220,255,0.95)'
        ovCtx.lineWidth = 2
        for (const poly of item.polys) {
          const ringsPx = poly.rings.map(ringPixels)
          for (const off of [-TEX_W, 0, TEX_W]) {
            ovCtx.beginPath()
            for (const pts of ringsPx) {
              for (let k = 0; k < pts.length; k++) {
                const x = (pts[k][0] + off) * OVS_X
                const y = pts[k][1] * OVS_Y
                if (k === 0) ovCtx.moveTo(x, y); else ovCtx.lineTo(x, y)
              }
              ovCtx.closePath()
            }
            ovCtx.fill('evenodd')
            ovCtx.stroke()
          }
        }
      }
      ovTex.needsUpdate = true
    }

    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let downX = 0, downY = 0
    const onDown = (e) => { downX = e.clientX; downY = e.clientY }
    const onUp = (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObject(earth)
      if (!hits.length) return
      const local = globe.worldToLocal(hits[0].point.clone()).normalize()
      const { lat, lon } = vec3ToLL(local)
      const item = findCountry(lat, lon)
      if (item) {
        selRef.current = item.props
        setSelected(item.props)
        drawHighlight(item)
      } else {
        selRef.current = null
        setSelected(null)
        drawHighlight(null)
      }
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    apiRef.current.clear = () => {
      selRef.current = null
      setSelected(null)
      drawHighlight(null)
    }

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
      const t = clock.getElapsedTime()
      const dt = Math.min(clock.getDelta(), 0.05)

      controls.autoRotate = !userActive && !selRef.current

      // 통신 아크 진행 (꼬리 펄스)
      for (const arc of arcs) {
        arc.progress += arc.speed * dt
        if (arc.progress < 0) {
          arc.geo.setDrawRange(0, 0)
        } else if (arc.progress < 1) {
          arc.geo.setDrawRange(0, Math.floor(arc.progress * SEG) + 1)
        } else if (arc.progress < 2) {
          const start = Math.floor((arc.progress - 1) * SEG)
          arc.geo.setDrawRange(start, SEG + 1 - start)
        } else {
          buildArc(arc)
        }
      }
      // 노드 깜빡임
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].material.opacity = 0.55 + 0.45 * Math.sin(t * 1.6 + i)
      }

      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      clearTimeout(idleTimer)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      controls.dispose()
      ovTex.dispose()
      dotTex.dispose()
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          if (o.material.map) o.material.map.dispose()
          if (o.material.specularMap) o.material.specularMap.dispose()
          o.material.dispose()
        }
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === wrap) wrap.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="exp-wrap" ref={wrapRef}>
      <span className="exp-hint">
        육지를 클릭해 정보를 보고 · 드래그로 회전 · 휠로 확대/축소
      </span>

      {status === 'loading' && <div className="oe-status">지구 데이터를 불러오는 중…</div>}
      {status === 'error' && <div className="oe-status">국가 데이터를 불러오지 못했습니다</div>}

      {selected && (
        <div className="oe-card" key={selected.NE_ID}>
          <button className="oe-card-close" onClick={() => apiRef.current.clear?.()} aria-label="닫기">
            ×
          </button>
          <div className="oe-card-head">
            <span className="oe-flag">{flagEmoji(selected)}</span>
            <div className="oe-names">
              <h3>{selected.NAME_KO || selected.NAME}</h3>
              <span className="oe-name-en">{selected.NAME_LONG || selected.NAME}</span>
            </div>
          </div>
          <dl className="oe-rows">
            <div>
              <dt>대륙</dt>
              <dd>{CONTINENT_KO[selected.CONTINENT] || selected.CONTINENT || '—'}</dd>
            </div>
            <div>
              <dt>인구</dt>
              <dd>{formatPop(selected.POP_EST)}</dd>
            </div>
            <div>
              <dt>GDP</dt>
              <dd>{formatGDP(selected.GDP_MD)}</dd>
            </div>
            <div>
              <dt>국가 코드</dt>
              <dd>{(selected.ISO_A2 !== '-99' && selected.ISO_A2) || selected.ISO_A2_EH || '—'}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}
