import { z } from 'zod'

/**
 * Per-user screening settings (specs/030-configurable-islamic-screening). Pure — no I/O.
 *
 * Stored in `portfolio_settings.screening_settings` (jsonb). A missing column, null or malformed value means the
 * defaults: everything ON, i.e. the always-on behaviour of spec 019.
 */

export interface ScreeningSettings {
  /** Master switch for Islamic (Shariah) screening. */
  islamic_enabled:  boolean
  /** Business activity: SIC blocklist + the AI reviewer's verdict on the main business. */
  business_screen:  boolean
  /** Financial: the three AAOIFI 30% ratios AND non-permissible income < 5%. */
  financial_screen: boolean
  /** Independent of Islamic: individual common stocks only (no ETFs / funds / bonds / preferreds). */
  stocks_only:      boolean
}

export const DEFAULT_SCREENING_SETTINGS: ScreeningSettings = {
  islamic_enabled:  true,
  business_screen:  true,
  financial_screen: true,
  stocks_only:      true,
}

/** Strict request schema for the settings API. */
export const ScreeningSettingsSchema = z.object({
  islamic_enabled:  z.boolean(),
  business_screen:  z.boolean(),
  financial_screen: z.boolean(),
  stocks_only:      z.boolean(),
}).strict()

export interface ScreeningSettingsState extends ScreeningSettings {
  /** False when the `screening_settings` column does not exist yet (migration not applied). */
  migration_applied: boolean
}

/** Read screening settings from a portfolio_settings row (select('*')) defensively; each missing key → default. */
export function readScreeningSettings(row: Record<string, unknown> | null | undefined): ScreeningSettingsState {
  const r = row ?? {}
  const raw = r.screening_settings
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const pick = (key: keyof ScreeningSettings): boolean =>
    typeof obj[key] === 'boolean' ? obj[key] as boolean : DEFAULT_SCREENING_SETTINGS[key]
  return {
    islamic_enabled:   pick('islamic_enabled'),
    business_screen:   pick('business_screen'),
    financial_screen:  pick('financial_screen'),
    stocks_only:       pick('stocks_only'),
    migration_applied: 'screening_settings' in r,
  }
}

/** What actually applies to a run / a buy. */
export interface EffectiveScreeningConfig {
  /** Islamic screening on (at least one part enabled). */
  islamic:     boolean
  business:    boolean
  financial:   boolean
  stocks_only: boolean
}

export const FULL_SCREENING_CONFIG: EffectiveScreeningConfig = {
  islamic: true, business: true, financial: true, stocks_only: true,
}

export const EffectiveScreeningConfigSchema = z.object({
  islamic:     z.boolean(),
  business:    z.boolean(),
  financial:   z.boolean(),
  stocks_only: z.boolean(),
})

/** islamic_enabled && (business || financial) → on with the selected parts; otherwise Islamic screening is off. */
export function effectiveScreeningConfig(s: ScreeningSettings): EffectiveScreeningConfig {
  const islamic = s.islamic_enabled && (s.business_screen || s.financial_screen)
  return {
    islamic,
    business:    islamic && s.business_screen,
    financial:   islamic && s.financial_screen,
    stocks_only: s.stocks_only,
  }
}

export function isFullScreening(cfg: EffectiveScreeningConfig): boolean {
  return cfg.islamic && cfg.business && cfg.financial && cfg.stocks_only
}

export type ReviewerMode = 'full' | 'business' | 'financial'

/** Which AI review the run needs; null → no reviewer call at all (no AI cost). */
export function reviewerModeFor(cfg: EffectiveScreeningConfig): ReviewerMode | null {
  if (!cfg.islamic) return null
  if (cfg.business && cfg.financial) return 'full'
  if (cfg.business) return 'business'
  if (cfg.financial) return 'financial'
  return null
}

/** Short status label: "Shariah: on" / "Shariah: business only" / "Shariah: financial only" / "Shariah: off". */
export function screeningModeLabel(cfg: EffectiveScreeningConfig): string {
  if (!cfg.islamic) return 'Shariah: off'
  if (cfg.business && cfg.financial) return 'Shariah: on'
  return cfg.business ? 'Shariah: business only' : 'Shariah: financial only'
}

/** Longer description, e.g. "Screening: business activity only · individual stocks only". */
export function describeScreeningConfig(cfg: EffectiveScreeningConfig): string {
  const islamic = !cfg.islamic
    ? 'Islamic screening off'
    : cfg.business && cfg.financial
      ? 'business activity + financial ratios'
      : cfg.business ? 'business activity only' : 'financial ratios only'
  return `Screening: ${islamic} · ${cfg.stocks_only ? 'individual stocks only' : 'ETFs / funds allowed'}`
}

/**
 * What a change stops checking (for the confirmation dialog): one phrase per check that was effectively on before
 * and is off after. Empty → the change does not weaken screening.
 */
export function screeningWeakenings(before: ScreeningSettings, after: ScreeningSettings): string[] {
  const b = effectiveScreeningConfig(before)
  const a = effectiveScreeningConfig(after)
  const out: string[] = []
  if (b.business && !a.business) out.push('impermissible business activity (banking, alcohol, gambling, weapons …)')
  if (b.financial && !a.financial) out.push('the AAOIFI financial ratios and non-permissible income')
  if (b.stocks_only && !a.stocks_only) out.push('being an individual common stock (ETFs, funds and preferred shares become possible)')
  return out
}

export function screeningChangeNeedsConfirm(before: ScreeningSettings, after: ScreeningSettings): boolean {
  return screeningWeakenings(before, after).length > 0
}
