import { describe, it, expect } from 'vitest'
import { SEED_PROGRAMME as def } from './seedProgramme'
import {
  LabInputSchema, labEscalations, labInputToPanel, milestoneDue, milestoneTaskKey, milestoneViews, nonHdl, waistBand,
  waistDue, waistInputToCm, waistTrend,
} from './measurements'
import { addDays } from './time'

describe('waist', () => {
  it('bands: >94 raised, >102 high (male); 80/88 female', () => {
    expect(waistBand(94, 'male')).toBe('ok')
    expect(waistBand(94.5, 'male')).toBe('raised')
    expect(waistBand(103, 'male')).toBe('high')
    expect(waistBand(85, 'female')).toBe('raised')
  })
  it('fortnightly reminder', () => {
    expect(waistDue(null, '2026-11-20')).toBe(true)
    expect(waistDue('2026-11-10', '2026-11-20')).toBe(false)
    expect(waistDue('2026-11-06', '2026-11-20')).toBe(true)
  })
  it('input in inches and trend', () => {
    expect(waistInputToCm({ date: '2026-11-20', value: 37, unit: 'in' })).toBe(94)
    expect(waistInputToCm({ date: '2026-11-20', value: 5, unit: 'cm' })).toBeNull()
    expect(waistTrend([{ date: '2026-11-20', cm: 96 }, { date: '2026-11-06', cm: 98 }]).changeCm).toBe(-2)
  })
})

describe('lipids', () => {
  it('converts mg/dL to mmol/L and computes non-HDL', () => {
    const p = labInputToPanel(LabInputSchema.parse({ date: '2026-11-20', unit: 'mgdl', total: 232, ldl: 155, hdl: 46, tg: 150 }))
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.panel.totalMmol).toBe(6)
    expect(p.panel.tgMmol).toBe(1.69)
    expect(nonHdl(p.panel)).toBeCloseTo(4.81, 2)
  })
  it('rejects a value in the wrong unit and an empty panel', () => {
    const r = labInputToPanel(LabInputSchema.parse({ date: '2026-11-20', unit: 'mmol', ldl: 155 }))
    expect(r.ok).toBe(false)
    expect(LabInputSchema.safeParse({ date: '2026-11-20', unit: 'mmol' }).success).toBe(false)
  })
  it('LDL > 4.9 escalation only after week 12', () => {
    const start = '2026-09-07'
    const panel = (date: string, ldl: number) => ({ date, totalMmol: null, ldlMmol: ldl, hdlMmol: null, tgMmol: null })
    expect(labEscalations(def, start, [panel(addDays(start, 30), 5.5)])).toEqual([])
    expect(labEscalations(def, start, [panel(addDays(start, 80), 4.8)])).toEqual([])
    const e = labEscalations(def, start, [panel(addDays(start, 80), 5.1)])
    expect(e[0]).toMatchObject({ metric: 'LDL', value: 5.1, threshold: 4.9 })
  })
})

describe('milestones', () => {
  const start = '2026-09-07'
  it('state, tasks and actuals', () => {
    const today = addDays(start, 37) // week 6
    const weighIns = Array.from({ length: 40 }, (_, i) => ({ date: addDays(start, i), weightKg: 85 - i * 0.06 }))
    const views = milestoneViews(def, {
      startDate: start, today, startWeightKg: 85, weighIns,
      waist: [{ date: start, cm: 100 }, { date: addDays(start, 35), cm: 97.5 }],
      doneKeys: new Set(def.milestones[0].tasks.map(t => milestoneTaskKey(1, t))),
    })
    expect(views.map(v => v.state)).toEqual(['done', 'due', 'current', 'upcoming', 'upcoming'])
    const w6 = views[2]
    expect(w6.actual.weightChangeKg).toBeLessThan(-1.5)
    expect(w6.actual.waistChangeCm).toBe(-2.5)
    expect(milestoneDue(views)?.week).toBe(6)
    expect(milestoneTaskKey(6, 'Mid-point review')).toBe('w6:mid_point_review')
  })
})
