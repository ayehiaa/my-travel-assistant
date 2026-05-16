import { Resend } from 'resend'

// Configure RESEND_FROM_EMAIL to a verified Resend sender domain.
// Configure NEXT_PUBLIC_APP_URL to your production URL.
const FROM = process.env.RESEND_FROM_EMAIL ?? 'Sojourn <noreply@sojourn.app>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
  return new Resend(process.env.RESEND_API_KEY)
}

function baseTemplate(body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 16px;">
    <div style="background:#1d4ed8;border-radius:12px 12px 0 0;padding:24px 32px;display:flex;align-items:center;gap:10px;">
      <span style="width:34px;height:34px;background:#facc15;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;color:#1e3a8a;transform:rotate(-6deg);">S</span>
      <span style="font-size:20px;font-weight:700;color:white;letter-spacing:-0.02em;">Sojourn</span>
    </div>
    <div style="background:white;border-radius:0 0 12px 12px;padding:32px;border:1px solid #e5e7eb;border-top:none;">
      ${body}
      <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;">
      <p style="font-size:12px;color:#9ca3af;margin:0;">
        You received this email because someone invited you to Sojourn. If you didn't expect this, you can safely ignore it.
      </p>
    </div>
  </div>
</body>
</html>`
}

export async function sendInvitationEmail({
  assistantEmail,
  assistantName,
  mainName,
  resetLink,
  expiresAt,
}: {
  assistantEmail: string
  assistantName: string
  mainName: string
  resetLink: string
  expiresAt: Date
}) {
  const expiryStr = expiresAt.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const body = `
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Hi ${assistantName},</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      <strong>${mainName}</strong> has invited you to assist them on Sojourn — the travel planning app for tracking days abroad.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 28px;line-height:1.6;">
      Click the button below to set your password and get started.
    </p>
    <a href="${resetLink}" style="display:inline-block;background:#1d4ed8;color:white;font-size:15px;font-weight:600;padding:14px 28px;border-radius:999px;text-decoration:none;margin-bottom:28px;">
      Set my password
    </a>
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:14px 16px;margin-bottom:8px;">
      <p style="font-size:13px;color:#713f12;margin:0;">
        <strong>This invitation expires on ${expiryStr}.</strong><br>
        If the link above has expired, ask ${mainName} to resend the invitation from their Settings page.
      </p>
    </div>
  `

  await getResend().emails.send({
    from: FROM,
    to: assistantEmail,
    subject: `${mainName} has invited you to Sojourn`,
    html: baseTemplate(body),
  })
}

export async function sendCustomerInvitationEmail({
  toEmail,
  toName,
  invitedBy,
  signupLink,
  expiresAt,
}: {
  toEmail: string
  toName: string
  invitedBy: string
  signupLink: string
  expiresAt: Date
}) {
  const expiryStr = expiresAt.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const safeName = escapeHtml(toName)
  const safeInvitedBy = escapeHtml(invitedBy)

  const body = `
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Hi ${safeName},</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      <strong>${safeInvitedBy}</strong> has invited you to join Sojourn — the travel planning app
      for tracking days abroad.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 28px;line-height:1.6;">
      Click the button below to create your account. Your email address has already been
      verified — just choose a password and you're in.
    </p>
    <a href="${signupLink}"
       style="display:inline-block;background:#1d4ed8;color:white;font-size:15px;font-weight:600;padding:14px 28px;border-radius:999px;text-decoration:none;margin-bottom:28px;">
      Create my account
    </a>
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:14px 16px;margin-bottom:8px;">
      <p style="font-size:13px;color:#713f12;margin:0;">
        <strong>This invitation expires on ${expiryStr}.</strong><br>
        If the link above has expired, ask ${safeInvitedBy} to resend it.
      </p>
    </div>
  `

  await getResend().emails.send({
    from: FROM,
    to: toEmail,
    subject: `${invitedBy} has invited you to Sojourn`,
    html: baseTemplate(body),
  })
}

export async function sendDeactivationEmail({
  assistantEmail,
  assistantName,
}: {
  assistantEmail: string
  assistantName: string
}) {
  const safeName = escapeHtml(assistantName)

  const body = `
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Hi ${safeName},</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      Your Sojourn assistant account is no longer active.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      This happens when all of the main accounts that linked to you have removed the connection.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 8px;line-height:1.6;">
      If you receive a new invitation in the future, you can sign up again using this same email address.
    </p>
  `

  await getResend().emails.send({
    from: FROM,
    to: assistantEmail,
    subject: 'Your Sojourn assistant account has been deactivated',
    html: baseTemplate(body),
  })
}

export async function sendAssistantAddedEmail({
  assistantEmail,
  assistantName,
  mainName,
}: {
  assistantEmail: string
  assistantName: string
  mainName: string
}) {
  const body = `
    <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Hi ${assistantName},</h1>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">
      <strong>${mainName}</strong> has added you as their assistant on Sojourn.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 28px;line-height:1.6;">
      Log in with your existing password. You'll see <strong>${mainName.split(' ')[0]}</strong>'s account in the <em>Viewing</em> dropdown in the top navigation bar.
    </p>
    <a href="${APP_URL}/login" style="display:inline-block;background:#1d4ed8;color:white;font-size:15px;font-weight:600;padding:14px 28px;border-radius:999px;text-decoration:none;margin-bottom:8px;">
      Open Sojourn
    </a>
  `

  await getResend().emails.send({
    from: FROM,
    to: assistantEmail,
    subject: `${mainName} has added you as their assistant on Sojourn`,
    html: baseTemplate(body),
  })
}
