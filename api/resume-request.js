import {
  assertPost,
  cleanText,
  insertSupabase,
  isEmail,
  readJson,
  sendEmail,
  sendJson,
} from './_utils.js'

export default async function handler(req, res) {
  if (!assertPost(req, res)) return

  try {
    const body = await readJson(req)
    const name = cleanText(body.name, 120)
    const email = cleanText(body.email, 180)
    const phone = cleanText(body.phone, 80)

    if (!name || !isEmail(email) || !phone) {
      sendJson(res, 400, { ok: false, error: 'Invalid resume request data' })
      return
    }

    const [record] = await insertSupabase('resume_requests', {
      name,
      email,
      phone,
      source: 'portfolio',
    })

    await sendEmail({
      subject: `[Portfolio] Resume request from ${name}`,
      replyTo: email,
      html: `
        <h2>New resume request</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
      `,
    })

    sendJson(res, 200, { ok: true, id: record?.id ?? null })
  } catch (error) {
    console.error(error)
    sendJson(res, 500, { ok: false, error: 'Resume request failed' })
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
