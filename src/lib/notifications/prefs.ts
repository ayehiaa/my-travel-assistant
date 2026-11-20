import { z } from 'zod'
import { NOTIFICATION_TYPES, type EmailKind, type NotificationType } from './types'

/**
 * Notification preferences stored in portfolio_settings.notification_prefs (jsonb, migration 20261120e).
 *
 * Defaults (missing column, null, invalid JSON, or a type not listed): master switch ON and EVERY type ON, including
 * weekly_summary. Nothing is actually sent until RESEND_API_KEY and a sender address are configured.
 */

export type NotificationTypePrefs = Record<NotificationType, boolean>

export interface NotificationPrefs {
  enabled: boolean
  types: NotificationTypePrefs
  /** When the last test email was sent (rate limit 1/minute). */
  last_test_sent_at: string | null
}

export const TEST_EMAIL_COOLDOWN_MS = 60 * 1000

export const NOTIFICATIONS_MIGRATION_WARNING =
  'Notification preferences could not be saved — the database migration 20261120e_trading_notifications has not been applied yet. All notifications stay enabled.'

function allTypes(value: boolean): NotificationTypePrefs {
  return Object.fromEntries(NOTIFICATION_TYPES.map(t => [t, value])) as NotificationTypePrefs
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled:           true,
  types:             allTypes(true),
  last_test_sent_at: null,
}

/** Defensive read of a portfolio_settings row (select('*')). */
export function readNotificationPrefs(row: Record<string, unknown> | null | undefined): NotificationPrefs {
  return parseNotificationPrefs(row?.notification_prefs)
}

export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  const types = allTypes(true)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { enabled: true, types, last_test_sent_at: null }
  }
  const r = raw as Record<string, unknown>
  if (r.types && typeof r.types === 'object' && !Array.isArray(r.types)) {
    const t = r.types as Record<string, unknown>
    for (const key of NOTIFICATION_TYPES) {
      if (typeof t[key] === 'boolean') types[key] = t[key] as boolean
    }
  }
  return {
    enabled:           typeof r.enabled === 'boolean' ? r.enabled : true,
    types,
    last_test_sent_at: typeof r.last_test_sent_at === 'string' ? r.last_test_sent_at : null,
  }
}

/** Should this kind of email go out? The test email ignores preferences (explicit request). */
export function isNotificationEnabled(prefs: NotificationPrefs, kind: EmailKind): boolean {
  if (kind === 'test') return true
  return prefs.enabled && prefs.types[kind] !== false
}

const typesShape = Object.fromEntries(NOTIFICATION_TYPES.map(t => [t, z.boolean().optional()])) as Record<
  NotificationType,
  z.ZodOptional<z.ZodBoolean>
>

export const NotificationPrefsUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    types:   z.object(typesShape).strict().optional(),
  })
  .strict()
  .refine(d => d.enabled !== undefined || d.types !== undefined, { message: 'Nothing to update' })

export type NotificationPrefsUpdate = z.infer<typeof NotificationPrefsUpdateSchema>

/** Apply a partial update to stored prefs (keeps last_test_sent_at). */
export function mergeNotificationPrefs(current: NotificationPrefs, update: NotificationPrefsUpdate): NotificationPrefs {
  const types = { ...current.types }
  if (update.types) {
    for (const key of NOTIFICATION_TYPES) {
      const v = update.types[key]
      if (typeof v === 'boolean') types[key] = v
    }
  }
  return {
    enabled:           update.enabled ?? current.enabled,
    types,
    last_test_sent_at: current.last_test_sent_at,
  }
}

/** Milliseconds until another test email may be sent (0 = allowed now). */
export function testEmailCooldownRemainingMs(lastSentAt: string | null | undefined, now: Date): number {
  if (!lastSentAt) return 0
  const last = Date.parse(lastSentAt)
  if (!Number.isFinite(last)) return 0
  const elapsed = now.getTime() - last
  if (elapsed < 0) return TEST_EMAIL_COOLDOWN_MS
  return Math.max(0, TEST_EMAIL_COOLDOWN_MS - elapsed)
}
