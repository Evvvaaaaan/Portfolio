import * as THREE from 'three'
import { portalMatrix } from './portalMath.js'

export class Portal {
  constructor(def, roomId) {
    this.def = def
    this.roomId = roomId
    this.matrix = portalMatrix(new THREE.Vector3(...def.position), def.yaw)
    this.target = new THREE.WebGLRenderTarget(1024, 1024, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    })
    const geo = new THREE.PlaneGeometry(def.halfW * 2, def.height)
    // Plane is centered; shift so its base sits on the floor (portal y is center).
    this.material = new THREE.MeshBasicMaterial({ map: this.target.texture })
    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.applyMatrix4(this.matrix)
    this.mesh.userData.portal = this
  }

  dispose() {
    this.target.dispose()
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
