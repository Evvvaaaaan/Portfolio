import { latLngToVector3 } from './geo.js'

// 등장방형(equirectangular) 마스크 이미지를 샘플링해 육지 도트의 구면 좌표를 만든다.
// specular 맵 기준: 바다가 밝고 육지가 어둡다 → 어두운 픽셀 = 육지.
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
      for (let py = 0; py < img.height; py += step) {
        for (let px = 0; px < img.width; px += step) {
          const i = (py * img.width + px) * 4
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
          if (brightness < threshold) {
            const lat = 90 - (py / img.height) * 180
            const lng = (px / img.width) * 360 - 180
            positions.push(...latLngToVector3(lat, lng, radius))
          }
        }
      }
      resolve(new Float32Array(positions))
    }
    img.onerror = reject
    img.src = imageUrl
  })
}
