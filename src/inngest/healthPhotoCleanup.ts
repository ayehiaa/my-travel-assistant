import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { HEALTH_PHOTO_BUCKET } from '@/lib/health/healthPhotos'
import { photoDecision, retentionCutoff, withoutPaths, type StoredObject } from '@/lib/health/photoCleanup'

/**
 * Daily food-photo retention (specs/029 §12.1, phase P2):
 *  1. photos older than 30 days → removed from storage and from their entries' photo_paths (items/estimates kept);
 *  2. photos never attached to a saved entry → removed after 24 hours.
 * Only `<userId>/<date>/<file>.jpg` food photos are touched; progress photos (`progress/…`) are kept.
 * Bounded per run (500 folders / 5,000 files); anything left is picked up the next day.
 */

const UUID_RE = /^[0-9a-f-]{36}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_FOLDERS = 500
const MAX_FILES = 5000

export const healthPhotoCleanup = inngest.createFunction(
  { id: 'health-photo-cleanup', triggers: [{ cron: '17 3 * * *' }], concurrency: { limit: 1 }, retries: 1 },
  async ({ step }) => {
    return step.run('cleanup', async () => {
      const admin = createAdminClient()
      const bucket = admin.storage.from(HEALTH_PHOTO_BUCKET)
      const now = new Date()

      const top = await bucket.list('', { limit: 1000 })
      if (top.error || !top.data) return { skipped: 'bucket_unavailable' }
      const userFolders = top.data.map(o => o.name).filter(n => UUID_RE.test(n)).slice(0, MAX_FOLDERS)

      let scanned = 0
      let removed = 0
      let cleared = 0
      for (const userId of userFolders) {
        if (scanned >= MAX_FILES) break
        const dates = await bucket.list(userId, { limit: 1000 })
        if (dates.error || !dates.data) continue
        const objects: StoredObject[] = []
        for (const d of dates.data.map(o => o.name).filter(n => DATE_RE.test(n))) {
          const files = await bucket.list(`${userId}/${d}`, { limit: 1000 })
          for (const f of files.data ?? []) {
            if (!f.name.endsWith('.jpg')) continue
            objects.push({ path: `${userId}/${d}/${f.name}`, createdAt: f.created_at ?? null })
          }
        }
        scanned += objects.length
        if (objects.length === 0) continue

        const { data: entries, error } = await admin.from('health_food_entries').select('id, photo_paths, created_at').eq('user_id', userId).neq('photo_paths', '{}')
        if (error) continue // never delete when references cannot be read
        const referenced = new Set((entries ?? []).flatMap(e => (Array.isArray(e.photo_paths) ? e.photo_paths as string[] : [])))
        const toRemove = objects.filter(o => photoDecision(o, referenced, now) !== 'keep').map(o => o.path)
        if (toRemove.length > 0) {
          const { error: rmErr } = await bucket.remove(toRemove)
          if (!rmErr) removed += toRemove.length
        }
        // Clear expired paths from entries (and any path removed above).
        const cutoff = retentionCutoff(now)
        const gone = new Set(toRemove)
        for (const e of entries ?? []) {
          const paths = Array.isArray(e.photo_paths) ? (e.photo_paths as string[]) : []
          const keep = String(e.created_at) < cutoff ? [] : withoutPaths(paths, gone)
          if (keep.length !== paths.length) {
            const { error: upErr } = await admin.from('health_food_entries').update({ photo_paths: keep }).eq('id', e.id)
            if (!upErr) cleared++
            if (String(e.created_at) < cutoff) {
              const leftovers = paths.filter(p => !gone.has(p))
              if (leftovers.length > 0) await bucket.remove(leftovers)
            }
          }
        }
      }
      return { users: userFolders.length, scanned, removed, entriesCleared: cleared }
    })
  },
)
