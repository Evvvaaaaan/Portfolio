import { latLonToDirection } from './sphereFrame.js'

// 등장방형(equirectangular) 마스크 이미지를 샘플링해 육지 도트의 구면 좌표를
// 만든다. 어두운 픽셀 = 육지. src/pages/Guestbook/landDots.js와 동일한
// 기법이지만 이 실험 자신의 sphereFrame 변환을 쓰는 독립 사본이다 (실험은
// 서로 다른 실험/페이지 폴더를 import하지 않는 기존 관례를 따른다).
export function loadLandDots(imageUrl, { radius = 1, step = 2, threshold = 90 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, img.width, img.height)

      const positions = []
      const dir = { x: 0, y: 0, z: 0 }
      const setDir = (v) => { dir.x = v.x; dir.y = v.y; dir.z = v.z }
      for (let py = 0; py < img.height; py += step) {
        for (let px = 0; px < img.width; px += step) {
          const i = (py * img.width + px) * 4
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
          if (brightness < threshold) {
            const lat = 90 - (py / img.height) * 180
            const lon = (px / img.width) * 360 - 180
            setDir(latLonToDirection(lat, lon))
            positions.push(dir.x * radius, dir.y * radius, dir.z * radius)
          }
        }
      }
      resolve(new Float32Array(positions))
    }
    img.onerror = reject
    img.src = imageUrl
  })
}
