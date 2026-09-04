import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

// 렌더러·카메라·환경맵 부트스트랩.
//
// 환경맵은 HDR 파일 대신 three 내장 RoomEnvironment을 PMREM으로 굽는다.
// 외부 에셋이 0바이트라 첫 로딩이 사실상 없고, 나중에 실제 HDR을 쓰고 싶으면
// 여기서 RGBELoader로 texture를 받아 같은 PMREMGenerator에 넘기면 된다.
export function createScene(canvas, { simple = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !simple,
    alpha: true, // 사이트 전역 SpaceBackground의 별빛이 뒤로 비치게 둔다
    powerPreference: 'high-performance',
  })
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.AgXToneMapping
  renderer.toneMappingExposure = 1.15

  const dprCap = simple ? 1.5 : 2
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04)
  scene.environment = envRT.texture
  scene.environmentIntensity = simple ? 0.85 : 0.6

  // 심우주의 태양 — 그림자 없는 단일 평행광. 환경맵만으로는 형태가 뭉개진다.
  const sun = new THREE.DirectionalLight(0xfff2e0, simple ? 2.2 : 2.8)
  sun.position.set(6, 4.5, 7)
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0x8faaff, 0.35)
  fill.position.set(-7, -2, -5)
  scene.add(fill)

  let aspect = 1

  function resize() {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    aspect = w / h
    camera.aspect = aspect
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap))
    renderer.setSize(w, h, false)
    return aspect
  }
  resize()

  return {
    renderer,
    scene,
    camera,
    resize,
    get aspect() {
      return aspect
    },
    dispose() {
      envRT.dispose()
      pmrem.dispose()
      renderer.dispose()
    },
  }
}
