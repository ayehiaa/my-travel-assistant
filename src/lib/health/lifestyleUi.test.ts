import { describe, it, expect } from 'vitest'
import {
  adherenceTone, ceilingMeter, foodGoalAdherence, componentChip, effortOf, effortText, entrySummary, foodsForComponent, kcalMeter,
  minTargetMeter, phaseLabel, shortLabel, prefillSet, recentFoods, sliceRange, weekChip, weekDot, EFFORT_OPTIONS,
} from './lifestyleUi'
import type { LibraryFood } from './foodLibrary'
import type { FoodItem } from './nutrition'
import type { LoggedSet } from './training'

const item = (name: string, kcal = 100): FoodItem => ({
  name, quantityG: 100, kcal, proteinG: 10, carbsG: 10, fatG: 2, satFatG: 1, fibreG: 1, components: {},
  confidence: 'high', isTreat: false, source: 'manual', libraryId: null, offCode: null,
})
const lib = (id: string, name: string, comps: Record<string, number> = {}, q = 100): LibraryFood => ({
  id, name, normalizedName: name.toLowerCase(), defaultQuantityG: q, isTreat: false,
  per100: { kcal: 200, proteinG: 5, carbsG: 30, fatG: 4, satFatG: 1, fibreG: 3, components: comps },
})
const set = (setIndex: number, loadKg: number | null, reps: number | null, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  setIndex, loadKg, reps, holdSeconds: null, rir: 2, toFailure: false, isDropSet: false, ...extra,
})

describe('meters', () => {
  it('calories: on track, nearly there, over', () => {
    expect(kcalMeter(1000, 2000)).toMatchObject({ left: 1000, tone: 'good', ratio: 0.5 })
    expect(kcalMeter(1850, 2000)).toMatchObject({ left: 150, tone: 'close' })
    expect(kcalMeter(2100, 2000)).toMatchObject({ left: -100, tone: 'bad', status: 'Over', ratio: 1 })
  })
  it('minimum targets are neutral until met', () => {
    expect(minTargetMeter(60, 150)).toMatchObject({ tone: 'neutral', status: null })
    expect(minTargetMeter(150, 150)).toMatchObject({ tone: 'good', status: 'Done' })
  })
  it('sat fat: good, over target (amber), over ceiling (red), with a marker', () => {
    expect(ceilingMeter(10, 13, 20)).toMatchObject({ tone: 'good', markerRatio: 0.65 })
    expect(ceilingMeter(15, 13, 20)).toMatchObject({ tone: 'close', status: 'Over target' })
    expect(ceilingMeter(21, 13, 20)).toMatchObject({ tone: 'bad', status: 'Over limit', ratio: 1 })
  })
  it('adherence tones', () => {
    expect(adherenceTone(3, 3)).toBe('good')
    expect(adherenceTone(2, 3)).toBe('close')
    expect(adherenceTone(1, 3)).toBe('bad')
    expect(adherenceTone(1, null)).toBe('neutral')
  })
})

describe('component chips', () => {
  const base = { key: 'nuts', name: 'Nuts', unit: 'g', period: 'day' as const, target: 30 }
  it('daily done / left', () => {
    expect(componentChip({ ...base, value: 30, met: true })).toMatchObject({ state: 'done', text: '✓', remaining: 0 })
    expect(componentChip({ ...base, value: 12.5, met: false })).toMatchObject({ state: 'todo', text: '17.5 g left', remaining: 17.5 })
    expect(componentChip({ ...base, unit: 'servings', target: 1, value: 0, met: false }).text).toBe('1 left')
  })
  it('weekly and not due (starter week)', () => {
    const wk = { key: 'oily_fish', name: 'Oily fish', unit: 'servings', period: 'week' as const }
    expect(componentChip({ ...wk, target: 2, value: 1, met: false })).toMatchObject({ state: 'todo', text: '1/2 this week' })
    expect(componentChip({ ...wk, target: 0, value: 0, met: false, notDue: true })).toMatchObject({ state: 'not_due', text: 'not due' })
  })
  it('foods for a component, best first', () => {
    const l = [lib('1', 'Oats', { beta_glucan: 4 }, 40), lib('2', 'Barley', { beta_glucan: 3 }, 100), lib('3', 'Apple')]
    expect(foodsForComponent(l, 'beta_glucan').map(f => [f.food.id, f.amount])).toEqual([['2', 3], ['1', 1.6]])
    expect(foodsForComponent(l, 'nuts')).toEqual([])
  })
})

describe('effort picker', () => {
  it('maps rir and failure both ways', () => {
    expect(effortOf(null, true)).toBe('failure')
    expect(effortOf(4, false)).toBe('easy')
    expect(effortOf(3, false)).toBe('easy')
    expect(effortOf(2, false)).toBe('medium')
    expect(effortOf(0, false)).toBe('hard')
    expect(effortOf(null, false)).toBeNull()
    for (const o of EFFORT_OPTIONS) expect(effortOf(o.rir, o.failure)).toBe(o.key)
    expect(effortText('1-2')).toBe('1–2 reps left')
    expect(effortText(null)).toBeNull()
  })
})

