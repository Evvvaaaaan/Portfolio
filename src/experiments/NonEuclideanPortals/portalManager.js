import * as THREE from 'three'
import { relativePortalMatrix } from './portalMath.js'

export class PortalManager {
  // roomScenes: Map<roomId, THREE.Scene>, portalsById: Map<portalId, Portal>
  constructor(renderer, roomScenes, portalsById) {
    this.renderer = renderer
    this.roomScenes = roomScenes
    this.portalsById = portalsById
    this.virtualCam = new THREE.PerspectiveCamera()
  }

  // Render each portal in the current room by drawing the linked room from a
  // virtual camera transformed by the portal-to-portal relative matrix.
  renderPortalViews(currentRoomId, mainCam, portalsInRoom, depth = 1) {
    for (const portal of portalsInRoom) {
      const exit = this.portalsById.get(portal.def.link)
      if (!exit) continue
      const rel = relativePortalMatrix(portal.matrix, exit.matrix)

      // Virtual camera = main camera transformed into the exit room.
      this.virtualCam.copy(mainCam)
      this.virtualCam.matrixWorld.multiplyMatrices(rel, mainCam.matrixWorld)
      this.virtualCam.matrixWorld.decompose(
        this.virtualCam.position, this.virtualCam.quaternion, this.virtualCam.scale,
      )
      this.virtualCam.projectionMatrix.copy(mainCam.projectionMatrix)
      this.virtualCam.updateMatrixWorld(true)

      // Oblique near plane at the exit portal so geometry behind it is clipped.
      applyObliqueClip(this.virtualCam, exit.matrix)

      const exitScene = this.roomScenes.get(exit.roomId)
      if (depth > 1) {
        const exitPortals = []
        exitScene.traverse((o) => { if (o.userData.portal) exitPortals.push(o.userData.portal) })
        this.renderPortalViews(exit.roomId, this.virtualCam, exitPortals, depth - 1)
      }
      const prevTarget = this.renderer.getRenderTarget()
      this.renderer.setRenderTarget(portal.target)
      this.renderer.clear()
      this.renderer.render(exitScene, this.virtualCam)
      this.renderer.setRenderTarget(prevTarget)
    }
  }
}

// Skew the projection matrix so its near plane coincides with the portal plane,
// clipping everything on the wrong side of the exit portal.
function applyObliqueClip(cam, portalMatrixWorld) {
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(portalMatrixWorld)
  const point = new THREE.Vector3().setFromMatrixPosition(portalMatrixWorld)
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point)
  plane.applyMatrix4(cam.matrixWorldInverse) // into view space

  const clipPlane = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
  const proj = cam.projectionMatrix
  const q = new THREE.Vector4(
    (Math.sign(clipPlane.x) + proj.elements[8]) / proj.elements[0],
    (Math.sign(clipPlane.y) + proj.elements[9]) / proj.elements[5],
    -1,
    (1 + proj.elements[10]) / proj.elements[14],
  )
  const c = clipPlane.multiplyScalar(2 / clipPlane.dot(q))
  proj.elements[2] = c.x
  proj.elements[6] = c.y
  proj.elements[10] = c.z + 1
  proj.elements[14] = c.w
}
