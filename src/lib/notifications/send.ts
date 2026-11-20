import { createAdminClient } from '@/lib/supabase/admin'
import { readEmailConfig } from './config'
import { notificationIdempotencyKey } from './idempotency'
import { wasNotificationSent, writeNotificationLog } from './log'
import { isNotificationEnabled, readNotificationPrefs } from './prefs'
import { sanitizeNotificationError } from './summary'
import { buildNotificationEmail } from './templates'
import type { EmailKind, NotificationPayloads } from './types'

/**
 * Server only. Deliver one notification email via the Resend REST API (specs/023-trading-notifications).
 *
 * config (missing key/sender → silent no-op) → preferences → durable dedupe (notification_log) → recipient (auth email)
 * → template → POST https://api.resend.com/emails with Idempotency-Key → best-effort log.
 *
 * Returns { sent: false, reason } for every non-retriable outcome. Throws RetriableNotificationError only for
 * 429 / 5xx / network errors so the Inngest step retries; callers outside Inngest must catch.
 */

export type SendResult = { sent: true; id: string | null } | { sent: false; reason: string }

export class RetriableNotificationError extends Error {}

const RESEND_URL = 'https://api.resend.com/emails'

async function loadPrefsRow(userId: string): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await createAdminClient()
      .from('portfolio_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    return (data as Record<string, unknown> | null) ?? null
  } catch {
    return null
  }
}

async function loadRecipient(userId: string): Promise<string | null> {
  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(userId)
    if (error) return null
    const email = data.user?.email?.trim()
    return email ? email : null
  } catch {
    return null
  }
}

export async function sendNotification<K extends EmailKind>(
  userId: string,
  kind: K,
  payload: NotificationPayloads[K],
  options: { entityId: string; skipPrefs?: boolean },
): Promise<SendResult> {
  const config = readEmailConfig(process.env)
  if (!config.ok) return { sent: false, reason: config.reason }

  if (!options.skipPrefs) {
    const prefs = readNotificationPrefs(await loadPrefsRow(userId))
    if (!isNotificationEnabled(prefs, kind)) return { sent: false, reason: 'disabled_by_user' }
  }

  if (kind !== 'test' && (await wasNotificationSent(userId, kind, options.entityId))) {
    return { sent: false, reason: 'already_sent' }
  }

  const to = await loadRecipient(userId)
  if (!to) {
    await writeNotificationLog({ userId, type: kind, entityId: options.entityId, status: 'skipped', error: 'No email address' })
    return { sent: false, reason: 'no_recipient' }
  }

  let email
  try {
    email = buildNotificationEmail(kind, payload, { baseUrl: config.baseUrl })
  } catch {
    await writeNotificationLog({ userId, type: kind, entityId: options.entityId, status: 'failed', error: 'Invalid payload' })
    return { sent: false, reason: 'invalid_payload' }
  }

  let response: Response
  try {
    response = await fetch(RESEND_URL, {
      method:  'POST',
      headers: {
        'Authorization':   `Bearer ${config.apiKey}`,
        'Content-Type':    'application/json',
        'Idempotency-Key': notificationIdempotencyKey(kind, options.entityId),
      },
      body:   JSON.stringify({ from: config.from, to: [to], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(15000),
      cache:  'no-store',
    })
  } catch {
    throw new RetriableNotificationError('Email provider unreachable')
  }

  if (response.status === 429 || response.status >= 500) {
    throw new RetriableNotificationError(`Email provider error ${response.status}`)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const error = sanitizeNotificationError(`Resend ${response.status}: ${body}`, [config.apiKey])
    await writeNotificationLog({ userId, type: kind, entityId: options.entityId, status: 'failed', error })
    return { sent: false, reason: `provider_rejected_${response.status}` }
  }

  const data = await response.json().catch(() => ({})) as { id?: unknown }
  await writeNotificationLog({ userId, type: kind, entityId: options.entityId, status: 'sent' })
  return { sent: true, id: typeof data.id === 'string' ? data.id : null }
}
