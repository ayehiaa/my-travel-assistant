import { describe, it, expect } from 'vitest'
import { DEFAULT_HEALTH_SETTINGS, HealthSettingsUpdateSchema, mergeHealthSettings, readHealthSettings } from './healthSettings'

describe('health settings', () => {
  it('defaults: kg/cm/mmol, reminders off, quiet 22–07', () => {
    const s = readHealthSettings(null)
    expect(s).toEqual(DEFAULT_HEALTH_SETTINGS)
    expect(s.reminders.enabled).toBe(false)
    expect(s.reminders.types.evening_gap).toBe(true)
  })
  it('reads stored values defensively', () => {
    const s = readHealthSettings({ units: { weight: 'lb' }, reminders: { enabled: true, quietStart: '25:00', types: { bedtime: false, bogus: true }, trainingTime: '18:30' } })
    expect(s.units.weight).toBe('lb')
    expect(s.reminders.enabled).toBe(true)
    expect(s.reminders.quietStart).toBe('22:00')
    expect(s.reminders.types.bedtime).toBe(false)
    expect(s.reminders.trainingTime).toBe('18:30')
  })
  it('validates and merges partial updates', () => {
    expect(HealthSettingsUpdateSchema.safeParse({}).success).toBe(false)
    expect(HealthSettingsUpdateSchema.safeParse({ reminders: { types: { nope: true } } }).success).toBe(false)
    const u = HealthSettingsUpdateSchema.parse({ units: { lipids: 'mgdl' }, reminders: { enabled: true, channels: { push: false }, types: { caffeine_cutoff: false }, trainingTime: null } })
    const m = mergeHealthSettings(readHealthSettings({ reminders: { trainingTime: '07:00' } }), u)
    expect(m.units).toEqual({ weight: 'kg', length: 'cm', lipids: 'mgdl' })
    expect(m.reminders).toMatchObject({ enabled: true, channels: { email: true, push: false }, trainingTime: null })
    expect(m.reminders.types.caffeine_cutoff).toBe(false)
    expect(m.reminders.types.bedtime).toBe(true)
  })
})
