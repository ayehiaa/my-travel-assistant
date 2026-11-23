/**
 * Fixture data for the dev-only Lifestyle preview (specs/032). Built from the seed programme and the real pure
 * helpers (targets, schedule, prescriptions, weekly review, chips) — no database. Never used in production.
 */
import { SEED_PROGRAMME } from '@/lib/health/seedProgramme'
import { computeTargets, type Profile } from '@/lib/health/targets'
import type { ActiveEnrolment } from '@/lib/health/healthServer'
import type { FoodItem } from '@/lib/health/nutrition'
import { componentProgress, sumComponents, sumNutrients, uncertaintyBand, suggestSlot } from '@/lib/health/nutrition'
import type { LibraryFood } from '@/lib/health/foodLibrary'
import { itemFromLibrary } from '@/lib/health/foodLibrary'
import {
  componentChip, foodsForComponent, recentFoods, shortLabel, weekChip, weekDot, phaseLabel, effortText, foodGoalAdherence, adherenceTone,
} from '@/lib/health/lifestyleUi'
import { addDays, programmeWeekLabel, weekdayOf, weekStart } from '@/lib/health/time'
import { trainingPosition, weekSchedule, type LoggedSet, type WorkoutSummary } from '@/lib/health/training'
import { prescriptionFor } from '@/lib/health/trainingServer'
import { computeWeeklyReview } from '@/lib/health/weeklyReview'
import { sevenDayAverageSeries } from '@/lib/health/checkin'
import type { TodayModel } from '@/components/health/TodayView'
import type { FoodModel } from '@/components/health/FoodView'
import type { TrainOverviewModel } from '@/components/health/TrainingTab'
import type { ProgressModel } from '@/components/health/ProgressView'
import type { PlayerExercise } from '@/components/health/SessionPlayer'
import type { ActivityCardProps } from '@/components/health/ActivityCard'

export const TODAY = '2026-11-20'
export const NOW = '12:40'
const START = '2026-11-02'
const def = SEED_PROGRAMME
const profile: Profile = { sex: 'male', age: 44, heightCm: 180, weightKg: 92, activityLevel: 'moderate', timezone: 'Europe/London' }
const targets = computeTargets(def, profile).targets

export const enrolment: ActiveEnrolment = {
  id: 'fixture', programmeId: 'fixture', programmeName: def.identity.name, templateKey: null, startDate: START,
  timezone: 'Europe/London', homeTimezone: 'Europe/London', profile, overrides: {}, targets, def, createdAt: '2026-11-01T09:00:00Z',
}

const lib = (id: string, name: string, q: number, kcal: number, p: number, sat: number, comps: Record<string, number> = {}): LibraryFood => ({
  id, name, normalizedName: name.toLowerCase(), defaultQuantityG: q, isTreat: false,
  per100: { kcal, proteinG: p, carbsG: 20, fatG: 5, satFatG: sat, fibreG: 3, components: comps },
})
export const library: LibraryFood[] = [
  lib('l1', 'Porridge oats with soya milk', 250, 90, 4, 0.3, { beta_glucan: 1.4, soy_protein: 2.6 }),
  lib('l2', 'Benecol yogurt drink', 65, 50, 2.8, 0.2, { plant_stanols: 3.1 }),
  lib('l3', 'Walnuts', 30, 654, 15, 6, { nuts: 100 }),
  lib('l4', 'Lentil soup', 300, 60, 4, 0.1, { pulses: 0.4 }),
  lib('l5', 'Grilled salmon fillet', 140, 200, 22, 2.4, { oily_fish: 0.72 }),
  lib('l6', 'Edamame beans', 100, 121, 12, 0.6, { soy_protein: 11 }),
]

const item = (name: string, q: number, kcal: number, p: number, sat: number, comps: Record<string, number> = {}, extra: Partial<FoodItem> = {}): FoodItem => ({
  name, quantityG: q, kcal, proteinG: p, carbsG: Math.round(kcal / 10), fatG: Math.round(sat * 2.5), satFatG: sat, fibreG: 3, components: comps,
  confidence: 'high', isTreat: false, source: 'library', libraryId: null, offCode: null, ...extra,
})

