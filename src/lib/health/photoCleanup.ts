/**
 * Photo retention (specs/029 §12.1, phase P2). Pure decisions for the daily cleanup job:
 * - food photos older than 30 days are deleted from storage and their paths cleared from entries (estimates and items
 *   are kept);
 * - photos never attached to a saved entry (uploaded for an estimate that was discarded) are deleted after 24 hours.
 * Progress photos (prefix `progress/`) are NOT food photos and are never touched by this job.
 */

export const FOOD_PHOTO_RETENTION_DAYS = 30
export const ORPHAN_GRACE_HOURS = 24

export interface StoredObject { path: string; createdAt: string | null }

export type PhotoDecision = 'keep' | 'expired' | 'orphan'

export function photoDecision(obj: StoredObject, referenced: ReadonlySet<string>, now: Date): PhotoDecision {
  if (obj.path.startsWith('progress/')) return 'keep'
  const created = obj.createdAt ? Date.parse(obj.createdAt) : NaN
  if (!Number.isFinite(created)) return 'keep'
  const ageMs = now.getTime() - created
  if (ageMs > FOOD_PHOTO_RETENTION_DAYS * 86_400_000) return 'expired'
  if (!referenced.has(obj.path) && ageMs > ORPHAN_GRACE_HOURS * 3_600_000) return 'orphan'
  return 'keep'
}

/** ISO cut-off for clearing photo paths from entries. */
export function retentionCutoff(now: Date): string {
  return new Date(now.getTime() - FOOD_PHOTO_RETENTION_DAYS * 86_400_000).toISOString()
}

/** Remove deleted paths from an entry's photo list. */
export function withoutPaths(paths: readonly string[], removed: ReadonlySet<string>): string[] {
  return paths.filter(p => !removed.has(p))
}
