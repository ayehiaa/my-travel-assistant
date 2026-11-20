import { inngest } from '@/inngest/client'
import { notificationIdempotencyKey } from './idempotency'
import {
  NOTIFICATION_SEND_EVENT,
  type NotificationEventData,
  type NotificationPayloads,
  type NotificationType,
} from './types'

/**
 * Build the `notifications/send` event. The event id is the idempotency key, so Inngest drops duplicates of the same
 * (type, entity) — use it with step.sendEvent inside Inngest functions.
 */
export function notificationEvent<K extends NotificationType>(
  userId: string,
  type: K,
  entityId: string,
  payload: NotificationPayloads[K],
): { id: string; name: typeof NOTIFICATION_SEND_EVENT; data: NotificationEventData } {
  const key = notificationIdempotencyKey(type, entityId)
  return {
    id:   key,
    name: NOTIFICATION_SEND_EVENT,
    data: { user_id: userId, type, entity_id: entityId, idempotency_key: key, payload },
  }
}

/** Fire-and-forget from API routes. Never throws — a notification must never fail the caller. */
export async function emitNotification<K extends NotificationType>(
  userId: string,
  type: K,
  entityId: string,
  payload: NotificationPayloads[K],
): Promise<boolean> {
  try {
    await inngest.send(notificationEvent(userId, type, entityId, payload))
    return true
  } catch {
    return false
  }
}