describe('set prefill', () => {
  const prev = [set(0, 20, 10), set(1, 20, 9), set(1, 14, 6, { isDropSet: true, toFailure: true })]
  it('uses the same set from last time and the suggested load', () => {
    expect(prefillSet(prev, 0, 22)).toEqual({ previous: '20 kg × 10', load: '22', reps: '10', hold: '' })
    expect(prefillSet(prev, 1, null)).toEqual({ previous: '20 kg × 9', load: '20', reps: '9', hold: '' })
  })
  it('an extra set copies the last working set but shows no previous', () => {
    expect(prefillSet(prev, 3, null)).toEqual({ previous: null, load: '20', reps: '9', hold: '' })
  })
  it('first time and holds', () => {
    expect(prefillSet(null, 0, null)).toEqual({ previous: null, load: '', reps: '', hold: '' })
    expect(prefillSet([set(0, null, null, { holdSeconds: 45 })], 0, null)).toEqual({ previous: '45 s', load: '', reps: '', hold: '45' })
  })
})

describe('week strip, phase, week chip', () => {
  it('maps schedule statuses to dots', () => {
    expect(weekDot({ status: 'done', kind: 'session' })).toBe('done')
    expect(weekDot({ status: 'moved', kind: 'session' })).toBe('done')
    expect(weekDot({ status: 'missed', kind: 'session' })).toBe('missed')
    expect(weekDot({ status: 'upcoming', kind: 'session' })).toBe('planned')
    expect(weekDot({ status: 'before_start', kind: 'session' })).toBe('before_start')
    expect(weekDot({ status: null, kind: 'rest' })).toBe('rest')
    expect(weekDot({ status: null, kind: 'cardio' })).toBe('cardio')
    expect(weekDot({ status: null, kind: 'walk' })).toBe('cardio')
  })
  it('renames blocks to phases', () => {
    expect(phaseLabel('Block 2 — Build', 1)).toBe('Phase 2 · Build')
    expect(phaseLabel('Block 3', 2)).toBe('Phase 3')
    expect(phaseLabel('Strength', 0)).toBe('Phase 1 · Strength')
  })
  it('week chip incl. starter week', () => {
    expect(weekChip('2026-11-20', '2026-11-19', 12)).toBe('Starts Fri 20 Nov')
    expect(weekChip('2026-11-20', '2026-11-21', 12)).toBe('Starter week')
    expect(weekChip('2026-11-20', '2026-11-23', 12)).toBe('Week 1 of 12')
    expect(weekChip('2026-11-23', '2027-03-01', 12)).toBe('Complete')
  })
})

describe('food summaries and recents', () => {
  it('summarises an entry', () => {
    expect(entrySummary([item('Porridge'), item('Blueberries'), item('Walnuts'), item('Soy milk')])).toBe('Porridge, Blueberries +2')
    expect(entrySummary([], 'coffee')).toBe('coffee')
  })
  it('recent meals first (deduped), then favourites', () => {
    const entries = [
      { date: '2026-11-21', time: '08:00', items: [item('Porridge', 300)] },
      { date: '2026-11-22', time: '08:00', items: [{ ...item('Porridge', 300), id: 'x' }] },
      { date: '2026-11-22', time: '13:00', items: [item('Lentil soup', 250), item('Rye bread', 120)] },
    ]
    const r = recentFoods(entries, [lib('a', 'Porridge'), lib('b', 'Almonds')], 6)
    expect(r.map(x => [x.kind, x.name])).toEqual([['recent', 'Lentil soup, Rye bread'], ['recent', 'Porridge'], ['favourite', 'Almonds']])
    expect(r[0].kcal).toBe(370)
    expect('id' in r[1].items[0]).toBe(false)
    expect(r[2].items[0].source).toBe('library')
  })
})

describe('chart ranges', () => {
  const pts = ['2026-08-01', '2026-10-01', '2026-11-01', '2026-11-22'].map(date => ({ date }))
  it('slices by range', () => {
    expect(sliceRange(pts, '1m', '2026-11-22').map(p => p.date)).toEqual(['2026-11-01', '2026-11-22'])
    expect(sliceRange(pts, '3m', '2026-11-22').map(p => p.date)).toEqual(['2026-10-01', '2026-11-01', '2026-11-22'])
    expect(sliceRange(pts, 'all', '2026-11-22')).toHaveLength(4)
  })
})

describe('short labels', () => {
  it('drops parenthetical advice', () => {
    expect(shortLabel('Session A — Upper (black coffee 45 min before if training before 2pm)')).toBe('Session A — Upper')
    expect(shortLabel('Zone 2 cardio — 30 min')).toBe('Zone 2 cardio — 30 min')
  })
})

describe('food goal adherence', () => {
  it('averages daily and due weekly components', () => {
    expect(foodGoalAdherence([
      { period: 'day', value: 7, of: 7 },
      { period: 'day', value: 3, of: 7 },
      { period: 'week', value: 3, of: 2 },
      { period: 'week', value: 0, of: 0, note: 'not due this week' },
    ])).toEqual({ pct: 81, tone: 'close' })
    expect(foodGoalAdherence([{ period: 'week', value: 0, of: 0, note: 'not due this week' }])).toBeNull()
  })
})
