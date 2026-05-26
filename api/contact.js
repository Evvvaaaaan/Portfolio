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
    const message = cleanText(body.message, 4000)

    if (!name || !isEmail(email) || !message) {
      sendJson(res, 400, { ok: false, error: 'Invalid contact form data' })
      return
    }

    const [record] = await insertSupabase('contact_messages', {
      name,
      email,
      message,
      source: 'portfolio',
    })

    await sendEmail({
      subject: `[Portfolio] New contact message from ${name}`,
      replyTo: email,
      html: `
        <h2>New portfolio contact message</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
      `,
    })

    sendJson(res, 200, { ok: true, id: record?.id ?? null })
  } catch (error) {
    console.error(error)
    sendJson(res, 500, { ok: false, error: 'Contact request failed' })
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
