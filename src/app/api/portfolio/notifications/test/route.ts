import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { hasFeature } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'
import { readEmailConfig } from '@/lib/notifications/config'
import { readNotificationPrefs, testEmailCooldownRemainingMs } from '@/lib/notifications/prefs'
import { sendNotification } from '@/lib/notifications/send'

// In-memory guard (per server instance) in addition to last_test_sent_at in notification_prefs, so the 1/minute
// limit holds even before migration 20261120e is applied.
const lastSentByUser = new Map<string, string>()

// ── POST ──────────────────────────────────────────────────────────────────────
// Send a test email to the signed-in user's own address. Rate limited to one per minute.

export async function POST() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasFeature(user.access, 'portfolio')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!readEmailConfig(process.env).ok) {
    return NextResponse.json({ error: 'Email notifications are not configured on this server' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: row } = await supabase
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  const prefs = readNotificationPrefs(row as Record<string, unknown> | null)

  const now = new Date()
  const remaining = Math.max(
    testEmailCooldownRemainingMs(prefs.last_test_sent_at, now),
    testEmailCooldownRemainingMs(lastSentByUser.get(user.id) ?? null, now),
  )
  if (remaining > 0) {
    const seconds = Math.ceil(remaining / 1000)
    return NextResponse.json(
      { error: `Please wait ${seconds}s before sending another test email`, retry_after_seconds: seconds },
      { status: 429, headers: { 'Retry-After': String(seconds) } },
    )
  }

  const sentAt = now.toISOString()
  lastSentByUser.set(user.id, sentAt)
  // Best-effort persistence of the rate-limit timestamp (column may not exist yet).
  if (row && 'notification_prefs' in (row as Record<string, unknown>)) {
    await supabase
      .from('portfolio_settings')
      .update({ notification_prefs: { ...prefs, last_test_sent_at: sentAt } })
      .eq('user_id', user.id)
  }

  let result
  try {
    result = await sendNotification(user.id, 'test', { sent_at: sentAt }, { entityId: `${user.id}-${sentAt}`, skipPrefs: true })
  } catch {
    return NextResponse.json({ error: 'The email provider is unavailable — try again shortly' }, { status: 502 })
  }
  if (!result.sent) {
    return NextResponse.json({ error: `Test email not sent (${result.reason})` }, { status: 502 })
  }

  await logAudit({ performedBy: user.id, action: 'notification_test_sent', tripId: null })
  return NextResponse.json({ sent: true, to: user.email })
}
