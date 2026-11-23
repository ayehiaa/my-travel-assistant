import { isValidDate, weekStart } from './time'

/**
 * Pure URL helpers for the Lifestyle (Health) hub: /health?tab=today|food|train|progress|plan (specs/029 §5,
 * renamed in specs/032). Old tab values (log, training, programme) redirect to their new names.
 */

export const HEALTH_TABS = ['today', 'food', 'train', 'progress', 'plan'] as const
export type HealthTab = (typeof HEALTH_TABS)[number]

export const HEALTH_TAB_LABELS: Record<HealthTab, string> = {
  today:    'Today',
  food:     'Food',
  train:    'Train',
  progress: 'Progress',
  plan:     'Plan',
}

/** Old `?tab=` values (before specs/032) → the new tab they redirect to. */
export const LEGACY_HEALTH_TABS: Record<string, HealthTab> = {
  log:       'food',
  training:  'train',
  programme: 'plan',
}

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw
}

/** The tab to show: a new tab name, an old name mapped to its new tab, else 'today'. */
export function parseHealthTab(raw: string | string[] | undefined): HealthTab {
  const v = first(raw)?.trim().toLowerCase() ?? ''
  if ((HEALTH_TABS as readonly string[]).includes(v)) return v as HealthTab
  return LEGACY_HEALTH_TABS[v] ?? 'today'
}

/**
 * When `?tab=` holds an old name, the URL to redirect to (same query, tab renamed); otherwise null.
 * `params` is the page's searchParams.
 */
export function legacyTabRedirect(params: Record<string, string | string[] | undefined>): string | null {
  const v = first(params.tab)?.trim().toLowerCase() ?? ''
  const mapped = LEGACY_HEALTH_TABS[v]
  if (!mapped) return null
  const rest: Record<string, string> = {}
  for (const [k, raw] of Object.entries(params)) {
    const val = first(raw)
    if (k !== 'tab' && val !== undefined) rest[k] = val
  }
  return healthHref({ ...rest, tab: mapped })
}

/** `?date=` for the Log tab: a valid date not after `today`, else `today`. */
export function parseLogDate(raw: string | string[] | undefined, today: string): string {
  const v = first(raw)?.trim() ?? ''
  return isValidDate(v) && v <= today ? v : today
}

/** Plan tab sub-views (P3 + specs/032 settings): /health?tab=plan&view=… */
export const PROGRAMME_VIEWS = ['overview', 'edit', 'import', 'meals', 'export', 'settings'] as const
export type ProgrammeView = (typeof PROGRAMME_VIEWS)[number]

export const PROGRAMME_VIEW_LABELS: Record<ProgrammeView, string> = {
  overview: 'Overview',
  edit:     'Edit & versions',
  import:   'Import',
  meals:    'Meal plan',
  export:   'Export & data',
  settings: 'Settings',
}

export function parseProgrammeView(raw: string | string[] | undefined): ProgrammeView {
  const v = first(raw)?.trim().toLowerCase()
  return (PROGRAMME_VIEWS as readonly string[]).includes(v ?? '') ? (v as ProgrammeView) : 'overview'
}

/** `?week=` for the meal plan: the Monday of the given (valid) date, else of `today`. */
export function parsePlanWeek(raw: string | string[] | undefined, today: string): string {
  const v = first(raw)?.trim() ?? ''
  return weekStart(isValidDate(v) ? v : today)
}

export type HealthHrefParams = { tab?: HealthTab | null; date?: string | null } & Record<string, string | number | null | undefined>

/** The single URL builder for /health links (drops empty params; 'today' is the default tab). */
export function healthHref(params: HealthHrefParams = {}): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue
    if (k === 'tab' && v === 'today') continue
    q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `/health?${s}` : '/health'
}

/** Consent text version — bump when the consent wording changes (stored with each consent record). */
export const HEALTH_CONSENT_VERSION = '2026-11-22'

export const HEALTH_MIGRATION_MESSAGE = 'Health needs a database update — apply supabase/apply_health_p1a.sql'

/** Health audit actions (hidden from assistants on the audit log). */
export const HEALTH_AUDIT_ACTIONS = [
  'health_consent_given', 'health_programme_activated', 'health_adjustment_accepted', 'health_adjustment_declined',
  'health_programme_imported', 'health_programme_updated', 'health_data_exported', 'health_data_deleted',
] as const

/** PostgREST `in` list for `.not('action', 'in', …)`. */
export const HEALTH_AUDIT_FILTER = `(${HEALTH_AUDIT_ACTIONS.join(',')})`
