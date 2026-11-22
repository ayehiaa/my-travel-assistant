import { describe, expect, it } from 'vitest'
import {
  ClinicianExportQuerySchema, assembleClinicianReport, csvCell, exportFileName, pdfSafeText, reportToCsv, type ClinicianInput,
} from './clinicianExport'
import { renderClinicianPdf } from './clinicianPdf'
import { SEED_PROGRAMME } from './seedProgramme'
import { addDays } from './time'

const TARGETS = { kcal: 2200, proteinG: 145, fatG: 75, satFatTargetG: 15, satFatCeilingG: 18, carbsG: 235, fibreMinG: 35 }
const item = (p: Partial<{ kcal: number; proteinG: number; satFatG: number; components: Record<string, number> }>) => ({
  kcal: 500, proteinG: 40, carbsG: 50, fatG: 15, satFatG: 4, fibreG: 8, components: {}, ...p,
})

function input(): ClinicianInput {
  const from = '2026-11-02'
  const weighIns = Array.from({ length: 21 }, (_, i) => ({ date: addDays('2026-10-27', i), weightKg: 82 - i * 0.1 }))
  return {
    from, to: '2026-11-15', generatedOn: '2026-11-22', programmeName: 'Seed', startDate: '2026-10-26',
    def: SEED_PROGRAMME,
    profile: { sex: 'male', age: 40, heightCm: 180, weightKg: 82, activityLevel: 'moderate', timezone: 'Europe/London' },
    targets: TARGETS,
    weighIns,
    waist: [{ date: '2026-11-02', cm: 98 }, { date: '2026-11-15', cm: 96.5 }, { date: '2026-10-01', cm: 100 }],
    labs: [{ date: '2026-11-03', totalMmol: 6.2, ldlMmol: 4.1, hdlMmol: 1.2, tgMmol: 1.5 }],
    food: [
      { date: '2026-11-02', items: [item({ proteinG: 80, components: { plant_stanols: 2 } }), item({ proteinG: 70, satFatG: 10 })] },
      { date: '2026-11-03', items: [item({ components: { oily_fish: 1 } }), item({ components: { oily_fish: 1 } })] },
      { date: '2026-11-04', items: [] },
      { date: '2026-10-30', items: [item({ proteinG: 200 })] },
    ],
    workouts: [
      { date: '2026-11-02', sessionKey: 'a', status: 'done', notes: null },
      { date: '2026-11-04', sessionKey: 'b', status: 'partial', notes: null },
      { date: '2026-11-06', sessionKey: 'c', status: 'skipped', notes: null },
      { date: '2026-10-30', sessionKey: 'a', status: 'done', notes: null },
    ],
    exerciseSets: [
      { date: '2026-11-02', exerciseKey: 'db_bench_press', sets: [{ setIndex: 0, loadKg: 20, reps: 12, holdSeconds: null, rir: 2, toFailure: false, isDropSet: false }] },
      { date: '2026-11-09', exerciseKey: 'db_bench_press', sets: [{ setIndex: 0, loadKg: 22, reps: 10, holdSeconds: null, rir: 2, toFailure: false, isDropSet: false }] },
      { date: '2026-11-09', exerciseKey: 'only_once', sets: [{ setIndex: 0, loadKg: 5, reps: 10, holdSeconds: null, rir: 2, toFailure: false, isDropSet: false }] },
    ],
    cardio: [
      { date: '2026-11-03', type: 'Incline walk', minutes: 30, avgHr: null, intervals: false },
      { date: '2026-11-05', type: 'Bike', minutes: 40, avgHr: 115, intervals: false },
      { date: '2026-11-20', type: 'Bike', minutes: 99, avgHr: null, intervals: false },
    ],
    notes: [{ date: '2026-11-05', text: 'Knee felt fine' }, { date: '2026-11-06', text: '  ' }],
  }
}

