import type { ActiveEnrolment, ServerClient } from './healthServer'
import { loadCheckins, loadEntries, sleepNightsOf, weighInsOf } from './healthServer'
import { loadWorkouts } from './trainingServer'
import { loadCardio, loadSteps, loadWaist } from './p2Server'
import { computeWeeklyReview, type WeeklyReview } from './weeklyReview'
import { addDays, daysBetween } from './time'

/**
 * Server-only: build a weekly review from stored data (specs/029 US10). Each optional source (training, cardio,
 * steps, waist) is best effort, so a review still works when a later phase's tables are missing.
 */
export async function buildWeeklyReview(
  supabase: ServerClient,
  userId: string,
  enrolment: ActiveEnrolment,
  weekStart: string,
  today: string,
): Promise<WeeklyReview> {
  const weekEnd = addDays(weekStart, 6)
  const last = today < weekEnd ? today : weekEnd
  const daysElapsed = Math.max(1, Math.min(7, daysBetween(weekStart, last) + 1))
  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p } catch { return fallback } }
  const [entries, checkins, workouts, cardio, steps, waist] = await Promise.all([
    loadEntries(supabase, userId, weekStart, last),
    loadCheckins(supabase, userId, addDays(weekStart, -14), last),
    safe(loadWorkouts(supabase, userId, weekStart, weekEnd), []),
    safe(loadCardio(supabase, userId, weekStart, weekEnd), []),
    safe(loadSteps(supabase, userId, weekStart, weekEnd), []),
    safe(loadWaist(supabase, userId), []),
  ])
  return computeWeeklyReview({
    def: enrolment.def,
    targets: enrolment.targets,
    weekStart,
    daysElapsed,
    food: entries.map(e => ({ date: e.date, items: e.items })),
    workouts: workouts.map(w => ({ date: w.date, status: w.status })),
    cardio,
    steps,
    sleep: sleepNightsOf(checkins),
    weighIns: weighInsOf(checkins),
    waist,
  })
}