const entries = [
  { id: 'e1', date: TODAY, time: '07:35', slot: 'breakfast', text: 'porridge with soya milk and blueberries', restaurant: false, noAddedFat: false, photoPaths: [] as string[], items: [
    item('Porridge oats with soya milk', 250, 225, 10, 0.8, { beta_glucan: 3.5, soy_protein: 6.5 }),
    item('Blueberries', 80, 46, 0.6, 0),
    item('Benecol yogurt drink', 65, 33, 1.8, 0.1, { plant_stanols: 2 }),
  ] },
  { id: 'e2', date: TODAY, time: '10:40', slot: 'coffee', text: 'flat white with soya', restaurant: false, noAddedFat: false, photoPaths: [], items: [
    item('Flat white (soya)', 250, 95, 6, 0.4, { soy_protein: 6 }),
  ] },
  { id: 'e3', date: TODAY, time: '12:30', slot: 'lunch', text: 'chicken wrap from the café', restaurant: true, noAddedFat: false, photoPaths: [], items: [
    item('Chicken & salad wrap', 230, 480, 34, 4.2, {}, { source: 'ai', confidence: 'medium', assumptions: [{ key: 'mayo', label: 'mayonnaise', kind: 'added_fat', addsKcal: 70, addsSatFatG: 1.1, addsProteinG: 0, addsCarbsG: 0, addsFatG: 7.5, grams: 10, kept: true }] }),
    item('Lentil soup', 300, 180, 12, 0.3, { pulses: 1.2 }),
  ] },
]
const todayItems = entries.flatMap(e => e.items)
const totals = sumNutrients(todayItems)
const weekItems = [...todayItems, item('Grilled salmon fillet', 140, 280, 31, 3.4, { oily_fish: 1 })]

const workouts: WorkoutSummary[] = [
  { id: 'w1', date: '2026-11-16', sessionKey: 'a', status: 'done' },
  { id: 'w2', date: '2026-11-18', sessionKey: 'b', status: 'partial' },
]

const activity: Omit<ActivityCardProps, 'title'> = {
  date: TODAY, typeOptions: ['Zone 2', 'Flat or uphill walk', 'Incline treadmill', 'Bike (saddle high)', 'Front crawl'],
  avoidTypes: def.cardio?.avoid ?? [], zone: { zone: 'Zone 2', bpmMin: 104, bpmMax: 122 },
  weekly: { minutes: 60, target: 120, note: null }, sessions: [], steps: 6200, stepsTarget: '8,000–10,000 a day', stepsStatus: 'below',
  intervals: null, migrationNeeded: false,
}

export function todayModel(): TodayModel {
  const progress = componentProgress(def, sumComponents(todayItems), sumComponents(weekItems), { startDate: START, date: TODAY })
  const sources = new Map(def.components.map(c => [c.key, c.sources]))
  const scheduled = def.weeklySchedule?.days.find(d => d.day === weekdayOf(TODAY)) ?? null
  return {
    date: TODAY, time: NOW,
    weekChip: weekChip(START, TODAY, def.identity.durationWeeks),
    weekDetail: programmeWeekLabel(START, TODAY, def.identity.durationWeeks),
    dayLabel: scheduled ? shortLabel(scheduled.label) : null,
    kcal: { eaten: totals.kcal, target: targets.kcal },
    protein: { value: totals.proteinG, target: targets.proteinG },
    satFat: { value: totals.satFatG, target: targets.satFatTargetG, ceiling: targets.satFatCeilingG },
    chips: progress.map(c => ({
      ...componentChip(c),
      sources: sources.get(c.key) ?? [],
      suggestions: foodsForComponent(library, c.key).map(({ food, amount }) => {
        const it = itemFromLibrary(food)
        return { id: food.id, name: food.name, amount: c.unit === 'servings' ? `${amount} serving` : `${amount} ${c.unit}`, kcal: it.kcal, items: [it] }
      }),
    })),
    slot: suggestSlot(def.mealSlots, NOW)?.key ?? null,
    checkin: {
      date: TODAY, supplements: def.supplements.map(s => ({ key: s.key, name: s.name, dose: s.dose })),
      existing: { weightKg: 90.4, bedTime: '23:10', wakeTime: '07:05', supplementsTaken: ['creatine'] },
      typicalBed: '23:00', typicalWake: '07:00', weightUnit: 'kg',
    },
    morningCheck: null,
    adjustment: null,
    notices: [{ key: 'waist', text: 'Waist measurement due', href: '/health?tab=progress' }],
    jointStop: null,
    recs: [
      { key: 'r1', message: 'Have 30 g of nuts this afternoon — e.g. a small handful of walnuts.', group: 'daily' },
      { key: 'r2', message: 'Sat fat is at 7.5 g of 20 g — keep dinner lean (fish or pulses).', group: 'daily' },
      { key: 'r3', message: 'Oily fish: 1 more serving this week.', group: 'weekly' },
    ],
    session: { label: 'Session C · Full body', status: 'todo', href: '/dev/lifestyle-preview?tab=player', note: null, warnings: [] },
    cardio: { label: 'Zone 2 · 30 min', todayMinutes: 0, weekMinutes: 60, weekTarget: 120 },
    steps: { value: 6200, target: '8,000–10,000 a day', tone: 'neutral' },
    activity,
    trip: null,
  }
}