describe('query schema', () => {
  it('validates range and defaults', () => {
    expect(ClinicianExportQuerySchema.parse({ from: '2026-11-01', to: '2026-11-30' })).toEqual({ from: '2026-11-01', to: '2026-11-30', format: 'pdf', photos: false })
    expect(ClinicianExportQuerySchema.safeParse({ from: '2026-11-30', to: '2026-11-01' }).success).toBe(false)
    expect(ClinicianExportQuerySchema.safeParse({ from: '2024-01-01', to: '2026-11-01' }).success).toBe(false)
    expect(ClinicianExportQuerySchema.parse({ from: '2026-11-01', to: '2026-11-02', format: 'csv', photos: '1' }).photos).toBe(true)
  })
})

describe('assembleClinicianReport', () => {
  const r = assembleClinicianReport(input())
  it('weight rows in range with 7-day averages from earlier weigh-ins', () => {
    expect(r.weight.rows).toHaveLength(14)
    expect(r.weight.rows[0].date).toBe('2026-11-02')
    expect(r.weight.rows[0].avg7).toBeCloseTo(81.7, 5)
    expect(r.weight.changeKg).toBeCloseTo(-1.3, 5)
  })
  it('waist + labs in range only', () => {
    expect(r.waist.rows).toHaveLength(2)
    expect(r.waist.changeCm).toBe(-1.5)
    expect(r.labs).toEqual([{ date: '2026-11-03', total: 6.2, ldl: 4.1, hdl: 1.2, nonHdl: 5, tg: 1.5 }])
  })
  it('adherence on logged days', () => {
    expect(r.adherence.daysLogged).toBe(2)
    expect(r.adherence.proteinDays).toBe(1)
    expect(r.adherence.satFatTargetDays).toBe(2)
    expect(r.adherence.satFatCeilingDays).toBe(2)
    const stanols = r.adherence.components.find(c => c.name.toLowerCase().includes('stanol'))!
    expect(stanols.summary).toContain('met on 1 of 2 logged days')
    const fish = r.adherence.components.find(c => c.period === 'week')!
    expect(fish.summary).toContain('met in 1 of 1 logged weeks')
  })
  it('training + key lifts + cardio', () => {
    expect(r.training).toMatchObject({ done: 1, partial: 1, skipped: 1 })
    expect(r.training.keyLifts).toHaveLength(1)
    expect(r.training.keyLifts[0]).toMatchObject({ first: '20 kg × 12 (2026-11-02)', last: '22 kg × 10 (2026-11-09)', sessions: 2, changePct: 10 })
    expect(r.cardio).toMatchObject({ minutes: 70, sessions: 2, perWeek: 35 })
    expect(r.notes).toEqual([{ date: '2026-11-05', text: 'Knee felt fine' }])
    expect(r.photos).toEqual([])
  })
  it('profile has no photos or free text', () => {
    expect(r.profile[1]).toBe('Male, 40 y, height 180 cm, start weight 82 kg, activity: moderate')
  })
})

describe('CSV', () => {
  it('escapes cells and neutralises formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell(-1.5)).toBe('-1.5')
    expect(csvCell(null)).toBe('')
  })
  it('has all sections', () => {
    const csv = reportToCsv(assembleClinicianReport(input()))
    for (const s of ['weight,date,weight_kg', 'waist,date', 'lipids,date', 'adherence,measure', 'training,sessions done,1', 'key_lift,', 'cardio,total,70', 'notes,2026-11-05,Knee felt fine']) {
      expect(csv).toContain(s)
    }
    expect(exportFileName({ range: { from: 'a', to: 'b', days: 1 } }, 'csv')).toBe('health-summary-a-to-b.csv')
  })
})

describe('PDF', () => {
  it('sanitises text for standard fonts', () => {
    expect(pdfSafeText('sat fat ≤15 g → ok ✓')).toBe('sat fat <=15 g -> ok ?')
    expect(pdfSafeText('Café – “quoted” • 10 €')).toBe('Café – “quoted” • 10 €')
  })
  it('renders a PDF', async () => {
    const bytes = await renderClinicianPdf(assembleClinicianReport(input()))
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(1500)
  })
})
