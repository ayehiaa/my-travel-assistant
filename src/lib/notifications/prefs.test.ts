import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTIFICATION_PREFS,
  NotificationPrefsUpdateSchema,
  TEST_EMAIL_COOLDOWN_MS,
  isNotificationEnabled,
  mergeNotificationPrefs,
  parseNotificationPrefs,
  readNotificationPrefs,
  testEmailCooldownRemainingMs,
} from './prefs'
import { NOTIFICATION_TYPES } from './types'

describe('readNotificationPrefs', () => {
  it('defaults to everything enabled (incl. weekly summary) when the row or column is missing', () => {
    for (const row of [null, undefined, {}, { notification_prefs: null }]) {
      const prefs = readNotificationPrefs(row as Record<string, unknown> | null)
      expect(prefs.enabled).toBe(true)
      for (const t of NOTIFICATION_TYPES) expect(prefs.types[t]).toBe(true)
      expect(prefs.types.weekly_summary).toBe(true)
      expect(prefs.last_test_sent_at).toBeNull()
    }
  })

  it('reads stored values and fills unknown / missing types with defaults', () => {
    const prefs = parseNotificationPrefs({
      enabled: false,
      types:   { run_completed: false, weekly_summary: false, bogus: false, approval_needed: 'no' },
      last_test_sent_at: '2026-11-20T10:00:00Z',
    })
    expect(prefs.enabled).toBe(false)
    expect(prefs.types.run_completed).toBe(false)
    expect(prefs.types.weekly_summary).toBe(false)
    expect(prefs.types.approval_needed).toBe(true)
    expect(prefs.types.trading_paused).toBe(true)
    expect('bogus' in prefs.types).toBe(false)
    expect(prefs.last_test_sent_at).toBe('2026-11-20T10:00:00Z')
  })

  it('treats junk as defaults', () => {
    expect(parseNotificationPrefs('nope')).toEqual(DEFAULT_NOTIFICATION_PREFS)
    expect(parseNotificationPrefs([1, 2])).toEqual(DEFAULT_NOTIFICATION_PREFS)
  })
})

describe('isNotificationEnabled', () => {
  it('requires the master switch and the type toggle', () => {
    const prefs = parseNotificationPrefs({ enabled: true, types: { run_completed: false } })
    expect(isNotificationEnabled(prefs, 'run_completed')).toBe(false)
    expect(isNotificationEnabled(prefs, 'approval_needed')).toBe(true)
    const off = parseNotificationPrefs({ enabled: false })
    expect(isNotificationEnabled(off, 'approval_needed')).toBe(false)
  })

  it('always allows the explicit test email', () => {
    expect(isNotificationEnabled(parseNotificationPrefs({ enabled: false }), 'test')).toBe(true)
  })
})

describe('mergeNotificationPrefs', () => {
  it('applies a partial update and keeps the rest', () => {
    const current = parseNotificationPrefs({ types: { trading_paused: false }, last_test_sent_at: '2026-11-20T10:00:00Z' })
    const next = mergeNotificationPrefs(current, { types: { weekly_summary: false } })
    expect(next.types.weekly_summary).toBe(false)
    expect(next.types.trading_paused).toBe(false)
    expect(next.enabled).toBe(true)
    expect(next.last_test_sent_at).toBe('2026-11-20T10:00:00Z')
    expect(mergeNotificationPrefs(current, { enabled: false }).enabled).toBe(false)
  })
})

describe('NotificationPrefsUpdateSchema', () => {
  it('accepts known keys only and requires something to update', () => {
    expect(NotificationPrefsUpdateSchema.safeParse({ enabled: false }).success).toBe(true)
    expect(NotificationPrefsUpdateSchema.safeParse({ types: { run_completed: false } }).success).toBe(true)
    expect(NotificationPrefsUpdateSchema.safeParse({}).success).toBe(false)
    expect(NotificationPrefsUpdateSchema.safeParse({ types: { bogus: true } }).success).toBe(false)
    expect(NotificationPrefsUpdateSchema.safeParse({ last_test_sent_at: 'x' }).success).toBe(false)
    expect(NotificationPrefsUpdateSchema.safeParse({ enabled: 'yes' }).success).toBe(false)
  })
})

describe('testEmailCooldownRemainingMs', () => {
  const now = new Date('2026-11-20T10:00:00Z')
  it('allows when never sent or invalid', () => {
    expect(testEmailCooldownRemainingMs(null, now)).toBe(0)
    expect(testEmailCooldownRemainingMs('garbage', now)).toBe(0)
  })
  it('blocks within a minute and allows after', () => {
    expect(testEmailCooldownRemainingMs('2026-11-20T09:59:30Z', now)).toBe(30_000)
    expect(testEmailCooldownRemainingMs('2026-11-20T09:59:00Z', now)).toBe(0)
    expect(testEmailCooldownRemainingMs('2026-11-20T09:58:00Z', now)).toBe(0)
  })
  it('blocks a future timestamp (clock skew) for a full minute', () => {
    expect(testEmailCooldownRemainingMs('2026-11-20T10:05:00Z', now)).toBe(TEST_EMAIL_COOLDOWN_MS)
  })
})
