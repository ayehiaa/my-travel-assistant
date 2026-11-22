import { describe, it, expect } from 'vitest'
import { HEALTH_AUDIT_FILTER, healthHref, parseHealthTab, parseLogDate } from './healthHub'

describe('health hub URLs', () => {
  it('parses tabs and dates', () => {
    expect(parseHealthTab('LOG')).toBe('log')
    expect(parseHealthTab(['progress'])).toBe('progress')
    expect(parseHealthTab('nope')).toBe('today')
    expect(parseLogDate('2026-11-20', '2026-11-22')).toBe('2026-11-20')
    expect(parseLogDate('2026-11-23', '2026-11-22')).toBe('2026-11-22')
    expect(parseLogDate('junk', '2026-11-22')).toBe('2026-11-22')
  })

  it('builds hrefs', () => {
    expect(healthHref()).toBe('/health')
    expect(healthHref({ tab: 'today' })).toBe('/health')
    expect(healthHref({ tab: 'log', date: '2026-11-20' })).toBe('/health?tab=log&date=2026-11-20')
    expect(HEALTH_AUDIT_FILTER).toBe('(health_consent_given,health_programme_activated,health_adjustment_accepted,health_adjustment_declined)')
  })
})
