import { describe, it, expect } from 'vitest'
import { PushSubscriptionInputSchema, isGoneStatus, readVapidConfig } from './pushConfig'

const PUB = 'B' + 'a'.repeat(86)
const PRIV = 'c'.repeat(43)

describe('readVapidConfig', () => {
  it('missing or invalid → disabled', () => {
    expect(readVapidConfig({})).toEqual({ ok: false, reason: 'missing' })
    expect(readVapidConfig({ VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV })).toEqual({ ok: false, reason: 'missing' })
    expect(readVapidConfig({ VAPID_PUBLIC_KEY: 'short', VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: 'mailto:a@b.c' }).ok).toBe(false)
    expect(readVapidConfig({ VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: 'nobody' }).ok).toBe(false)
  })
  it('valid config', () => {
    expect(readVapidConfig({ VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV, VAPID_SUBJECT: 'mailto:alerts@example.com' })).toMatchObject({ ok: true })
  })
})

describe('subscription input', () => {
  it('https endpoints and base64url keys only', () => {
    const ok = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }
    expect(PushSubscriptionInputSchema.safeParse(ok).success).toBe(true)
    expect(PushSubscriptionInputSchema.safeParse({ ...ok, endpoint: 'http://x.test/a' }).success).toBe(false)
    expect(PushSubscriptionInputSchema.safeParse({ ...ok, keys: { ...ok.keys, auth: 'bad key!' } }).success).toBe(false)
  })
  it('410/404 mean gone', () => {
    expect(isGoneStatus(410)).toBe(true)
    expect(isGoneStatus(404)).toBe(true)
    expect(isGoneStatus(500)).toBe(false)
  })
})