export function foodModel(): FoodModel {
  const known = new Set(def.mealSlots.map(s => s.key))
  const view = (e: (typeof entries)[number]) => ({ id: e.id, time: e.time, slot: e.slot, text: e.text, restaurant: e.restaurant, noAddedFat: e.noAddedFat, items: e.items, photos: [] })
  const meals: FoodModel['meals'] = def.mealSlots.map(s => ({ key: s.key, name: s.name, window: `${s.start}–${s.end}`, entries: entries.filter(e => e.slot === s.key).map(view) }))
  const componentLabels = Object.fromEntries(def.components.map(c => [c.key, { name: c.name, unit: c.unit }]))
  void known
  return {
    date: TODAY, today: TODAY, totals, targets, band: uncertaintyBand(totals.kcal), starchLeft: 1, meals,
    slots: def.mealSlots.map(s => ({ key: s.key, name: s.name })), componentLabels,
    recents: recentFoods([...entries, { date: addDays(TODAY, -1), time: '19:10', text: null, items: [item('Grilled salmon fillet', 140, 280, 31, 3.4), item('New potatoes', 150, 110, 3, 0)] }], library, 6),
    log: { date: TODAY, nowTime: NOW, slots: def.mealSlots, componentLabels, eatingOut: def.eatingOut },
    relogSlot: 'lunch',
    dayLines: ['Check-in: 90.4 kg · slept 23:10–07:05 (7 h 55 min) · Creatine monohydrate'],
    activity,
  }
}

export function trainModel(): TrainOverviewModel {
  const week = weekSchedule(def, TODAY, workouts, START)
  const pos = trainingPosition(def, START, TODAY)
  const block = pos.block!
  const c = def.trainingSessions.find(s => s.key === 'c')!
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return {
    today: TODAY,
    phase: `${phaseLabel(block.name, 0)} · ${weekChip(START, TODAY, def.identity.durationWeeks)}`,
    phaseInfo: [`${block.focus} · ${block.repRange} reps · ${effortText(block.rir ?? null)}`, ...(def.weeklySchedule?.spacingRules ?? [])],
    joint: { level: 'ok', message: '', uncleared: null },
    week: week.map(d => ({ date: d.date, letter: fmt(d.date).slice(0, 2), dot: weekDot(d), title: `${fmt(d.date)}: ${shortLabel(d.label)}`, href: d.sessionKey ? '/dev/lifestyle-preview?tab=player' : null, isToday: d.date === TODAY })),
    next: { name: c.name, focus: c.focus, meta: `${c.exercises.length} exercises · ${c.exercises.reduce((n, e) => n + (e.sets ?? 0), 0)} sets`, href: '/dev/lifestyle-preview?tab=player' },
    reason: '', warnings: [],
    sessions: def.trainingSessions.map(t => ({ key: t.key, name: `${t.name} · ${t.focus}`, href: '/dev/lifestyle-preview?tab=player' })),
    recent: workouts.map(w => ({ id: w.id!, date: fmt(w.date), name: def.trainingSessions.find(t => t.key === w.sessionKey)!.name, href: '#', meta: `${w.status} · 52 min` })).reverse(),
    jointLine: `${fmt('2026-11-19')}: OK · 2/10 during · 1/10 next morning`,
    unlocks: [{ key: 'u1', name: 'Reverse lunge', available: false, status: 'Locked', reason: 'From week 5 if the pain rule has passed for 2 weeks.', notes: null, approval: { approved: false, movement: 'Reverse lunge' } }],
    excluded: def.movementRestrictions?.excluded ?? [],
    history: def.trainingSessions.map(t => ({ key: t.key, name: t.name, exercises: t.exercises.map(e => ({ key: e.key, name: e.name, href: '#' })) })),
    activity,
    openCardio: false,
  }
}

