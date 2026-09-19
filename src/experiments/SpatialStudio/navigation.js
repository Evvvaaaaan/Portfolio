export function isStableScene(metadata) {
  const gate = metadata?.qualityGate
  return metadata?.representation === 'closed-solids-v1' && gate?.status === 'passed'
    && gate.version === 1 && gate.nonManifoldEdges === 0 && gate.degenerateFaces === 0
    && gate.furnitureOverlaps === 0 && gate.photoProjectedSurfaces === 0
    && gate.cameraOutsideGeometry === true && gate.inspectedViews >= 39
    && gate.exportRoundTrip === true
    && Array.isArray(metadata.cameras) && metadata.cameras.length > 0
}

export function horizontalRadius(metadata) {
  return isStableScene(metadata) ? Math.PI / 2 : 0
}
