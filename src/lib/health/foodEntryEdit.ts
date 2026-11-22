import type { FoodEntryPatch } from './nutrition'
import { MAX_PHOTOS } from './foodEstimate'

/**
 * Editing a saved food entry (specs/029 P3.1): replace the description, eating-out flag, no-added-fat toggle and
 * photos, and re-calculate. Pure planning helpers for PATCH / POST /api/health/food/[id].
 */

export interface ExistingEntry {
  photoPaths: string[]
  aiUsage: Record<string, unknown> | null
}

/** Photos for a re-calculation: kept existing ones (must belong to the entry) + new uploads, max 4 in total. */
export function planRecalcPhotos(existing: string[], keep: string[], newCount: number): { ok: true; keep: string[] } | { ok: false; error: string } {
  const own = new Set(existing)
  const uniqueKeep = [...new Set(keep)]
  if (!uniqueKeep.every(p => own.has(p))) return { ok: false, error: 'Unknown photo for this entry' }
  if (uniqueKeep.length + newCount > MAX_PHOTOS) return { ok: false, error: `Up to ${MAX_PHOTOS} photos` }
  return { ok: true, keep: uniqueKeep }
}

/**
 * New photo list on save: every path must be the entry's own (existing) or the user's own new upload; the
 * existing photos that are no longer listed are returned for deletion AFTER the update succeeded.
 */
export function planPhotoChange(existing: string[], next: string[] | undefined, isOwn: (path: string) => boolean): { ok: true; photoPaths: string[] | undefined; removed: string[] } | { ok: false; error: string } {
  if (next === undefined) return { ok: true, photoPaths: undefined, removed: [] }
  const unique = [...new Set(next)]
  if (unique.length > MAX_PHOTOS) return { ok: false, error: `Up to ${MAX_PHOTOS} photos` }
  if (!unique.every(isOwn)) return { ok: false, error: 'Invalid photo reference' }
  const keep = new Set(unique)
  return { ok: true, photoPaths: unique, removed: existing.filter(p => !keep.has(p)) }
}

/**
 * Column updates for the entry row (items are replaced separately). Keeps id / created_at; always bumps updated_at.
 * The no-added-fat toggle is merged into the existing ai_usage jsonb (no migration).
 */
export function entryColumnUpdates(patch: FoodEntryPatch, existing: ExistingEntry, nowIso: string, photoPaths?: string[]): Record<string, unknown> {
  const update: Record<string, unknown> = { updated_at: nowIso }
  if (patch.slot !== undefined) update.slot = patch.slot
  if (patch.text !== undefined) update.input_text = patch.text && patch.text.trim() ? patch.text.trim() : null
  if (patch.restaurant !== undefined) update.restaurant = patch.restaurant
  if (patch.noAddedFat !== undefined) update.ai_usage = { ...(existing.aiUsage ?? {}), noAddedFat: patch.noAddedFat }
  if (photoPaths !== undefined) update.photo_paths = photoPaths
  return update
}
