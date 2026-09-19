import * as THREE from 'three'

export const OUTFITS = [
  { id: 'jacket', name: 'Utility jacket', ko: '유틸리티 재킷', color: '#556959', material: 'COTTON TWILL', index: '01' },
  { id: 'knit', name: 'Studio knit', ko: '스튜디오 니트', color: '#ddcab2', material: 'SOFT KNIT', index: '02' },
  { id: 'coat', name: 'Longline coat', ko: '롱라인 코트', color: '#343b48', material: 'WOOL BLEND', index: '03' },
]

export function disposeObject(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set()
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material)
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
    }
  })
  textures.forEach((t) => t.dispose())
  materials.forEach((m) => m.dispose())
  geometries.forEach((g) => g.dispose())
}

export function normalizeModel(root) {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  if (!Number.isFinite(size.y) || size.y < 0.001 || !Number.isFinite(size.x + size.z)) throw new Error('INVALID_MODEL')
  let triangles = 0
  root.traverse((object) => {
    if (!object.isMesh) return
    triangles += (object.geometry.index?.count || object.geometry.attributes.position?.count || 0) / 3
    object.castShadow = object.receiveShadow = true
  })
  if (triangles > 600000) throw new Error('MODEL_TOO_LARGE')
  const group = new THREE.Group()
  const center = box.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= box.min.y
  group.add(root)
  group.scale.setScalar(1.8 / size.y)
  return group
}

