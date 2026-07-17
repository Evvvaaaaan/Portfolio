import { insertSupabase, readJson, selectSupabase, sendJson } from './_utils.js'
import { hashIp, validateEntry } from './_guestbook.js'

const TABLE = 'guestbook_entries'
const PUBLIC_FIELDS = 'id,nickname,message,emoji,lat,lng,created_at'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  sendJson(res, 405, { ok: false, error: 'Method not allowed' })
}

async function handleGet(req, res) {
  try {
    const entries = await selectSupabase(
      TABLE,
      `select=${PUBLIC_FIELDS}&is_hidden=eq.false&order=created_at.desc&limit=300`,
    )
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60')
    sendJson(res, 200, { ok: true, entries })
  } catch (error) {
    console.error('Guestbook GET error:', error)
    sendJson(res, 500, { ok: false, error: 'Failed to load guestbook' })
  }
}

async function handlePost(req, res) {
  try {
    const body = await readJson(req)

    // 허니팟: 봇이 채우는 숨김 필드. 채워져 있으면 저장 없이 성공한 척한다.
    if (body.website) {
      sendJson(res, 200, { ok: true, entry: null })
      return
    }

    const result = validateEntry(body)
    if (!result.ok) {
      sendJson(res, 400, { ok: false, error: `Invalid field: ${result.error}` })
      return
    }

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
    const ipHash = hashIp(ip)

    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
    const recent = await selectSupabase(
      TABLE,
      `select=id&ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(oneHourAgo)}&limit=3`,
    )
    if (recent.length >= 3) {
      sendJson(res, 429, { ok: false, error: 'Rate limit exceeded' })
      return
    }

    const [row] = await insertSupabase(TABLE, { ...result.value, ip_hash: ipHash })
    const { id, nickname, message, emoji, lat, lng, created_at } = row
    sendJson(res, 200, { ok: true, entry: { id, nickname, message, emoji, lat, lng, created_at } })
  } catch (error) {
    console.error('Guestbook POST error:', error)
    sendJson(res, 500, { ok: false, error: 'Failed to save entry' })
  }
}
