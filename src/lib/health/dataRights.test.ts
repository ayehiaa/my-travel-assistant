import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  DELETE_CONFIRMATION, HEALTH_USER_TABLES, buildHealthExport, isDeleteConfirmed, photoPathsFromRows, redactRows, storagePrefixes,
} from './dataRights'

const UID = '11111111-1111-1111-1111-111111111111'

describe('table list', () => {
  it('covers every per-user health table created by the migrations', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations')
    const sql = readdirSync(dir).filter(f => f.includes('health')).map(f => readFileSync(join(dir, f), 'utf8')).join('\n')
    const created = [...sql.matchAll(/create table if not exists public\.(health_[a-z_]+)/g)].map(m => m[1])
    const perUser = created.filter(t => t !== 'health_nutrition_cache')
    expect(new Set(perUser)).toEqual(new Set(HEALTH_USER_TABLES))
  })
  it('deletes children before parents', () => {
    const idx = (t: string) => HEALTH_USER_TABLES.indexOf(t as never)
    expect(idx('health_food_items')).toBeLessThan(idx('health_food_entries'))
    expect(idx('health_workout_sets')).toBeLessThan(idx('health_workouts'))
    expect(idx('health_enrolments')).toBeLessThan(idx('health_programmes'))
    expect(idx('health_workouts')).toBeLessThan(idx('health_daily_logs'))
    expect(idx('health_adjustments')).toBeLessThan(idx('health_enrolments'))
  })
})

describe('confirmation', () => {
  it('needs the exact phrase', () => {
    expect(isDeleteConfirmed(DELETE_CONFIRMATION)).toBe(true)
    expect(isDeleteConfirmed(`  ${DELETE_CONFIRMATION} `)).toBe(true)
    expect(isDeleteConfirmed('delete health data')).toBe(false)
    expect(isDeleteConfirmed(null)).toBe(false)
  })
})

describe('export assembly', () => {
  const tables = {
    health_food_entries: [{ id: 'e1', photo_paths: [`${UID}/2026-11-01/a.jpg`, 'someone-else/x.jpg'] }],
    health_progress_photos: [{ id: 'p1', path: `progress/${UID}/2026-11-01/b.jpg` }],
    health_push_subscriptions: [{ id: 's1', endpoint: 'https://push', p256dh: 'secret', auth: 'secret' }],
  }
  it('finds own photo paths only', () => {
    expect(photoPathsFromRows(tables, UID)).toEqual([
      { path: `${UID}/2026-11-01/a.jpg`, kind: 'food' },
      { path: `progress/${UID}/2026-11-01/b.jpg`, kind: 'progress' },
    ])
    expect(storagePrefixes(UID)).toEqual([UID, `progress/${UID}`, `imports/${UID}`])
  })
  it('redacts push keys and records link expiry', () => {
    expect(redactRows('health_push_subscriptions', tables.health_push_subscriptions)).toEqual([{ id: 's1', endpoint: 'https://push' }])
    const doc = buildHealthExport({ exportedAt: new Date('2026-11-22T10:00:00Z'), tables, missingTables: ['health_meal_plans'], photos: [] })
    expect(doc.photoLinksExpireAt).toBe('2026-11-23T10:00:00.000Z')
    expect(Object.keys(doc.tables)).toEqual(['health_push_subscriptions', 'health_progress_photos', 'health_food_entries'])
    expect(doc.tables.health_push_subscriptions[0]).not.toHaveProperty('p256dh')
    expect(doc.missingTables).toEqual(['health_meal_plans'])
  })
})
