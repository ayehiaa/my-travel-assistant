import { describe, it, expect } from 'vitest'
import { SEED_PROGRAMME as def } from './seedProgramme'
import { applyKcalChange, computeProposal, latestFinishedPeriod, matchBand, midpointReviewDue } from './adjustment'
import { addDays } from './time'
import type { WeighIn } from './checkin'

const START = '2026-09-07' // Monday
const series = (from: string, days: number, start: number, perDay: number, skip: number[] = []): WeighIn[] =>
  Array.from({ length: days }, (_, i) => ({ date: addDays(from, i), weightKg: Math.round((start + perDay * i) * 100) / 100 })).filter((_, i) => !skip.includes(i))

describe('periods', () => {
  it('fortnights from the start; none before day 15', () => {
    expect(latestFinishedPeriod(def, START, addDays(START, 13))).toBeNull()
    expect(latestFinishedPeriod(def, START, addDays(START, 14))).toEqual({ index: 1, start: START, end: addDays(START, 13) })
    expect(latestFinishedPeriod(def, START, addDays(START, 30))?.index).toBe(2)
    expect(latestFinishedPeriod(def, START, addDays(START, 200))?.index).toBe(6)
  })
})

describe('bands', () => {
  it('<0.4 → −150; 0.4–1.2 → 0; >1.2 → +150; boundaries → no change', () => {
    expect(matchBand(def, 0.3)?.kcalChange).toBe(-150)
    expect(matchBand(def, -0.5)?.kcalChange).toBe(-150)
    expect(matchBand(def, 0.4)?.kcalChange).toBe(0)
    expect(matchBand(def, 0.8)?.kcalChange).toBe(0)
    expect(matchBand(def, 1.2)?.kcalChange).toBe(0)
    expect(matchBand(def, 1.25)?.kcalChange).toBe(150)
  })
})

describe('computeProposal', () => {
  const p2 = latestFinishedPeriod(def, START, addDays(START, 30))!
  it('needs ≥5 weigh-ins in each week', () => {
    const w = series(p2.start, 14, 85, -0.02, [0, 1, 2])
    const r = computeProposal(def, START, w, p2)
    expect(r.status).toBe('insufficient_data')
    expect(r.reasoning).toMatch(/at least 5/)
  })
  it('slow loss → −150 kcal', () => {
    const r = computeProposal(def, START, series(p2.start, 14, 85, -0.03), p2)
    expect(r.status).toBe('proposal')
    expect(r.lossKg).toBeCloseTo(0.21, 2)
    expect(r.kcalChange).toBe(-150)
    expect(r.reasoning).toMatch(/drop one starch/)
  })
  it('on-target loss → no change; fast loss → +150', () => {
    expect(computeProposal(def, START, series(p2.start, 14, 85, -0.1), p2).kcalChange).toBe(0)
    expect(computeProposal(def, START, series(p2.start, 14, 85, -0.2), p2).kcalChange).toBe(150)
  })
  it('creatine caveat in the first weeks only', () => {
    const p1 = latestFinishedPeriod(def, START, addDays(START, 14))!
    expect(computeProposal(def, START, series(p1.start, 14, 85, -0.03), p1).caveat).toMatch(/water weight/)
    const p3 = latestFinishedPeriod(def, START, addDays(START, 43))!
    expect(computeProposal(def, START, series(p3.start, 14, 85, -0.03), p3).caveat).toBeNull()
  })
})

describe('applyKcalChange', () => {
  const t = { kcal: 2200, proteinG: 145, fatG: 75, satFatTargetG: 15, satFatCeilingG: 18, carbsG: 235, fibreMinG: 35 }
  it('keeps protein and moves carbs', () => {
    expect(applyKcalChange(t, -150, { sex: 'male' })).toEqual({ ...t, kcal: 2050, carbsG: 200 })
    expect(applyKcalChange(t, 150, { sex: 'male' })).toEqual({ ...t, kcal: 2350, carbsG: 275 })
  })
  it('respects the kcal floor', () => {
    const low = applyKcalChange({ ...t, kcal: 1550 }, -150, { sex: 'male' })
    expect(low.kcal).toBe(1500)
    expect(low.carbsG).toBe(225)
  })
})

describe('midpoint review', () => {
  it('shows in week 6 only', () => {
    expect(midpointReviewDue(def, START, addDays(START, 35))?.week).toBe(6)
    expect(midpointReviewDue(def, START, addDays(START, 28))).toBeNull()
    expect(midpointReviewDue(def, START, addDays(START, 0))).toBeNull()
  })
})
