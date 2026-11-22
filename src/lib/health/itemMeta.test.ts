import { describe, it, expect } from 'vitest'
import { itemSourceLabel, joinItemMeta, splitItemMeta } from './itemMeta'

describe('item meta in components jsonb', () => {
  it('old rows (no _meta) read as before', () => {
    expect(splitItemMeta({ nuts: 30 })).toEqual({ components: { nuts: 30 }, meta: { assumptions: [], refId: null, source: null } })
    expect(splitItemMeta(null).components).toEqual({})
  })

  it('round-trips assumptions, reference id and source', () => {
    const a = { key: 'butter', label: 'butter', kind: 'added_fat' as const, addsKcal: 50, addsSatFatG: 3.6, addsProteinG: 0, addsCarbsG: 0, addsFatG: 5.7, kept: false }
    const stored = joinItemMeta({ components: { starch_servings: 1 }, assumptions: [a], refId: 'usda-sr28:18029', source: 'reference' })
    expect(stored).toEqual({ starch_servings: 1, _meta: { assumptions: [a], refId: 'usda-sr28:18029', source: 'reference' } })
    const back = splitItemMeta(stored)
    expect(back.components).toEqual({ starch_servings: 1 })
    expect(back.meta).toEqual({ assumptions: [a], refId: 'usda-sr28:18029', source: 'reference' })
  })

  it('writes the old shape when there is nothing to keep, and ignores junk meta', () => {
    expect(joinItemMeta({ components: { nuts: 1 }, source: 'ai' })).toEqual({ nuts: 1 })
    expect(splitItemMeta({ _meta: { source: 'hacker', refId: 'x y', assumptions: 'no' } }).meta).toEqual({ assumptions: [], refId: null, source: null })
  })

  it('source labels', () => {
    expect(itemSourceLabel('reference')).toBe('Ref: USDA SR28')
    expect(itemSourceLabel('library')).toBe('Library')
    expect(itemSourceLabel('off')).toBe('Open Food Facts')
    expect(itemSourceLabel('ai')).toBe('AI estimate')
  })
})
