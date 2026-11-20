import { createAdminClient } from '@/lib/supabase/admin'
import type { EmailKind } from './types'

/**
 * Server only. Best-effort access to notification_log (migration 20261120e). Every function swallows errors: a missing
 * table means "no log", never a failed notification.
 */

export type NotificationLogStatus = 'sent' | 'failed' | 'skipped'

export async function writeNotificationLog(entry: {
  userId: string
  type: EmailKind
  entityId: string
  status: NotificationLogStatus
  error?: string | null
}): Promise<void> {
  try {
    await createAdminClient().from('notification_log').insert({
      user_id:   entry.userId,
      type:      entry.type,
      entity_id: entry.entityId,
      status:    entry.status,
      error:     entry.error ?? null,
    })
  } catch {
    // Ignored — the log is best-effort.
  }
}

/** True when a 'sent' row already exists for (user, type, entity). False when unknown (table missing, error). */
export async function wasNotificationSent(userId: string, type: EmailKind, entityId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient()
      .from('notification_log')
      .select('id')
      .eq('user_id', userId)
      .eq('type', type)
      .eq('entity_id', entityId)
      .eq('status', 'sent')
      .limit(1)
    if (error || !Array.isArray(data)) return false
    return data.length > 0
  } catch {
    return false
  }
}
