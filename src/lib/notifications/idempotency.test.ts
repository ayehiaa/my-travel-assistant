import { describe, expect, it } from 'vitest'
import { notificationIdempotencyKey } from './idempotency'
import { readBaseUrl, readEmailConfig } from './config'

describe('notificationIdempotencyKey', () => {
  const id = '6f1c2a3b-1111-4222-8333-944455556666'

  it('is deterministic per (type, entity)', () => {
    expect(notificationIdempotencyKey('run_completed', id)).toBe(`notif-run_completed-${id}`)
    expect(notificationIdempotencyKey('run_completed', id)).toBe(notificationIdempotencyKey('run_completed', id))
  })

  it('differs by type and by entity', () => {
    expect(notificationIdempotencyKey('run_completed', id)).not.toBe(notificationIdempotencyKey('approval_needed', id))
    expect(notificationIdempotencyKey('run_completed', id)).not.toBe(notificationIdempotencyKey('run_completed', `${id}x`))
  })

  it('keeps only safe characters and caps the length at 256', () => {
    expect(notificationIdempotencyKey('trading_paused', 'u-2026-11-20T10:00:00.000Z')).toBe('notif-trading_paused-u-2026-11-20T10:00:00.000Z')
    expect(notificationIdempotencyKey('test', 'a b/c')).toBe('notif-test-a_b_c')
    expect(notificationIdempotencyKey('weekly_summary', 'x'.repeat(400))).toHaveLength(256)
  })
})

describe('readEmailConfig', () => {
  it('is a no-op config without an API key or sender', () => {
    expect(readEmailConfig({})).toEqual({ ok: false, reason: 'missing_api_key' })
    expect(readEmailConfig({ RESEND_API_KEY: 're_x' })).toEqual({ ok: false, reason: 'missing_from' })
    expect(readEmailConfig({ RESEND_API_KEY: '  ', NOTIFICATIONS_FROM_EMAIL: 'a@b.c' })).toEqual({ ok: false, reason: 'missing_api_key' })
  })

  it('reads key, sender (fallback RESEND_FROM_EMAIL) and base URL', () => {
    expect(readEmailConfig({ RESEND_API_KEY: 're_x', NOTIFICATIONS_FROM_EMAIL: 'Sojourn <a@b.c>', APP_BASE_URL: 'https://app.example/' }))
      .toEqual({ ok: true, apiKey: 're_x', from: 'Sojourn <a@b.c>', baseUrl: 'https://app.example' })
    const fallback = readEmailConfig({ RESEND_API_KEY: 're_x', RESEND_FROM_EMAIL: 'x@y.z' })
    expect(fallback.ok && fallback.from).toBe('x@y.z')
  })

  it('base URL falls back to NEXT_PUBLIC_APP_URL then localhost', () => {
    expect(readBaseUrl({ NEXT_PUBLIC_APP_URL: 'https://pub.example' })).toBe('https://pub.example')
    expect(readBaseUrl({})).toBe('http://localhost:3000')
  })
})
