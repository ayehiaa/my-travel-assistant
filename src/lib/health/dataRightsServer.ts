import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingSchemaError } from '@/lib/invitationRoles'
import type { ServerClient } from './healthServer'
import { HEALTH_PHOTO_BUCKET } from './healthPhotos'
import { EXPORT_LINK_HOURS, HEALTH_USER_TABLES, buildHealthExport, photoPathsFromRows, storagePrefixes, type HealthExport, type HealthUserTable } from './dataRights'

/** Server only. I/O for "Export my health data" / "Delete all my health data" (spec §2 / §8, phase P3). */

const PAGE = 1000
const MAX_ROWS_PER_TABLE = 50_000

/** Every per-user health row via the user's own session (owner-only RLS), paged. Missing tables are listed, not fatal. */
export async function collectHealthData(supabase: ServerClient, userId: string): Promise<{ ok: true; doc: HealthExport } | { ok: false }> {
  const tables: Partial<Record<HealthUserTable, Array<Record<string, unknown>>>> = {}
  const missing: string[] = []
  for (const t of HEALTH_USER_TABLES) {
    const rows: Array<Record<string, unknown>> = []
    for (let from = 0; from < MAX_ROWS_PER_TABLE; from += PAGE) {
      const { data, error } = await supabase.from(t).select('*').eq('user_id', userId).order('id').range(from, from + PAGE - 1)
      if (error) {
        if (isMissingSchemaError(error)) { missing.push(t); break }
        return { ok: false }
      }
      rows.push(...((data ?? []) as Array<Record<string, unknown>>))
      if (!data || data.length < PAGE) break
    }
    if (!missing.includes(t)) tables[t] = rows
  }
  const paths = photoPathsFromRows(tables, userId)
  const urls = new Map<string, string>()
  for (let i = 0; i < paths.length; i += 100) {
    try {
      const { data } = await createAdminClient().storage.from(HEALTH_PHOTO_BUCKET)
        .createSignedUrls(paths.slice(i, i + 100).map(p => p.path), EXPORT_LINK_HOURS * 3600)
      for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl)
    } catch {
      // links missing for this batch — the paths are still listed
    }
  }
  return {
    ok: true,
    doc: buildHealthExport({ exportedAt: new Date(), tables, missingTables: missing, photos: paths.map(p => ({ ...p, url: urls.get(p.path) ?? null })) }),
  }
}

/** All storage objects under the user's health folders (two levels: <prefix>/<date>/<file>). */
async function listUserObjects(userId: string): Promise<string[]> {
  const storage = createAdminClient().storage.from(HEALTH_PHOTO_BUCKET)
  const out: string[] = []
  for (const prefix of storagePrefixes(userId)) {
    const { data: top } = await storage.list(prefix, { limit: 1000 })
    for (const entry of top ?? []) {
      if (entry.id) { out.push(`${prefix}/${entry.name}`); continue }
      const { data: files } = await storage.list(`${prefix}/${entry.name}`, { limit: 1000 })
      for (const f of files ?? []) if (f.id) out.push(`${prefix}/${entry.name}/${f.name}`)
    }
  }
  return out
}

/**
 * Hard delete: every per-user health row (children first) and every object in the user's photo folders.
 * Idempotent — a partial failure can simply be retried. Returns counts only (nothing about the content).
 */
export async function deleteHealthData(supabase: ServerClient, userId: string): Promise<{ ok: boolean; tables: number; rows: number; objects: number; failedTable?: string }> {
  // Photo paths referenced by rows, collected before the rows go (in case listing the folders misses any).
  const referenced: string[] = []
  try {
    const [food, progress] = await Promise.all([
      supabase.from('health_food_entries').select('photo_paths').eq('user_id', userId).neq('photo_paths', '{}'),
      supabase.from('health_progress_photos').select('path').eq('user_id', userId),
    ])
    for (const r of food.data ?? []) if (Array.isArray(r.photo_paths)) referenced.push(...(r.photo_paths as string[]))
    for (const r of progress.data ?? []) if (typeof r.path === 'string') referenced.push(r.path)
  } catch {
    // listing below covers it
  }

  let tables = 0
  let rows = 0
  for (const t of HEALTH_USER_TABLES) {
    const { data, error } = await supabase.from(t).delete().eq('user_id', userId).select('id')
    if (error) {
      if (isMissingSchemaError(error)) continue
      return { ok: false, tables, rows, objects: 0, failedTable: t }
    }
    tables++
    rows += data?.length ?? 0
  }

  let objects = 0
  try {
    const own = referenced.filter(p => p.startsWith(`${userId}/`) || p.startsWith(`progress/${userId}/`))
    const all = [...new Set([...own, ...(await listUserObjects(userId))])]
    const storage = createAdminClient().storage.from(HEALTH_PHOTO_BUCKET)
    for (let i = 0; i < all.length; i += 100) {
      const { data } = await storage.remove(all.slice(i, i + 100))
      objects += data?.length ?? 0
    }
  } catch {
    // storage best effort: rows are gone; the daily cleanup job removes unreferenced food photos after 24 h
  }

  // Health reminder delivery log (no content, but personal): best effort.
  try {
    await createAdminClient().from('notification_log').delete().eq('user_id', userId).like('type', 'health_%')
  } catch {
    // ignore
  }
  return { ok: true, tables, rows, objects }
}