const set = (i: number, kg: number | null, reps: number | null, rir: number | null = 2, hold: number | null = null): LoggedSet => ({ setIndex: i, loadKg: kg, reps, holdSeconds: hold, rir, toFailure: false, isDropSet: false })

export function playerExercises(): PlayerExercise[] {
  const c = def.trainingSessions.find(s => s.key === 'c')!
  const week = trainingPosition(def, START, TODAY).prescriptionWeek
  const last: Record<string, LoggedSet[]> = {
    floor_press_or_push_up: [set(0, 14, 12), set(1, 14, 11), set(2, 14, 10, 1)],
    staggered_rdl: [set(0, 12, 12), set(1, 12, 12), set(2, 12, 11)],
    chest_supported_row: [set(0, 12, 12), set(1, 12, 12), set(2, 12, 12), set(3, 12, 11)],
    c_shallow_wall_sit: [set(0, null, null, null, 45), set(1, null, null, null, 45), set(2, null, null, null, 40)],
    db_curl: [set(0, 8, 12), set(1, 8, 11), set(2, 8, 10)],
    oh_triceps_ext: [set(0, 10, 12), set(1, 10, 12), set(2, 10, 11)],
  }
  return c.exercises.map(ex => {
    const rx = prescriptionFor(enrolment, 'c', ex.key, week, true)!
    const prev = last[ex.key] ?? null
    const load = prev?.find(s => (s.loadKg ?? 0) > 0)?.loadKg ?? null
    return {
      key: ex.key, name: ex.name, travelName: null, videoUrl: '#', travelVideoUrl: null, notes: ex.notes ?? null, tempo: ex.tempo ?? null,
      perSide: ex.perSide, supersetGroup: ex.supersetGroup ?? null, jointWatch: ex.jointWatch,
      usesLoad: (ex.equipment ?? []).some(e => /dumbbell/i.test(e)) || load !== null, isUnlock: false, rx,
      last: prev ? { date: '2026-11-13', sets: prev } : null,
      suggestion: ex.key === 'chest_supported_row' ? { kind: 'add_load', message: '+2 kg next time', nextLoadKg: 14 } : null,
      startLoad: ex.key === 'chest_supported_row' ? 14 : load,
      safety: { disabled: false, warning: null, suppressProgression: false },
    }
  })
}

