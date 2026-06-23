import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import fontData from 'three/examples/fonts/helvetiker_bold.typeface.json'
import './HeroTitle3D.css'

const VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    vNormal = normalMatrix * normal;
    gl_Position = projectionMatrix * mvPos;
  }
`

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uTiltX;
  uniform float uTiltY;

  varying vec3 vNormal;
  varying vec3 vViewDir;

  vec3 hue2rgb(float h) {
    h = fract(h);
    float r = abs(h * 6.0 - 3.0) - 1.0;
    float g = 2.0 - abs(h * 6.0 - 2.0);
    float b = 2.0 - abs(h * 6.0 - 4.0);
    return clamp(vec3(r, g, b), 0.0, 1.0);
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewDir);

    float fresnel = pow(1.0 - max(dot(n, v), 0.0), 1.8);

    // Holographic hue: shifts with tilt angle + time + surface normal
    float hue = n.x * 0.22 + n.y * 0.14 + fresnel * 0.72
              + uTiltX * 0.28 + uTiltY * 0.22 + uTime * 0.045;

    vec3 rainbow = hue2rgb(hue);
    vec3 base = vec3(0.88, 0.92, 1.0);

    // Mix: front faces show more rainbow, edges glow strongly
    vec3 color = mix(base * 0.6, rainbow * 1.1, fresnel * 0.75 + 0.25);

    // Front face brighter than sides
    float front = max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0);
    color = mix(color * 0.55, color * 1.15, front * 0.65 + 0.35);

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function HeroTitle3D() {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    const FOV = 40
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100)

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    const uniforms = {
      uTime: { value: 0 },
      uTiltX: { value: 0 },
      uTiltY: { value: 0 },
    }

    const font = new FontLoader().parse(fontData)

    // Line 1: "Hi, I'm" — smaller, shallower
    const geo1 = new TextGeometry("Hi, I'm", {
      font,
      size: 0.62,
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.018,
      bevelSegments: 5,
      curveSegments: 10,
    })
    geo1.computeBoundingBox()
    geo1.center()
    const h1 = geo1.boundingBox.max.y - geo1.boundingBox.min.y

    // Line 2: "Evan" — large, deep extrusion for impact
    const geo2 = new TextGeometry('Evan', {
      font,
      size: 1.1,
      depth: 0.30,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.025,
      bevelSegments: 8,
      curveSegments: 12,
    })
    geo2.computeBoundingBox()
    geo2.center()
    const h2 = geo2.boundingBox.max.y - geo2.boundingBox.min.y
    const w1 = geo1.boundingBox.max.x - geo1.boundingBox.min.x
    const w2 = geo2.boundingBox.max.x - geo2.boundingBox.min.x

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
    })

    const mesh1 = new THREE.Mesh(geo1, mat)
    const mesh2 = new THREE.Mesh(geo2, mat)

    // Stack "Hi, I'm" above "Evan", vertically centered
    const spacing = 0.18
    mesh2.position.y = -(h1 + spacing) / 2
    mesh1.position.y = h2 / 2 + spacing / 2

    const group = new THREE.Group()
    group.add(mesh1)
    group.add(mesh2)
    scene.add(group)

    const fitCamera = () => {
      const W = mount.clientWidth
      const H = mount.clientHeight
      if (!W || !H) return
      renderer.setSize(W, H)
      camera.aspect = W / H
      // Fit the wider of the two texts to ~60% of canvas width
      const maxW = Math.max(w1, w2)
      const fovH = 2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * camera.aspect)
      camera.position.z = maxW / (2 * Math.tan(fovH / 2) * 0.52)
      camera.updateProjectionMatrix()
    }
    fitCamera()

    // Input: mouse (desktop) + gyroscope (mobile)
    const tilt = { x: 0, y: 0 }
    const target = { x: 0, y: 0 }

    const onMouse = (e) => {
      target.x = -(e.clientY / window.innerHeight - 0.5) * 2
      target.y = (e.clientX / window.innerWidth - 0.5) * 2
    }

    const onOrientation = (e) => {
      if (e.beta !== null && e.gamma !== null) {
        target.x = Math.max(-1, Math.min(1, (e.beta - 45) / 35))
        target.y = Math.max(-1, Math.min(1, e.gamma / 35))
      }
    }

    window.addEventListener('mousemove', onMouse)
    window.addEventListener('deviceorientation', onOrientation)
    window.addEventListener('resize', fitCamera)

    const clock = new THREE.Clock()
    let raf

    const animate = () => {
      raf = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      tilt.x += (target.x - tilt.x) * 0.07
      tilt.y += (target.y - tilt.y) * 0.07

      uniforms.uTime.value = t
      uniforms.uTiltX.value = tilt.x
      uniforms.uTiltY.value = tilt.y

      // 3D tilt: "Evan" shows depth extrusion when tilted
      group.rotation.x = tilt.x * 0.22
      group.rotation.y = tilt.y * 0.28

      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('deviceorientation', onOrientation)
      window.removeEventListener('resize', fitCamera)
      geo1.dispose()
      geo2.dispose()
      mat.dispose()
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className="hero-title-3d" />
}
