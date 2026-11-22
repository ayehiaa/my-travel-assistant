import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SCREENING_SETTINGS,
  ScreeningSettingsSchema,
  describeScreeningConfig,
  effectiveScreeningConfig,
  isFullScreening,
  readScreeningSettings,
  reviewerModeFor,
  screeningChangeNeedsConfirm,
  screeningModeLabel,
  screeningWeakenings,
  type ScreeningSettings,
} from './screeningConfig'

const s = (o: Partial<ScreeningSettings>): ScreeningSettings => ({ ...DEFAULT_SCREENING_SETTINGS, ...o })

describe('readScreeningSettings', () => {
  it('defaults everything ON when the row, column or value is missing / invalid', () => {
    expect(readScreeningSettings(null)).toEqual({ ...DEFAULT_SCREENING_SETTINGS, migration_applied: false })
    expect(readScreeningSettings({ user_id: 'u' })).toEqual({ ...DEFAULT_SCREENING_SETTINGS, migration_applied: false })
    expect(readScreeningSettings({ screening_settings: null })).toEqual({ ...DEFAULT_SCREENING_SETTINGS, migration_applied: true })
    expect(readScreeningSettings({ screening_settings: 'off' }).islamic_enabled).toBe(true)
    expect(readScreeningSettings({ screening_settings: [false] }).islamic_enabled).toBe(true)
  })

  it('reads each key independently; non-booleans fall back to the default', () => {
    const r = readScreeningSettings({ screening_settings: { islamic_enabled: false, financial_screen: 'no', stocks_only: false } })
    expect(r).toMatchObject({ islamic_enabled: false, business_screen: true, financial_screen: true, stocks_only: false })
  })
})

describe('ScreeningSettingsSchema', () => {
  it('requires all four booleans and rejects extra keys', () => {
    expect(ScreeningSettingsSchema.safeParse(DEFAULT_SCREENING_SETTINGS).success).toBe(true)
    expect(ScreeningSettingsSchema.safeParse({ islamic_enabled: true }).success).toBe(false)
    expect(ScreeningSettingsSchema.safeParse({ ...DEFAULT_SCREENING_SETTINGS, extra: 1 }).success).toBe(false)
    expect(ScreeningSettingsSchema.safeParse({ ...DEFAULT_SCREENING_SETTINGS, stocks_only: 'yes' }).success).toBe(false)
  })
})

describe('effectiveScreeningConfig', () => {
  it('defaults → full screening', () => {
    const c = effectiveScreeningConfig(DEFAULT_SCREENING_SETTINGS)
    expect(c).toEqual({ islamic: true, business: true, financial: true, stocks_only: true })
    expect(isFullScreening(c)).toBe(true)
  })

  it('master off → Islamic off regardless of the parts; stocks-only independent', () => {
    expect(effectiveScreeningConfig(s({ islamic_enabled: false }))).toEqual({ islamic: false, business: false, financial: false, stocks_only: true })
    expect(effectiveScreeningConfig(s({ islamic_enabled: false, stocks_only: false })).stocks_only).toBe(false)
  })

  it('master on with no part selected → Islamic off', () => {
    expect(effectiveScreeningConfig(s({ business_screen: false, financial_screen: false })).islamic).toBe(false)
  })

  it('one part selected → only that part', () => {
    expect(effectiveScreeningConfig(s({ financial_screen: false }))).toEqual({ islamic: true, business: true, financial: false, stocks_only: true })
    expect(effectiveScreeningConfig(s({ business_screen: false }))).toEqual({ islamic: true, business: false, financial: true, stocks_only: true })
  })
})

describe('reviewerModeFor + labels', () => {
  it('maps each combination', () => {
    const cases: Array<[Partial<ScreeningSettings>, ReturnType<typeof reviewerModeFor>, string]> = [
      [{}, 'full', 'Shariah: on'],
      [{ financial_screen: false }, 'business', 'Shariah: business only'],
      [{ business_screen: false }, 'financial', 'Shariah: financial only'],
      [{ islamic_enabled: false }, null, 'Shariah: off'],
      [{ business_screen: false, financial_screen: false }, null, 'Shariah: off'],
    ]
    for (const [o, mode, label] of cases) {
      const c = effectiveScreeningConfig(s(o))
      expect(reviewerModeFor(c)).toBe(mode)
      expect(screeningModeLabel(c)).toBe(label)
    }
  })

  it('describes the config', () => {
    expect(describeScreeningConfig(effectiveScreeningConfig(s({ financial_screen: false }))))
      .toBe('Screening: business activity only · individual stocks only')
    expect(describeScreeningConfig(effectiveScreeningConfig(s({ islamic_enabled: false, stocks_only: false }))))
      .toBe('Screening: Islamic screening off · ETFs / funds allowed')
  })
})

describe('screeningWeakenings', () => {
  it('lists every check that is turned off; enabling never needs confirmation', () => {
    expect(screeningWeakenings(DEFAULT_SCREENING_SETTINGS, s({ islamic_enabled: false }))).toHaveLength(2)
    expect(screeningWeakenings(DEFAULT_SCREENING_SETTINGS, s({ financial_screen: false }))[0]).toContain('financial ratios')
    expect(screeningWeakenings(DEFAULT_SCREENING_SETTINGS, s({ stocks_only: false }))[0]).toContain('common stock')
    expect(screeningChangeNeedsConfirm(s({ islamic_enabled: false }), DEFAULT_SCREENING_SETTINGS)).toBe(false)
    expect(screeningChangeNeedsConfirm(DEFAULT_SCREENING_SETTINGS, DEFAULT_SCREENING_SETTINGS)).toBe(false)
  })

  it('a change of sub-toggles while the master is off does not weaken anything', () => {
    expect(screeningChangeNeedsConfirm(s({ islamic_enabled: false }), s({ islamic_enabled: false, business_screen: false }))).toBe(false)
  })
})