export function progressModel(): ProgressModel {
  const from = addDays(TODAY, -100)
  const weighIns = Array.from({ length: 100 }, (_, i) => addDays(from, i + 1))
    .filter((_, i) => i % 3 !== 1 && i > 70)
    .map((date, i) => ({ date, weightKg: Math.round((92 - i * 0.07 + (i % 4 === 0 ? 0.4 : -0.2)) * 10) / 10 }))
  const series = sevenDayAverageSeries(weighIns, from, TODAY)
  const firstIdx = series.findIndex(p => p.avg !== null)
  const daily = new Map(weighIns.map(w => [w.date, w.weightKg]))
  const waist = [{ date: '2026-11-03', cm: 104 }, { date: '2026-11-17', cm: 102.5 }]
  const review = computeWeeklyReview({
    def, targets, weekStart: weekStart(TODAY), startDate: START, daysElapsed: 5,
    food: [0, 1, 2, 3, 4].map(i => ({ date: addDays(weekStart(TODAY), i), items: i === 4 ? weekItems : todayItems })),
    workouts: workouts.map(w => ({ date: w.date, status: w.status })),
    cardio: [{ date: '2026-11-17', type: 'Zone 2', minutes: 30, avgHr: 112, intervals: false }, { date: '2026-11-19', type: 'Zone 2', minutes: 30, avgHr: 115, intervals: false }],
    steps: [{ date: '2026-11-16', steps: 8400 }, { date: '2026-11-17', steps: 9100 }, { date: '2026-11-18', steps: 6900 }],
    sleep: [{ date: '2026-11-18', bedTime: '23:00', wakeTime: '07:00' }, { date: '2026-11-19', bedTime: '23:30', wakeTime: '07:00' }, { date: '2026-11-20', bedTime: '23:10', wakeTime: '07:05' }],
    weighIns, waist,
  })
  const fg = foodGoalAdherence(review.components)!
  return {
    today: TODAY,
    units: { weight: 'kg', length: 'cm', lipids: 'mmol' },
    weekTitle: `This week · ${review.daysCounted} of 7 days`,
    tiles: [
      { key: 'weight', label: 'Weight (7-day)', value: '90.6 kg', sub: '↓ 0.48 kg/wk' },
      { key: 'waist', label: 'Waist', value: '102.5 cm', sub: '−1.5 cm since first' },
      { key: 'food', label: 'Food goals', value: `${fg.pct}%`, tone: fg.tone, status: fg.tone === 'good' ? 'On track' : fg.tone === 'close' ? 'Close' : 'Behind' },
      { key: 'train', label: 'Training', value: `${review.sessions.done}/${review.sessions.planned}`, sub: '+1 partial', tone: adherenceTone(review.sessions.done, review.sessions.planned) },
      { key: 'cardio', label: 'Cardio', value: '60 min', sub: 'of 120', tone: 'bad' },
      { key: 'steps', label: 'Steps (avg)', value: '8,133', sub: 'goal 8,000', tone: 'good', status: 'On track' },
      { key: 'protein', label: 'Protein days', value: `${review.proteinDays}/${review.daysCounted}`, tone: adherenceTone(review.proteinDays, review.daysCounted) },
      { key: 'sleep', label: 'Sleep (avg)', value: '7 h 52 min', sub: '23:10–07:00 · 3/3 steady', tone: 'good', status: 'In range' },
    ],
    adjustment: null,
    adjustmentNote: null,
    weight: {
      points: series.slice(firstIdx).map(p => ({ date: p.date, line: p.avg, dot: daily.get(p.date) ?? null })),
      baseline: 92, unit: 'kg',
      info: ['0.53% of body weight a week.', 'Since start: −1.4 kg (start 92 kg).', 'Daily weight is mostly water — watch the average.'],
      history: [],
    },
    p2Notice: null,
    waist: {
      points: waist.map(w => ({ date: w.date, line: w.cm, dot: w.cm })),
      card: { today: TODAY, unit: 'cm', rows: waist.map((w, i) => ({ id: `w${i}`, date: w.date, display: w.cm, band: 'high' as const })), due: true, bandsText: 'Raised above 94 cm, high above 102 cm.', changeText: '−1.5 cm' },
    },
    labs: { today: TODAY, unit: 'mmol', rows: [{ id: 'lab1', date: '2026-10-28', total: 6.4, ldl: 4.3, hdl: 1.1, tg: 2.1, nonHdl: 5.3 }], expectations: def.outcomes?.expectations ?? [], escalations: [] },
    milestones: def.milestones.slice(0, 3).map((m, i) => ({ week: m.week, dates: '', state: i === 0 ? 'done' : i === 1 ? 'current' : 'upcoming', tasks: m.tasks.map(t => ({ task: t, done: i === 0 })), expected: m.expected, actual: [] })),
    photos: { today: TODAY, photos: [] },
    reviews: { current: review, past: [] },
  }
}
