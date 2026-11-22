import { createClient } from '@/lib/supabase/server'
import { loadCheckins, loadEntries, loadLibrary, nowFor, type ActiveEnrolment } from '@/lib/health/healthServer'
import { signedPhotoUrls } from '@/lib/health/healthPhotos'
import { mealsRemaining, suggestSlot, sumNutrients, uncertaintyBand } from '@/lib/health/nutrition'
import { formatDuration, sleepDurationMinutes } from '@/lib/health/checkin'
import { loadJointChecks, loadWorkouts } from '@/lib/health/trainingServer'
import { recentFoods } from '@/lib/health/lifestyleUi'
import { addDays } from '@/lib/health/time'
import { loadActivityProps } from './ActivitySection'
import HealthNotice from './HealthNotice'
import FoodView, { type FoodModel } from './FoodView'

/** Food tab (was "Log"; specs/029 §5, redesigned in specs/032): one day's meals, totals, recents, cardio & steps. */
export default async function LogTab({ userId, enrolment, date }: { userId: string; enrolment: ActiveEnrolment; date: string }) {
  const supabase = await createClient()
  const { date: today, time } = nowFor(enrolment)
  let entries: Awaited<ReturnType<typeof loadEntries>>
  let recentEntries: Awaited<ReturnType<typeof loadEntries>>
  let checkins: Awaited<ReturnType<typeof loadCheckins>>
  let library: Awaited<ReturnType<typeof loadLibrary>>
  try {
    ;[entries, recentEntries, checkins, library] = await Promise.all([
      loadEntries(supabase, userId, date, date),
      loadEntries(supabase, userId, addDays(today, -13), today),
      loadCheckins(supabase, userId, date, date),
      loadLibrary(supabase, userId, 20),
    ])
  } catch (err) {
    return <HealthNotice title="Could not load this day">{err instanceof Error ? err.message : 'Try again shortly.'}</HealthNotice>
  }
  const urls = await signedPhotoUrls(entries.flatMap(e => e.photoPaths))
  // Training for the day (best effort: empty when the P1b migration is not applied).
  let workouts: Awaited<ReturnType<typeof loadWorkouts>> = []
  let joint: Awaited<ReturnType<typeof loadJointChecks>> = []
  try { [workouts, joint] = await Promise.all([loadWorkouts(supabase, userId, date, date), loadJointChecks(supabase, userId)]) } catch { /* not available */ }
  const activity = await loadActivityProps({ userId, enrolment, date, painPassed: null, checks: [] })

  const { def, targets } = enrolment
  const checkin = checkins[0] ?? null
  const totals = sumNutrients(entries.flatMap(e => e.items))
  const supplementNames = new Map(def.supplements.map(s => [s.key, s.name]))
  const oneStarch = def.nutritionRules.some(r => r.type === 'one_starch_per_meal')
  const logTime = date === today ? time : '12:00'

  const dayLines: string[] = []
  if (checkin) {
    const parts = [checkin.weightKg != null ? `${checkin.weightKg} kg` : null]
    if (checkin.bedTime && checkin.wakeTime) parts.push(`slept ${checkin.bedTime}–${checkin.wakeTime} (${formatDuration(sleepDurationMinutes(checkin.bedTime, checkin.wakeTime))})`)
    if (checkin.supplementsTaken.length > 0) parts.push(checkin.supplementsTaken.map(k => supplementNames.get(k) ?? k).join(', '))
    dayLines.push(`Check-in: ${parts.filter(Boolean).join(' · ') || 'saved'}`)
  }
  for (const w of workouts) {
    const check = joint.find(c => c.workoutId === w.id)
    let line = `${def.trainingSessions.find(t => t.key === w.sessionKey)?.name ?? w.sessionKey}: ${w.status}${w.skipReason ? ` (${w.skipReason})` : ''}${w.durationMinutes ? ` · ${w.durationMinutes} min` : ''}`
    if (check && (check.duringPain !== null || check.nextMorningPain !== null)) {
      line += ` · joint ${check.duringPain ?? '–'}/10${check.nextMorningPain !== null ? `, ${check.nextMorningPain}/10 next morning` : ''}${check.swelling ? ', swelling' : ''}${check.redFlags.length ? `, red flags: ${check.redFlags.join(', ')}` : ''}`
    }
    dayLines.push(line)
  }

  const view = (e: (typeof entries)[number]) => ({
    id: e.id, time: e.time, slot: e.slot, text: e.text, restaurant: e.restaurant, noAddedFat: e.noAddedFat, items: e.items,
    photos: e.photoPaths.filter(p => !!urls[p]).map(p => ({ path: p, url: urls[p] })),
  })
  const known = new Set(def.mealSlots.map(s => s.key))
  const meals: FoodModel['meals'] = def.mealSlots.map(s => ({
    key: s.key, name: s.name, window: `${s.start}–${s.end}`, entries: entries.filter(e => e.slot === s.key).map(view),
  }))
  const other = entries.filter(e => !e.slot || !known.has(e.slot))
  if (other.length) meals.push({ key: '_other', name: 'Other', window: null, entries: other.map(view) })

  const model: FoodModel = {
    date,
    today,
    totals,
    targets,
    band: uncertaintyBand(totals.kcal),
    starchLeft: oneStarch ? mealsRemaining(def.mealSlots, time, entries.map(e => e.slot)).length : null,
    meals,
    slots: def.mealSlots.map(s => ({ key: s.key, name: s.name })),
    componentLabels: Object.fromEntries(def.components.map(c => [c.key, { name: c.name, unit: c.unit }])),
    recents: recentFoods(recentEntries, library, 8),
    log: { date, nowTime: logTime, slots: def.mealSlots, componentLabels: Object.fromEntries(def.components.map(c => [c.key, { name: c.name, unit: c.unit }])), eatingOut: def.eatingOut },
    relogSlot: suggestSlot(def.mealSlots, logTime)?.key ?? null,
    dayLines,
    activity: activity.status === 'ok' ? activity.props : null,
  }
  return <FoodView m={model} />
}
