import * as THREE from 'three'
import { AIRCRAFT } from './aircraft.js'

// Original meshes share the same forward axis and cockpit origin as the C172.
export function createAirframes(plane, fallback, own) {
  const trainer = new THREE.Group()
  trainer.add(fallback)
  plane.add(trainer)
  const groups = { trainer }, propellers = []
  const cube = own(new THREE.BoxGeometry(1, 1, 1))
  const sphere = own(new THREE.SphereGeometry(1, 16, 10))
  const mat = (color, options = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: .48, ...options }))
  const white = mat('#f5f0df'), glass = mat('#355c69', { metalness: .3, roughness: .15 }), dark = mat('#263a40')
  const mesh = (parent, geometry, material, position, scale = [1, 1, 1]) => {
    const object = new THREE.Mesh(geometry, material)
    object.position.set(...position); object.scale.set(...scale)
    object.castShadow = true; object.receiveShadow = true
    parent.add(object)
    return object
  }
  const wing = (parent, points, material, position) => {
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)))
    const geometry = own(new THREE.ExtrudeGeometry(shape, { depth: .16, bevelEnabled: true, bevelSize: .06, bevelThickness: .04, bevelSegments: 1, steps: 1 }))
    geometry.rotateX(-Math.PI / 2)
    return mesh(parent, geometry, material, position)
  }
  for (const aircraft of AIRCRAFT.slice(1)) {
    const group = new THREE.Group(), accent = mat(aircraft.color)
    group.name = aircraft.id; groups[aircraft.id] = group; plane.add(group)
    const jet = aircraft.id === 'jet', glider = aircraft.id === 'sailplane'
    const body = mesh(group, sphere, white, [0, 0, .2], [jet ? .95 : .65, .68, jet ? 6.4 : 4.6])
    body.name = 'fuselage'
    mesh(group, sphere, glass, [0, .66, -1.5], [.61, .57, glider ? 1.7 : 1.35])
    mesh(group, sphere, accent, [0, 0, jet ? -5.5 : -3.9], [jet ? .48 : .6, .57, .9])
    const span = aircraft.wingspan, wingY = aircraft.id === 'bush' ? 1.2 : -.1
    wing(group, [[-span, jet ? 2.4 : 0], [-span + .4, jet ? 1.5 : -.6], [-1, -1.5], [1, -1.5], [span - .4, jet ? 1.5 : -.6], [span, jet ? 2.4 : 0], [1, 1], [-1, 1]], white, [0, wingY, 0])
    wing(group, [[-2.7, .8], [-2.3, -.6], [0, -1], [2.3, -.6], [2.7, .8]], accent, [0, glider ? 2 : .35, 4.3])
    const fin = wing(group, [[0, 0], [2.3, .8], [2.3, 2], [0, 1.6]], accent, [0, .2, 3.3])
    fin.rotation.z = Math.PI / 2
    for (const side of [-1, 1]) {
      mesh(group, cube, accent, [side * (span - .7), wingY + .05, jet ? 1.9 : -.1], [.75, .2, jet ? .75 : .9])
      mesh(group, cube, accent, [side * .64, .05, 1.1], [.04, .18, 3.9])
      if (jet) {
        mesh(group, sphere, accent, [side * 1.35, .1, 3.1], [.64, .65, 1.8])
        const exhaust = mesh(group, own(new THREE.CylinderGeometry(.42, .42, .3, 16)), dark, [side * 1.35, .1, 4.6])
        exhaust.rotation.x = Math.PI / 2
      } else if (!glider) {
        const brace = mesh(group, cube, dark, [side * 2.5, .05, .2], [.08, 3.6, .08])
        brace.rotation.z = side * -1.03
        const gear = mesh(group, cube, dark, [side * 1.1, -.85, .3], [.13, 1.4, .13])
        gear.rotation.z = side * .25
        const wheel = mesh(group, own(new THREE.CylinderGeometry(.55, .55, .35, 16)), dark, [side * 1.35, -1.5, .3])
        wheel.rotation.z = Math.PI / 2
      }
    }
    if (!jet) {
      const propeller = new THREE.Group()
      propeller.position.z = -4.85; group.add(propeller)
      mesh(propeller, cube, dark, [0, 0, 0], [.14, glider ? 2.2 : 3.4, .08])
      mesh(propeller, sphere, accent, [0, 0, -.12], [.2, .2, .3])
      propellers.push(propeller)
    }
    group.visible = false
  }
  return {
    trainer,
    update(id, elapsed, calm) {
      for (const [key, group] of Object.entries(groups)) group.visible = key === id
      for (const propeller of propellers) propeller.rotation.z = elapsed * (calm ? 8 : 75)
    },
  }
}
