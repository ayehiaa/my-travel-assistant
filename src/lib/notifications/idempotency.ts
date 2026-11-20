import type { EmailKind } from './types'

/**
 * Deterministic idempotency key per (event type, entity id). Used as the Inngest event id, the delivery function's
 * idempotency key and Resend's Idempotency-Key header, so the same notification is never delivered twice.
 * Safe characters only, max 256 (Resend's limit).
 */
export function notificationIdempotencyKey(type: EmailKind, entityId: string): string {
  const safe = entityId.trim().replace(/[^A-Za-z0-9._:-]/g, '_')
  return `notif-${type}-${safe}`.slice(0, 256)
}
