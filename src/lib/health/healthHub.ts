import { isValidDate } from './time'

/** Pure URL helpers for the Health hub: /health?tab=today|log|training|progress|programme (specs/029 §5). */

export const HEALTH_TABS = ['today', 'log', 'training', 'progress', 'programme'] as const
export type HealthTab = (typeof HEALTH_TABS)[number]

export const HEALTH_TAB_LABELS: Record<HealthTab, string> = {
  today:     'Today',
  log:       'Log',
  training:  'Training',
  progress:  'Progress',
  programme: 'Programme',
}

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw
}

export function parseHealthTab(raw: string | string[] | undefined): HealthTab {
  const v = first(raw)?.trim().toLowerCase()
  return (HEALTH_TABS as readonly string[]).includes(v ?? '') ? (v as HealthTab) : 'today'
}

/** `?date=` for the Log tab: a valid date not after `today`, else `today`. */
export function parseLogDate(raw: string | string[] | undefined, today: string): string {
  const v = first(raw)?.trim() ?? ''
  return isValidDate(v) && v <= today ? v : today
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
export const HEALTH_AUDIT_ACTIONS = ['health_consent_given', 'health_programme_activated', 'health_adjustment_accepted', 'health_adjustment_declined'] as const

/** PostgREST `in` list for `.not('action', 'in', …)`. */
export const HEALTH_AUDIT_FILTER = `(${HEALTH_AUDIT_ACTIONS.join(',')})`
