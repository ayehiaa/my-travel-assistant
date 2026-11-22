import { z } from 'zod'
import { HhMmSchema, WeekdaySchema } from './programmeSchema'
import { UnitsSchema, DEFAULT_UNITS, type Units } from './units'

/**
 * Health settings (specs/029 P2): units and reminders, stored per user in health_settings (one row, jsonb columns).
 * Defaults when the row / table / a key is missing: kg / cm / mmol/L; reminders OFF (opt-in), every type on once
 * enabled, email + push channels on, quiet hours 22:00–07:00, weekly review Sunday 18:00, no training time.
 */

export const HEALTH_REMINDER_TYPES = [
  'morning_checkin',
  'pre_training_coffee',
  'caffeine_cutoff',
  'evening_gap',
  'bedtime',
  'weekly_review',
  'milestone_due',
  'adjustment_proposal',
] as const
export type HealthReminderType = (typeof HEALTH_REMINDER_TYPES)[number]

export const HEALTH_REMINDER_LABELS: Record<HealthReminderType, { label: string; help: string }> = {
  morning_checkin:     { label: 'Morning check-in',        help: '30 min after your usual wake time, if not done yet' },
  pre_training_coffee: { label: 'Pre-training coffee',     help: '45 min before a training session (needs a training time)' },
  caffeine_cutoff:     { label: 'Caffeine cut-off',        help: '30 min before the programme cut-off' },
  evening_gap:         { label: 'Evening gap nudge',       help: 'Before dinner: what is still missing today' },
  bedtime:             { label: 'Last meal / bedtime',     help: 'When the kitchen should close before bed' },
  weekly_review:       { label: 'Weekly review ready',     help: 'Your week in numbers and three focus points' },
  milestone_due:       { label: 'Milestone due',           help: 'First day of a milestone week' },
  adjustment_proposal: { label: 'Calorie adjustment',      help: 'When the fortnightly rule proposes a change' },
}

const typesShape = Object.fromEntries(HEALTH_REMINDER_TYPES.map(t => [t, z.boolean().optional()])) as Record<HealthReminderType, z.ZodOptional<z.ZodBoolean>>

export interface ReminderSettings {
  enabled: boolean
  channels: { email: boolean; push: boolean }
  types: Record<HealthReminderType, boolean>
  quietStart: string
  quietEnd: string
  trainingTime: string | null
  weeklyReviewDay: z.infer<typeof WeekdaySchema>
  weeklyReviewTime: string
}

export interface HealthSettings {
  units: Units
  reminders: ReminderSettings
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: false,
  channels: { email: true, push: true },
  types: Object.fromEntries(HEALTH_REMINDER_TYPES.map(t => [t, true])) as Record<HealthReminderType, boolean>,
  quietStart: '22:00',
  quietEnd: '07:00',
  trainingTime: null,
  weeklyReviewDay: 'sun',
  weeklyReviewTime: '18:00',
}

export const DEFAULT_HEALTH_SETTINGS: HealthSettings = { units: DEFAULT_UNITS, reminders: DEFAULT_REMINDERS }

const hhmm = (v: unknown, fallback: string) => (typeof v === 'string' && HhMmSchema.safeParse(v).success ? v : fallback)

export function parseReminderSettings(raw: unknown): ReminderSettings {
  const d = DEFAULT_REMINDERS
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...d, channels: { ...d.channels }, types: { ...d.types } }
  const r = raw as Record<string, unknown>
  const types = { ...d.types }
  if (r.types && typeof r.types === 'object') {
    for (const t of HEALTH_REMINDER_TYPES) {
      const v = (r.types as Record<string, unknown>)[t]
      if (typeof v === 'boolean') types[t] = v
    }
  }
  const ch = (r.channels && typeof r.channels === 'object' ? r.channels : {}) as Record<string, unknown>
  const day = WeekdaySchema.safeParse(r.weeklyReviewDay)
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    channels: { email: typeof ch.email === 'boolean' ? ch.email : true, push: typeof ch.push === 'boolean' ? ch.push : true },
    types,
    quietStart: hhmm(r.quietStart, d.quietStart),
    quietEnd: hhmm(r.quietEnd, d.quietEnd),
    trainingTime: r.trainingTime === null ? null : typeof r.trainingTime === 'string' && HhMmSchema.safeParse(r.trainingTime).success ? r.trainingTime : null,
    weeklyReviewDay: day.success ? day.data : d.weeklyReviewDay,
    weeklyReviewTime: hhmm(r.weeklyReviewTime, d.weeklyReviewTime),
  }
}

/** Defensive read of a health_settings row (missing row / columns → defaults). */
export function readHealthSettings(row: Record<string, unknown> | null | undefined): HealthSettings {
  const units = UnitsSchema.safeParse(row?.units ?? {})
  return { units: units.success ? units.data : DEFAULT_UNITS, reminders: parseReminderSettings(row?.reminders) }
}

export const HealthSettingsUpdateSchema = z.object({
  units: UnitsSchema.partial().strict().optional(),
  reminders: z.object({
    enabled: z.boolean().optional(),
    channels: z.object({ email: z.boolean().optional(), push: z.boolean().optional() }).strict().optional(),
    types: z.object(typesShape).strict().optional(),
    quietStart: HhMmSchema.optional(),
    quietEnd: HhMmSchema.optional(),
    trainingTime: HhMmSchema.nullable().optional(),
    weeklyReviewDay: WeekdaySchema.optional(),
    weeklyReviewTime: HhMmSchema.optional(),
  }).strict().optional(),
}).strict().refine(v => v.units !== undefined || v.reminders !== undefined, { message: 'Nothing to update' })
export type HealthSettingsUpdate = z.infer<typeof HealthSettingsUpdateSchema>

export function mergeHealthSettings(current: HealthSettings, u: HealthSettingsUpdate): HealthSettings {
  const r = u.reminders
  return {
    units: { ...current.units, ...(u.units ?? {}) },
    reminders: r ? {
      ...current.reminders,
      ...Object.fromEntries(Object.entries(r).filter(([k, v]) => v !== undefined && k !== 'channels' && k !== 'types')),
      channels: { ...current.reminders.channels, ...(r.channels ?? {}) },
      types: { ...current.reminders.types, ...Object.fromEntries(Object.entries(r.types ?? {}).filter(([, v]) => typeof v === 'boolean')) },
    } as ReminderSettings : current.reminders,
  }
}
