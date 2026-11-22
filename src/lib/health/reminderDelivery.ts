import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEmailConfig } from '@/lib/notifications/config'
import { wasNotificationSent, writeNotificationLog } from '@/lib/notifications/log'
import { sanitizeNotificationError } from '@/lib/notifications/summary'
import { isGoneStatus, readVapidConfig } from './pushConfig'
import { pushPayload, reminderEntityId, renderReminderEmail, type ReminderContent } from './reminders'
import type { ReminderSettings } from './healthSettings'

/**
 * Server only. Deliver one Health reminder by email (Resend, same config as the portfolio notifications) and/or Web
 * Push (web-push + VAPID). Missing email config or VAPID keys → that channel is silently skipped. Idempotent per user /
 * type / local date via notification_log (`health_<type>`) and Resend's Idempotency-Key. Never throws.
 */

export interface DeliveryResult { email: boolean; push: number; skipped?: string }

async function loadRecipient(userId: string): Promise<string | null> {
  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(userId)
    if (error) return null
    return data.user?.email?.trim() || null
  } catch {
    return null
  }
}

async function sendEmail(userId: string, c: ReminderContent, entityId: string): Promise<boolean> {
  const config = readEmailConfig(process.env)
  if (!config.ok) return false
  const to = await loadRecipient(userId)
  if (!to) return false
  const email = renderReminderEmail(c, config.baseUrl)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `notif-health-${entityId.replace(/[^A-Za-z0-9._:-]/g, '_')}`.slice(0, 256),
      },
      body: JSON.stringify({ from: config.from, to: [to], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      await writeNotificationLog({ userId, type: `health_${c.type}`, entityId, status: 'failed', error: sanitizeNotificationError(`Resend ${res.status}: ${body}`, [config.apiKey]) })
      return false
    }
    return true
  } catch {
    return false
  }
}

async function sendPush(userId: string, c: ReminderContent, localDate: string): Promise<number> {
  const vapid = readVapidConfig(process.env)
  if (!vapid.ok) return 0
  const admin = createAdminClient()
  const { data: subs, error } = await admin.from('health_push_subscriptions').select('id, endpoint, p256dh, auth, failure_count').eq('user_id', userId)
  if (error || !subs || subs.length === 0) return 0
  const payload = JSON.stringify(pushPayload(c, localDate))
  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } },
        payload,
        { vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey }, TTL: 3600, timeout: 10000 },
      )
      sent++
      await admin.from('health_push_subscriptions').update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq('id', s.id)
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      const failures = Number(s.failure_count ?? 0) + 1
      if (isGoneStatus(status) || failures >= 10) await admin.from('health_push_subscriptions').delete().eq('id', s.id)
      else await admin.from('health_push_subscriptions').update({ failure_count: failures }).eq('id', s.id)
    }
  }
  return sent
}

export async function deliverHealthReminder(
  userId: string,
  content: ReminderContent,
  localDate: string,
  channels: ReminderSettings['channels'],
): Promise<DeliveryResult> {
  const entityId = reminderEntityId(userId, content.type, localDate)
  const kind = `health_${content.type}` as const
  try {
    if (await wasNotificationSent(userId, kind, entityId)) return { email: false, push: 0, skipped: 'already_sent' }
    const [email, push] = await Promise.all([
      channels.email ? sendEmail(userId, content, entityId) : Promise.resolve(false),
      channels.push ? sendPush(userId, content, localDate).catch(() => 0) : Promise.resolve(0),
    ])
    if (email || push > 0) await writeNotificationLog({ userId, type: kind, entityId, status: 'sent' })
    return { email, push }
  } catch {
    return { email: false, push: 0, skipped: 'error' }
  }
}