export function createMannequin(outfit = 'jacket', color) {
  const root = new THREE.Group()
  const def = OUTFITS.find((o) => o.id === outfit) || OUTFITS[0]
  const skin = new THREE.MeshStandardMaterial({ color: '#c5bcb0', roughness: 0.48, metalness: 0.06 })
  const cloth = new THREE.MeshStandardMaterial({ color: color || def.color, roughness: outfit === 'jacket' ? 0.86 : 0.96, side: THREE.DoubleSide })
  const pants = new THREE.MeshStandardMaterial({ color: '#343738', roughness: 0.91 })
  const shoes = new THREE.MeshStandardMaterial({ color: '#e7e0d5', roughness: 0.62 })
  const seam = new THREE.MeshStandardMaterial({ color: '#a69a81', roughness: 0.7, metalness: 0.15 })
  const dark = new THREE.MeshStandardMaterial({ color: '#29302d', roughness: 0.8 })

  function mesh(geometry, material, position = [0, 0, 0], scale = [1, 1, 1]) {
    const object = new THREE.Mesh(geometry, material)
    object.position.set(...position)
    object.scale.set(...scale)
    object.castShadow = object.receiveShadow = true
    root.add(object)
    return object
  }
  function ellipsoid(material, position, scale) {
    return mesh(new THREE.SphereGeometry(1, 32, 24), material, position, scale)
  }
  function tube(a, b, ra, rb, material) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b)
    const delta = end.clone().sub(start)
    const object = mesh(new THREE.CylinderGeometry(rb, ra, delta.length(), 32), material, start.clone().add(end).multiplyScalar(0.5).toArray())
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
    return object
  }
  function lathe(profile, material, depth = 0.66) {
    const points = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(64)
    return mesh(new THREE.LatheGeometry(points, 64), material, [0, 0, 0], [1, 1, depth])
  }

  // A deliberately neutral display mannequin, not a reconstruction of the uploaded person.
  lathe([[0.12, 0.93], [0.17, 1.02], [0.15, 1.2], [0.2, 1.43], [0.21, 1.47], [0.065, 1.55]], skin)
  lathe([[0.177, 0.9], [0.187, 0.98], [0.174, 1.045]], pants, 0.71)
  tube([0, 1.46, 0], [0, 1.64, 0], 0.065, 0.06, skin)
  lathe([[0.012, 1.61], [0.066, 1.62], [0.09, 1.67], [0.11, 1.74], [0.108, 1.82], [0.075, 1.88], [0.002, 1.9]], skin, 0.86)
  ellipsoid(skin, [0, 1.735, 0.09], [0.017, 0.034, 0.033])
  for (const side of [-1, 1]) {
    ellipsoid(skin, [side * 0.106, 1.746, 0], [0.018, 0.035, 0.023])
    const hip = [side * 0.103, 0.98, 0], knee = [side * 0.115, 0.55, 0.007], ankle = [side * 0.13, 0.13, 0]
    tube(hip, knee, 0.105, 0.083, pants)
    ellipsoid(pants, knee, [0.083, 0.09, 0.083])
    tube(knee, ankle, 0.083, 0.061, pants)
    ellipsoid(shoes, [side * 0.13, 0.075, 0.055], [0.081, 0.067, 0.155])
    mesh(new THREE.BoxGeometry(0.14, 0.015, 0.25), dark, [side * 0.13, 0.023, 0.04])
    for (let l = 0; l < 4; l++) tube([side * 0.13 - 0.045, 0.126, 0.02 + l * 0.022], [side * 0.13 + 0.045, 0.126, 0.02 + l * 0.022], 0.004, 0.004, shoes)
    const shoulder = [side * 0.205, 1.455, 0], elbow = [side * 0.315, 1.2, 0], wrist = [side * 0.365, 0.995, 0.025]
    ellipsoid(cloth, shoulder, [0.093, 0.09, 0.09])
    tube(shoulder, elbow, 0.087, 0.069, cloth)
    ellipsoid(cloth, elbow, [0.07, 0.071, 0.07])
    tube(elbow, wrist, 0.069, 0.052, cloth)
    ellipsoid(skin, [side * 0.38, 0.94, 0.035], [0.039, 0.073, 0.029])
    tube([side * 0.36, 1.022, 0.022], wrist, 0.057, 0.055, outfit === 'jacket' ? dark : cloth)
  }
  const hem = outfit === 'coat' ? 0.69 : 1.015
  const hips = outfit === 'coat' ? [[0.242, 0.9], [0.235, 1.02]] : []
  lathe([[0.21, hem], [0.215, hem + 0.018], ...hips, [0.196, 1.16], [0.219, 1.4], [0.23, 1.46], [0.225, 1.5], [0.095, 1.563], [0.079, 1.565]], cloth)
  // Raised hems and cuffs make the garment a separate volume with construction detail.
  lathe([[0.212, hem], [0.213, hem + 0.016], [0.211, hem + 0.026]], cloth)
  if (outfit === 'knit') {
    lathe([[0.082, 1.55], [0.082, 1.585], [0.071, 1.594]], cloth)
    for (let i = -8; i <= 8; i++) {
      const x = i * 0.018
      tube([x, 1.025, Math.sqrt(Math.max(0, 0.21 ** 2 - x ** 2)) * 0.665], [x, 1.08, Math.sqrt(Math.max(0, 0.207 ** 2 - x ** 2)) * 0.665], 0.0015, 0.0015, seam)
    }
  } else {
    tube([0, hem + 0.02, 0.146], [0, 1.52, 0.131], 0.005, 0.005, dark)
    for (let i = 0; i < 5; i++) ellipsoid(seam, [0.018, 1.43 - i * 0.077, 0.145], [0.007, 0.007, 0.003])
    for (const side of [-1, 1]) {
      const pocket = mesh(new THREE.BoxGeometry(0.091, 0.09, 0.008), cloth, [side * 0.117, 1.3, 0.127])
      pocket.rotation.y = side * 0.25
      tube([side * 0.073, 1.342, 0.134], [side * 0.158, 1.342, 0.123], 0.002, 0.002, seam)
      const collar = mesh(new THREE.BoxGeometry(0.08, 0.105, 0.018), cloth, [side * 0.07, 1.52, 0.096])
      collar.rotation.z = side * -0.55
      collar.rotation.x = -0.22
    }
    if (outfit === 'coat') {
      tube([-0.173, 1.05, 0.084], [0.173, 1.05, 0.084], 0.012, 0.012, cloth)
      mesh(new THREE.TorusGeometry(0.016, 0.003, 8, 20), seam, [0.036, 1.05, 0.143])
    }
  }
  root.userData.demo = true
  return root
}
