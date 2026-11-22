import { z } from 'zod'

/**
 * Data rights (specs/029 §2 / §8, phase P3): "Export my health data" and "Delete all my health data". Pure helpers —
 * the server routes do the I/O. Every per-user health table is listed here (children before parents, so deletes never
 * trip a foreign key); tables from a phase whose migration is not applied yet are skipped.
 */

/** Per-user Health tables, in a safe DELETE order (children first). health_nutrition_cache is shared public data. */
export const HEALTH_USER_TABLES = [
  'health_food_items',
  'health_food_entries',
  'health_workout_sets',
  'health_joint_checks',
  'health_workouts',
  'health_checkins',
  'health_cardio_sessions',
  'health_steps',
  'health_adjustments',
  'health_milestone_checks',
  'health_measurements',
  'health_progress_photos',
  'health_lab_results',
  'health_weekly_reviews',
  'health_settings',
  'health_day_timezones',
  'health_push_subscriptions',
  'health_rule_events',
  'health_food_library',
  'health_professional_approvals',
  'health_meal_plans',
  'health_ingredient_cache',
  'health_programme_imports',
  'health_enrolments',
  'health_daily_logs',
  'health_programmes',
  'health_consents',
] as const
export type HealthUserTable = (typeof HEALTH_USER_TABLES)[number]

/** Columns never exported (secrets / opaque delivery data). */
export const EXPORT_REDACT: Partial<Record<HealthUserTable, string[]>> = {
  health_push_subscriptions: ['p256dh', 'auth', 'keys'],
}

export const DELETE_CONFIRMATION = 'DELETE HEALTH DATA'

export const DeleteRequestSchema = z.object({ confirm: z.string().max(100) }).strict()

/** The typed confirmation must match exactly (surrounding spaces ignored). */
export function isDeleteConfirmed(text: string | null | undefined): boolean {
  return (text ?? '').trim() === DELETE_CONFIRMATION
}

/** Storage folders that hold this user's objects in the health-photos bucket (food, progress, pending imports). */
export function storagePrefixes(userId: string): string[] {
  return [userId, `progress/${userId}`, `imports/${userId}`]
}

/** Photo paths referenced by exported rows (food entries + progress photos), own paths only. */
export function photoPathsFromRows(tables: Partial<Record<string, Array<Record<string, unknown>>>>, userId: string): Array<{ path: string; kind: 'food' | 'progress' }> {
  const out: Array<{ path: string; kind: 'food' | 'progress' }> = []
  const seen = new Set<string>()
  const add = (path: unknown, kind: 'food' | 'progress') => {
    if (typeof path !== 'string' || seen.has(path)) return
    const own = kind === 'food' ? path.startsWith(`${userId}/`) : path.startsWith(`progress/${userId}/`)
    if (!own) return
    seen.add(path)
    out.push({ path, kind })
  }
  for (const row of tables.health_food_entries ?? []) {
    if (Array.isArray(row.photo_paths)) for (const p of row.photo_paths) add(p, 'food')
  }
  for (const row of tables.health_progress_photos ?? []) add(row.path, 'progress')
  return out
}

export function redactRows(table: HealthUserTable, rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const drop = EXPORT_REDACT[table]
  if (!drop) return rows
  return rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k))))
}

export const EXPORT_FORMAT = 'sojourn-health-export/1'
export const EXPORT_LINK_HOURS = 24

export interface HealthExport {
  format: typeof EXPORT_FORMAT
  exportedAt: string
  notice: string
  tables: Record<string, Array<Record<string, unknown>>>
  missingTables: string[]
  photos: Array<{ path: string; kind: 'food' | 'progress'; url: string | null }>
  photoLinksExpireAt: string
}

export function buildHealthExport(params: {
  exportedAt: Date
  tables: Partial<Record<HealthUserTable, Array<Record<string, unknown>>>>
  missingTables: string[]
  photos: Array<{ path: string; kind: 'food' | 'progress'; url: string | null }>
}): HealthExport {
  const tables: Record<string, Array<Record<string, unknown>>> = {}
  // Parents first in the file (reads naturally): reverse of the delete order.
  for (const t of [...HEALTH_USER_TABLES].reverse()) {
    const rows = params.tables[t]
    if (rows) tables[t] = redactRows(t, rows)
  }
  return {
    format: EXPORT_FORMAT,
    exportedAt: params.exportedAt.toISOString(),
    notice: `Your Health data from Sojourn. Photo links are private signed URLs valid for ${EXPORT_LINK_HOURS} hours — download the photos you want to keep before then.`,
    tables,
    missingTables: params.missingTables,
    photos: params.photos,
    photoLinksExpireAt: new Date(params.exportedAt.getTime() + EXPORT_LINK_HOURS * 3_600_000).toISOString(),
  }
}

export function exportFileName(date: string): string {
  return `health-data-${date}.json`
}
