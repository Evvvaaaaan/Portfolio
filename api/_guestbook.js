import { createHash } from 'node:crypto'
import { cleanText } from './_utils.js'
import { GUESTBOOK_EMOJI } from '../src/pages/Guestbook/emoji.js'

export { GUESTBOOK_EMOJI }

function roundCoord(v) {
  return Math.round(v * 10) / 10
}

// 방명록 POST 본문 검증. 성공 시 좌표가 소수 1자리로 반올림된 정규화 값을 돌려준다.
export function validateEntry(body) {
  const nickname = cleanText(body.nickname, 20)
  const message = cleanText(body.message, 200)
  const emoji = body.emoji ? String(body.emoji) : null
  const lat = Number(body.lat)
  const lng = Number(body.lng)

  if (!nickname) return { ok: false, error: 'nickname' }
  if (!message) return { ok: false, error: 'message' }
  if (emoji && !GUESTBOOK_EMOJI.includes(emoji)) return { ok: false, error: 'emoji' }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { ok: false, error: 'lat' }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { ok: false, error: 'lng' }

  return { ok: true, value: { nickname, message, emoji, lat: roundCoord(lat), lng: roundCoord(lng) } }
}

// 레이트 리밋용 IP 해시. 원본 IP는 저장하지 않는다.
export function hashIp(ip, salt = process.env.GUESTBOOK_IP_SALT || 'guestbook') {
  return createHash('sha256').update(`${ip}${salt}`).digest('hex')
}
