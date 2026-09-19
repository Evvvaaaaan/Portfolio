import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TilesRenderer, PriorityQueue, WGS84_RADIUS, WGS84_HEIGHT, WGS84_ELLIPSOID } from '3d-tiles-renderer'
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins'
import { TilesFadePlugin, UpdateOnChangePlugin, LoadRegionPlugin, SphereRegion } from '3d-tiles-renderer/plugins'
import { ExtendedFrustum } from '3d-tiles-renderer/src/three/renderer/math/ExtendedFrustum.js'
import { STOPS, direction, journeyFrame, stopProgress, clamp } from './journey.js'

const DAY_MAP = '/terra/earth-day.jpg'

export function createJourneyScene(host, scroller, settings, onUpdate, onFailure) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  const narrow = host.clientWidth < 760
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, narrow ? 1.25 : 1.6))
  renderer.setSize(host.clientWidth, host.clientHeight)
  renderer.setClearColor(0x060b10)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  host.appendChild(renderer.domElement)
  const canvas = renderer.domElement
  canvas.setAttribute('aria-label', 'Earth and photorealistic landmark view')

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(narrow ? 58 : 44, host.clientWidth / host.clientHeight, 10, WGS84_RADIUS * 30)
  const displayFrustum = new ExtendedFrustum()
  const displayMatrix = new THREE.Matrix4()
  const preloadCamera = new THREE.PerspectiveCamera(narrow ? 58 : 44, host.clientWidth / host.clientHeight, 2, 20000)
  let controls = null
  canvas.style.touchAction = 'pan-y'

  const resources = []
  const track = (resource) => { resources.push(resource); return resource }
  let disposed = false, raf = 0, inspection = false, tileState = 'loading'
  let lastTime = 0, lastHud = 0, lastTileUpdate = -Infinity, lastAttribution = '', visibleTiles = 0
  let current = 0, requested = 0, tiles = null, rootFailed = false
  let preloadIndex = -1, activeCamera = false, tileUpdateNeeded = true
  let previousSample = null
  let frame = null, previousMinimumHeight = -1, previousNarrow = narrow
  let minimumHeight = WGS84_RADIUS * 0.45, terrainHeight = minimumHeight, localTiles = 0
  const landingFrames = STOPS.map((_, index) => journeyFrame(stopProgress(index), { narrow }))
  const readyStops = new Set()
  let needsRender = true
  const invalidate = () => { needsRender = true }
  const detailRegion = new SphereRegion({ sphere: new THREE.Sphere(new THREE.Vector3(), 350), errorTarget: 2 })
  const preloadRegion = new SphereRegion({ sphere: new THREE.Sphere(new THREE.Vector3(), 350), errorTarget: 2 })
  const regions = new LoadRegionPlugin()
  const warmQueue = new PriorityQueue()
  const retiredModels = new WeakSet()
  warmQueue.maxJobs = 1
  const scheduleBackground = (work) => {
    const run = () => { if (!disposed) work() }
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 32 })
    else setTimeout(run, 0)
  }
  warmQueue._schedulingCallback = scheduleBackground

  const prepareDestination = (index) => {
    if (index === preloadIndex || !tiles) return
    preloadIndex = index
    const destination = journeyFrame(stopProgress(index), { narrow: host.clientWidth < 760 })
    preloadCamera.position.copy(destination.position)
    preloadCamera.up.copy(destination.up)
    preloadCamera.lookAt(destination.target)
    if (host.clientWidth >= 760) preloadCamera.setViewOffset(host.clientWidth, host.clientHeight, -host.clientWidth * 0.09, 0, host.clientWidth, host.clientHeight)
    else preloadCamera.clearViewOffset()
    preloadCamera.updateMatrixWorld()
    preloadRegion.sphere.center.copy(destination.target)
    regions.addRegion(preloadRegion)
    tileUpdateNeeded = true
    tiles.dispatchEvent({ type: 'needs-update' })
  }

  const globeMaterial = track(new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 7, specular: 0x20333e }))
  const globeGeometry = track(new THREE.SphereGeometry(1, 96, 64))
  const globe = new THREE.Mesh(globeGeometry, globeMaterial)
  globe.scale.set(WGS84_RADIUS - 1700, WGS84_HEIGHT - 1700, WGS84_RADIUS - 1700)
  globe.rotation.x = Math.PI / 2
  scene.add(globe)
  const texture = track(new THREE.TextureLoader().load(DAY_MAP, (map) => {
    if (disposed) return
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8)
    globeMaterial.map = map
    globeMaterial.needsUpdate = true
    invalidate()
  }, undefined, () => { if (!disposed) { globeMaterial.color.set('#244b5f'); invalidate() } }))
  texture.colorSpace = THREE.SRGBColorSpace

  const cloudTexture = track(new THREE.TextureLoader().load('/terra/earth-clouds.jpg', invalidate))
  const cloudMaterial = track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { cloudMap: { value: cloudTexture }, opacity: { value: 0.7 } },
    vertexShader: `varying vec2 vUv; varying vec3 vNormal;
      void main() { vUv = uv; vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D cloudMap; uniform float opacity; varying vec2 vUv; varying vec3 vNormal;
      void main() { float cloud = smoothstep(0.25, 0.95, texture2D(cloudMap, vUv).b);
        float light = 0.4 + 0.6 * max(0.0, dot(normalize(vNormal), normalize(vec3(-0.4, 0.6, 1.0))));
        gl_FragColor = vec4(vec3(0.88, 0.93, 1.0) * light, cloud * opacity); }`,
  }))
  const clouds = new THREE.Mesh(globeGeometry, cloudMaterial)
  clouds.scale.set(WGS84_RADIUS + 15000, WGS84_HEIGHT + 15000, WGS84_RADIUS + 15000)
  clouds.rotation.x = Math.PI / 2
  scene.add(clouds)

  const atmosphereMaterial = track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { strength: { value: 0.7 } },
    vertexShader: `varying vec3 vNormal; varying vec3 vView;
      void main() { vec4 p = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal); vView = normalize(-p.xyz);
        gl_Position = projectionMatrix * p; }`,
    fragmentShader: `varying vec3 vNormal; varying vec3 vView; uniform float strength;
      void main() { float rim = pow(max(0.0, 0.68 + dot(normalize(vNormal), normalize(vView))), 3.0);
        gl_FragColor = vec4(vec3(0.17, 0.46, 0.69), rim * strength); }`,
  }))
  const atmosphere = new THREE.Mesh(globeGeometry, atmosphereMaterial)
  atmosphere.scale.setScalar(WGS84_RADIUS * 1.028)
  scene.add(atmosphere)

  const sun = new THREE.DirectionalLight(0xfff5e0, 2.4)
  scene.add(sun)
  scene.add(new THREE.AmbientLight(0xbdd9ed, 0.7))
  const warmScene = new THREE.Scene()
  warmScene.add(sun.clone(), new THREE.AmbientLight(0xbdd9ed, 0.7))
  warmScene.fog = new THREE.Fog('#a6bccb', 9000, 19000)

  const starPositions = new Float32Array(1100 * 3)
  let seed = 217
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  for (let i = 0; i < starPositions.length; i += 3) {
    const z = random() * 2 - 1, angle = random() * Math.PI * 2
    const radius = WGS84_RADIUS * (9 + random() * 3)
    starPositions[i] = Math.sqrt(1 - z * z) * Math.cos(angle) * radius
    starPositions[i + 1] = Math.sqrt(1 - z * z) * Math.sin(angle) * radius
    starPositions[i + 2] = z * radius
  }
  const starGeometry = track(new THREE.BufferGeometry())
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  const starMaterial = track(new THREE.PointsMaterial({ color: '#b6c4c8', size: 1.15, sizeAttenuation: false, transparent: true, opacity: 0.65 }))
  scene.add(new THREE.Points(starGeometry, starMaterial))

  const routePoints = []
  STOPS.forEach((stop, i) => {
    const point = direction(stop.lat, stop.lon).multiplyScalar(WGS84_RADIUS * 1.008)
    const geometry = track(new THREE.SphereGeometry(WGS84_RADIUS * 0.0035, 10, 8))
    const marker = new THREE.Mesh(geometry, track(new THREE.MeshBasicMaterial({ color: 0xe7c49a })))
    marker.position.copy(point)
    scene.add(marker)
    routePoints.push(marker)
    if (!i) return
    const previous = STOPS[i - 1]
    const a = direction(previous.lat, previous.lon), b = direction(stop.lat, stop.lon)
    const angle = Math.acos(clamp(a.dot(b), -1, 1))
    const positions = []
    for (let j = 0; j <= 100; j++) {
      const t = j / 100
      positions.push(a.clone().multiplyScalar(Math.sin((1 - t) * angle)).addScaledVector(b, Math.sin(t * angle))
        .divideScalar(Math.sin(angle)).multiplyScalar(WGS84_RADIUS * (1.005 + Math.sin(t * Math.PI) * 0.04)))
    }
    const line = new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(positions)), track(new THREE.LineBasicMaterial({ color: 0xe7c49a, transparent: true, opacity: 0.24 })))
    scene.add(line)
    routePoints.push(line)
  })

  const apiKey = import.meta.env.VITE_GOOGLE_TILES_KEY
  if (apiKey) {
    tiles = new TilesRenderer()
    tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }))
    tiles.registerPlugin(new TilesFadePlugin({ fadeDuration: 450 }))
    tiles.registerPlugin(new UpdateOnChangePlugin())
    tiles.registerPlugin(regions)
    // Keep parsing bursts off the animation callback and do not change the
    // library's shared queues used by other Lab experiments.
    for (const [name, maxJobs] of [['downloadQueue', 10], ['parseQueue', 1], ['processNodeQueue', 8]]) {
      const queue = new PriorityQueue()
      queue.maxJobs = maxJobs
      queue.priorityCallback = tiles[name].priorityCallback
      queue._schedulingCallback = scheduleBackground
      tiles[name] = queue
    }
    tiles.autoDisableRendererCulling = false
    tiles.addEventListener('needs-render', invalidate)
    tiles.addEventListener('load-model', ({ scene: model }) => {
      invalidate()
      warmQueue.add(model, () => {
        if (disposed || retiredModels.has(model)) return
        // Stage both the current sky and ground/fog variants in a background
        // task. compileAsync's internal polling can outlive disposed tile materials.
        renderer.compile(model, preloadCamera, warmScene)
        renderer.compile(model, preloadCamera, scene)
        model.traverse((object) => {
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of materials) {
            if (!material) continue
            for (const value of Object.values(material)) if (value?.isTexture) renderer.initTexture(value)
          }
        })
        invalidate()
      }).catch(() => { if (!disposed) invalidate() })
    })
    tiles.addEventListener('dispose-model', ({ scene: model }) => { retiredModels.add(model); warmQueue.remove(model) })
    tiles.addEventListener('tile-visibility-change', invalidate)
    // Keep parent geometry until its replacement is ready, avoiding holes while
    // the landmark streams. CSS resolution prevents unnecessary subpixel detail.
    tiles.errorTarget = 20
    tiles.setCamera(preloadCamera)
    tiles.setResolution(preloadCamera, host.clientWidth, host.clientHeight)
    prepareDestination(0)
    scene.add(tiles.group)
    tiles.addEventListener('load-error', ({ tile }) => {
      if (disposed) return
      if (!tile) { rootFailed = true; tileState = 'unavailable'; invalidate() }
    })
  } else {
    rootFailed = true
    tileState = 'unavailable'
  }

  const onScroll = () => {
    requested = scroller.scrollTop / Math.max(1, scroller.scrollHeight - scroller.clientHeight) * STOPS.length
  }
  scroller.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
  current = requested

  const resize = () => {
    const width = host.clientWidth, height = host.clientHeight
    if (!width || !height) return
    renderer.setSize(width, height)
    camera.aspect = width / height
    camera.fov = width < 760 ? 58 : 44
    camera.updateProjectionMatrix()
    tiles?.setResolution(camera, width, height)
    preloadCamera.aspect = camera.aspect
    preloadCamera.fov = camera.fov
    preloadCamera.updateProjectionMatrix()
    tiles?.setResolution(preloadCamera, width, height)
    const destination = preloadIndex
    preloadIndex = -1
    if (destination >= 0) prepareDestination(destination)
    onScroll()
    invalidate()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)

  const sky = new THREE.Color('#a6bccb'), space = new THREE.Color('#060b10')
  const background = new THREE.Color()
  const haze = new THREE.Fog(sky, 9000, 19000)
  const sunOffset = new THREE.Vector3()
  const frameOptions = { minimumHeight, narrow }
  const onContextLost = (event) => { event.preventDefault(); cancelAnimationFrame(raf); onFailure() }
  canvas.addEventListener('webglcontextlost', onContextLost)

  const tick = (time) => {
    if (disposed) return
    raf = requestAnimationFrame(tick)
    const dt = Math.min((time - lastTime) / 1000 || 0.016, 0.1)
    lastTime = time
    if (document.hidden) return
    const previous = current
    current = settings.calm ? requested : THREE.MathUtils.lerp(current, requested, 1 - Math.exp(-dt * 22))
    if (Math.abs(current - requested) < 0.00001) current = requested
    if (current !== previous) invalidate()
    const targetHeight = rootFailed ? WGS84_RADIUS * 0.45 : terrainHeight
    minimumHeight = settings.calm ? targetHeight : Math.exp(THREE.MathUtils.lerp(Math.log(minimumHeight), Math.log(targetHeight), 1 - Math.exp(-dt * 6)))
    if (Math.abs(minimumHeight - targetHeight) < 0.01) minimumHeight = targetHeight
    frameOptions.minimumHeight = minimumHeight
    frameOptions.narrow = host.clientWidth < 760
    // Reduced motion keeps the scroll itinerary but changes only at each destination.
    const sample = settings.calm ? (current < 0.03 ? 0 : Math.min(STOPS.length, Math.floor(current) + 0.94)) : current
    if (sample !== previousSample) { invalidate(); previousSample = sample }
    if (!frame || frame.progress !== sample || previousMinimumHeight !== minimumHeight || previousNarrow !== frameOptions.narrow) {
      frame = journeyFrame(sample, frameOptions)
      previousMinimumHeight = minimumHeight
      previousNarrow = frameOptions.narrow
      invalidate()
    }
    if (!inspection) {
      camera.position.copy(frame.position)
      camera.up.copy(frame.up)
      camera.lookAt(frame.target)
    } else if (controls?.update()) invalidate()
    const altitude = inspection ? Math.max(40, WGS84_ELLIPSOID.getPositionElevation(camera.position) - WGS84_ELLIPSOID.getPositionElevation(frame.target)) : frame.height
    camera.near = Math.max(2, altitude * 0.015)
    camera.far = Math.max(20000, altitude * 20)
    const width = host.clientWidth, height = host.clientHeight
    if (width >= 760) camera.setViewOffset(width, height, -width * frame.viewOffset, 0, width, height)
    else camera.clearViewOffset()
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    const atmosphereAmount = clamp((altitude - 20000) / 400000)
    atmosphere.visible = atmosphereAmount > 0
    atmosphereMaterial.uniforms.strength.value = atmosphereAmount * 0.9
    clouds.visible = altitude > 200000
    cloudMaterial.uniforms.opacity.value = clamp((altitude - 200000) / 700000) * 0.82
    starMaterial.opacity = atmosphereAmount * 0.55
    background.copy(space).lerp(sky, (1 - atmosphereAmount) * 0.96)
    renderer.setClearColor(background)
    haze.color.copy(background)
    haze.near = camera.far * 0.55
    haze.far = camera.far * 0.95
    scene.fog = altitude < 20000 ? haze : null
    sunOffset.set(-0.4, -0.6, 1).multiplyScalar(WGS84_RADIUS * 3)
    sun.position.copy(camera.position).add(sunOffset)
    routePoints.forEach((object) => { object.visible = altitude > 200000 })

    if (tiles && !rootFailed) {
      tiles.group.visible = altitude < 350000
      // The destination camera loads a bounded local view even from orbit.
      // Never ask the orbit camera to download an entire visible hemisphere.
      const needsActiveCamera = altitude < 25000
      if (needsActiveCamera !== activeCamera) {
        activeCamera = needsActiveCamera
        if (activeCamera) {
          tiles.setCamera(camera)
          tiles.setResolution(camera, width, height)
        } else tiles.deleteCamera(camera)
        tileUpdateNeeded = true
      }
      const requestedIndex = Math.min(STOPS.length - 1, Math.floor(requested))
      prepareDestination(requestedIndex !== frame.index ? requestedIndex : Math.min(STOPS.length - 1, frame.index + (frame.phase === 'arrived' && readyStops.has(frame.index) && altitude < 3000 ? 1 : 0)))
      detailRegion.sphere.center.copy(frame.target)
      if (frame.phase !== 'orbit') regions.addRegion(detailRegion)
      else regions.removeRegion(detailRegion)
      // Tile selection runs separately from display refresh; drawing and input
      // remain on every rAF, including 120/144 Hz displays.
      if (tileUpdateNeeded || time - lastTileUpdate >= 50) {
        scene.updateMatrixWorld(true)
        tiles.update()
        lastTileUpdate = time
        tileUpdateNeeded = false
        visibleTiles = 0
        localTiles = 0
        terrainHeight = WGS84_RADIUS * 0.45
        readyStops.clear()
        for (const tile of tiles.visibleTiles) {
          if (!tile.engineData.scene) continue
          const bounds = tile.engineData.boundingVolume
          // Use coarse terrain from a safe distance, then move closer as the
          // local mesh improves. Distant bounding boxes cannot unlock descent.
          if (bounds.distanceToPoint(frame.target) < 350) {
            terrainHeight = Math.min(terrainHeight, tile.geometricError <= 12 ? 1 : Math.max(2500, tile.geometricError * 120))
            if (tile.geometricError <= 12) localTiles++
          }
          if (tile.geometricError > 12) continue
          landingFrames.forEach((landing, index) => {
            if (bounds.distanceToPoint(landing.target) < 350) readyStops.add(index)
          })
        }
        // The display camera also sees terrain above 25 km, where it is not a
        // tile-loading camera. Count its view independently of the loading list.
        if (tiles.group.visible) {
          displayFrustum.setFromProjectionMatrix(displayMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
          for (const tile of tiles.visibleTiles) if (tile.engineData.boundingVolume.intersectsFrustum(displayFrustum)) visibleTiles++
        }
      }
      if (!tiles.group.visible) visibleTiles = 0
      // Provider bounding boxes can overlap the landmark even when their meshes
      // are distant. Use the renderer's actual pending work to detect completion.
      const pending = tiles.stats.queued + tiles.stats.downloading + tiles.stats.parsing
      tileState = visibleTiles > 0 && localTiles > 0 ? 'ready' : 'loading'
      // Keep the globe beneath streamed terrain so incomplete tiles have a base.
      globe.visible = true
      if (pending === 0 && tiles.stats.failed > 0 && tiles.visibleTiles.size === 0) {
        rootFailed = true
        tileState = 'unavailable'
        tiles.group.visible = false
        globe.visible = true
        invalidate()
      }
    }
    if (needsRender) {
      renderer.render(scene, camera)
      needsRender = false
    }

    if (time - lastHud > 140) {
      lastHud = time
      if (tiles && !rootFailed) lastAttribution = visibleTiles ? tiles.getAttributions([]).filter((item) => item.type === 'string').map((item) => item.value).filter(Boolean).join(' · ') : ''
      canvas.dataset.cameraAltitude = String(Math.round(altitude))
      canvas.dataset.cameraPosition = camera.position.toArray().map((v) => Math.round(v)).join(',')
      canvas.dataset.localTiles = String(localTiles)
      canvas.dataset.terrainHeight = String(Math.round(terrainHeight))
      canvas.dataset.viewOffset = frame.viewOffset.toFixed(5)
      if (import.meta.env.DEV && tiles) {
        canvas.dataset.tileStats = JSON.stringify({ queued: tiles.stats.queued, downloading: tiles.stats.downloading, parsing: tiles.stats.parsing, loaded: tiles.stats.loaded, visible: visibleTiles })
        canvas.dataset.preloadDestination = STOPS[preloadIndex]?.id || ''
        canvas.dataset.preloadedTiles = String(tiles.visibleTiles.size)
        canvas.dataset.loadingCamera = String(activeCamera)
      }
      onUpdate({ progress: current, index: frame.index, phase: frame.phase, height: altitude, lat: frame.lat, lon: frame.lon, tiles: tileState, attribution: lastAttribution, visibleTiles })
    }
  }
  raf = requestAnimationFrame(tick)

  return {
    inspect(enabled) {
      inspection = enabled
      invalidate()
      controls?.dispose()
      controls = null
      canvas.style.touchAction = enabled ? 'none' : 'pan-y'
      if (enabled) {
        // OrbitControls captures the up axis in its constructor. Recreate it at
        // the destination so dragging follows the local horizon on every continent.
        // Use the displayed frame, including reduced-motion destination snapping.
        controls = new OrbitControls(camera, canvas)
        controls.enableDamping = true
        controls.dampingFactor = 0.075
        controls.enablePan = false
        controls.maxPolarAngle = Math.PI * 0.47
        controls.target.copy(frame.target)
        controls.minDistance = 100
        controls.maxDistance = 6500
        controls.update()
      }
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      scroller.removeEventListener('scroll', onScroll)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      controls?.dispose()
      tiles?.dispose()
      warmQueue.removeByFilter(() => true)
      resources.forEach((resource) => resource.dispose())
      renderer.dispose()
      canvas.remove()
    },
  }
}
