import { z } from 'zod'

/**
 * Web Push configuration and subscription input (specs/029 US12, phase P2). Pure.
 * VAPID keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT. Any of them missing or malformed →
 * push is silently disabled (email reminders still work).
 */

export type VapidConfig =
  | { ok: true; publicKey: string; privateKey: string; subject: string }
  | { ok: false; reason: 'missing' | 'invalid' }

const B64URL = /^[A-Za-z0-9_-]+$/

export function readVapidConfig(env: Record<string, string | undefined>): VapidConfig {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = env.VAPID_PRIVATE_KEY?.trim()
  const subject = env.VAPID_SUBJECT?.trim()
  if (!publicKey || !privateKey || !subject) return { ok: false, reason: 'missing' }
  // P-256 public key: 65 bytes → 87 base64url chars; private key: 32 bytes → 43 chars.
  if (!B64URL.test(publicKey) || !B64URL.test(privateKey) || publicKey.length < 80 || privateKey.length < 40) return { ok: false, reason: 'invalid' }
  if (!/^(mailto:.+@.+|https:\/\/.+)$/.test(subject)) return { ok: false, reason: 'invalid' }
  return { ok: true, publicKey, privateKey, subject }
}

/** Only https push service endpoints (every browser push service uses https). */
export const PushSubscriptionInputSchema = z.object({
  endpoint: z.string().url().max(1000).refine(u => u.startsWith('https://'), { message: 'Push endpoint must be https' }),
  keys: z.object({
    p256dh: z.string().regex(B64URL).min(40).max(200),
    auth:   z.string().regex(B64URL).min(8).max(100),
  }).strict(),
  expirationTime: z.number().nullable().optional(),
})

export const PushUnsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) }).strict()

/** Push service answers meaning the subscription is gone (delete it). */
export function isGoneStatus(status: number | undefined): boolean {
  return status === 404 || status === 410
}
