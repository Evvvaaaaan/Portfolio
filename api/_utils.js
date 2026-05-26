const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') return JSON.parse(req.body)

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

export function cleanText(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max)
}

export function isEmail(value) {
  return EMAIL_RE.test(String(value ?? '').trim())
}

export function assertPost(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return false
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return false
  }

  return true
}

export async function insertSupabase(table, payload) {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Supabase insert failed: ${errorText}`)
  }

  return response.json()
}

export async function sendEmail({ subject, html, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const to = process.env.CONTACT_TO_EMAIL

  if (!apiKey || !from || !to) return null

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      reply_to: replyTo,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Resend email failed: ${errorText}`)
  }

  return response.json()
}
