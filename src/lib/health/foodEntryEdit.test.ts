import { describe, it, expect } from 'vitest'
import { entryColumnUpdates, planPhotoChange, planRecalcPhotos } from './foodEntryEdit'

const U = '11111111-1111-4111-8111-111111111111'
const p = (n: number) => `${U}/2026-11-22/0000000${n}-0000-4000-8000-000000000000.jpg`
const own = (path: string) => path.startsWith(`${U}/`)

describe('food entry edit planning', () => {
  it('recalc photos: kept must be the entry\'s own, max 4 total', () => {
    expect(planRecalcPhotos([p(1), p(2)], [p(2), p(2)], 1)).toEqual({ ok: true, keep: [p(2)] })
    expect(planRecalcPhotos([p(1)], [p(3)], 0)).toMatchObject({ ok: false })
    expect(planRecalcPhotos([p(1), p(2)], [p(1), p(2)], 3)).toMatchObject({ ok: false })
  })

  it('photo change on save: removed existing photos are returned for deletion', () => {
    expect(planPhotoChange([p(1), p(2)], undefined, own)).toEqual({ ok: true, photoPaths: undefined, removed: [] })
    expect(planPhotoChange([p(1), p(2)], [p(2), p(3)], own)).toEqual({ ok: true, photoPaths: [p(2), p(3)], removed: [p(1)] })
    expect(planPhotoChange([p(1)], ['other/2026-11-22/x.jpg'], own)).toMatchObject({ ok: false })
  })

  it('column updates keep untouched fields and merge the toggle into ai_usage', () => {
    const now = '2026-11-22T10:00:00.000Z'
    expect(entryColumnUpdates({ remember: [] }, { photoPaths: [], aiUsage: null }, now)).toEqual({ updated_at: now })
    expect(entryColumnUpdates(
      { remember: [], text: '  avocado toast ', restaurant: true, noAddedFat: true, slot: null },
      { photoPaths: [], aiUsage: { cost_usd: 0.01 } }, now, [p(1)],
    )).toEqual({ updated_at: now, input_text: 'avocado toast', restaurant: true, ai_usage: { cost_usd: 0.01, noAddedFat: true }, slot: null, photo_paths: [p(1)] })
    expect(entryColumnUpdates({ remember: [], text: '' }, { photoPaths: [], aiUsage: null }, now)).toMatchObject({ input_text: null })
  })
})
