import { createClient } from '@/lib/supabase/server'
import {
  evaluateDay, loadCheckins, loadLibrary, nowFor, sleepNightsOf, weighInsOf, type ActiveEnrolment,
} from '@/lib/health/healthServer'
import { rankRecommendations } from '@/lib/health/rules'
import { componentProgress, suggestSlot, sumComponents, sumNutrients } from '@/lib/health/nutrition'
import { sleepSummary } from '@/lib/health/checkin'
import { addDays, programmeWeek, programmeWeekLabel, weekdayOf } from '@/lib/health/time'
import { healthHref } from '@/lib/health/healthHub'
import { loadTrainingContext, type TrainingContextResult } from '@/lib/health/trainingServer'
import { nextMorningDue } from '@/lib/health/painRules'
import { loadHealthSettings, loadMilestoneKeys, loadTripRanges, loadWaist } from '@/lib/health/p2Server'
import { tripOn } from '@/lib/health/travel'
import { applyKcalChange, midpointReviewDue } from '@/lib/health/adjustment'
import { milestoneDue, milestoneViews, waistDue } from '@/lib/health/measurements'
import { itemFromLibrary } from '@/lib/health/foodLibrary'
import { componentChip, foodsForComponent, shortLabel, weekChip } from '@/lib/health/lifestyleUi'
import { loadActivityProps } from './ActivitySection'
import { loadAdjustmentState } from './AdjustmentSection'
import HealthNotice from './HealthNotice'
import TodayView, { type TodayModel } from './TodayView'
import { fmtNum } from './ui'

/** Today (specs/029 US4, redesigned in specs/032): loads the day and renders the one-glance view. */
export default async function TodayTab({ userId, enrolment, editCheckin = false }: { userId: string; enrolment: ActiveEnrolment; editCheckin?: boolean }) {
  const supabase = await createClient()
  const { date, time } = nowFor(enrolment)
  const { def, targets } = enrolment

  let evaluation: Awaited<ReturnType<typeof evaluateDay>>
  let recentCheckins: Awaited<ReturnType<typeof loadCheckins>>
  let training: TrainingContextResult
  let trips: Awaited<ReturnType<typeof loadTripRanges>>
  let adjustment: Awaited<ReturnType<typeof loadAdjustmentState>>
  let hs: Awaited<ReturnType<typeof loadHealthSettings>>
  let library: Awaited<ReturnType<typeof loadLibrary>>
  try {
    ;[evaluation, recentCheckins, training, trips, adjustment, hs, library] = await Promise.all([
      evaluateDay(supabase, userId, enrolment, date, time),
      loadCheckins(supabase, userId, addDays(date, -20), date),
      loadTrainingContext(supabase, userId, enrolment),
      loadTripRanges(supabase, userId, enrolment),
      loadAdjustmentState(supabase, userId, enrolment, date),
      loadHealthSettings(supabase, userId),
      loadLibrary(supabase, userId, 100),
    ])
  } catch (err) {
    return <HealthNotice title="Could not load today">{err instanceof Error ? err.message : 'Try again shortly.'}</HealthNotice>
  }

  const { entries, weekEntries, findings } = evaluation
  const items = entries.flatMap(e => e.items)
  const totals = sumNutrients(items)
  const progress = componentProgress(def, sumComponents(items), sumComponents(weekEntries.flatMap(e => e.items)), { startDate: enrolment.startDate, date })
  const recs = rankRecommendations(findings)
  const todayCheckin = recentCheckins.find(c => c.date === date) ?? null
  const sleep = sleepSummary(sleepNightsOf(recentCheckins), date, def)
  const week = programmeWeek(enrolment.startDate, date)
  const scheduled = def.weeklySchedule?.days.find(d => d.day === weekdayOf(date)) ?? null
  const tctx = training.status === 'ok' ? training.ctx : null
  const morningDue = tctx && def.painRules ? nextMorningDue(def.painRules, tctx.checks, date) : null
  const sessionNameOf = (k: string) => def.trainingSessions.find(t => t.key === k)?.name ?? k.toUpperCase()
  const trainedToday = tctx?.weekWorkouts.filter(w => w.date === date) ?? []
  const trip = tripOn(trips, date)
  const midpoint = midpointReviewDue(def, enrolment.startDate, date)

  // Waist reminder + milestone due (best effort: hidden when the P2 tables are missing).
  const notices: TodayModel['notices'] = []
  const progressHref = healthHref({ tab: 'progress' })
  if (midpoint) notices.push({ key: 'mid', text: `Week ${midpoint.week} review due`, href: progressHref })
  if (adjustment.available) {
    try {
      const [waist, done] = await Promise.all([loadWaist(supabase, userId), loadMilestoneKeys(supabase, userId, enrolment.id)])
      const last = waist[waist.length - 1]?.date ?? null
      if (waistDue(last, date) && week !== null) notices.push({ key: 'waist', text: 'Waist measurement due', href: progressHref })
      const milestone = milestoneDue(milestoneViews(def, {
        startDate: enrolment.startDate, today: date, startWeightKg: enrolment.profile?.weightKg ?? null,
        weighIns: weighInsOf(recentCheckins), waist, doneKeys: done,
      }))
      if (milestone) notices.push({ key: 'ms', text: `Week ${milestone.week}: ${milestone.tasks.filter(t => !t.done).map(t => t.task).join(' · ')}`, href: progressHref })
    } catch {
      // not available
    }
  }

  const activity = await loadActivityProps({ userId, enrolment, date, painPassed: tctx?.painPassed ?? null, checks: tctx?.checks ?? [] })
  const act = activity.status === 'ok' && !activity.props.migrationNeeded ? activity.props : null

  // Session row: done today → status; recommended → Start; otherwise the plain reason (rest / cardio day).
  let session: TodayModel['session'] = null
  if (tctx) {
    const done = trainedToday[0]
    const key = done?.sessionKey ?? tctx.recommendation.sessionKey
    const s = key ? def.trainingSessions.find(t => t.key === key) : null
    session = {
      label: s ? `${s.name} · ${s.focus}` : scheduled?.kind === 'session' ? shortLabel(scheduled.label) : 'Strength',
      status: done ? done.status : key ? 'todo' : 'none',
      href: key ? healthHref({ tab: 'train', session: key, travel: trip ? 1 : null }) : null,
      note: key ? null : tctx.recommendation.reason,
      warnings: done ? [] : tctx.recommendation.warnings,
    }
    if (!done && !key && scheduled?.kind !== 'session' && scheduled?.kind) session = null
  }

  const componentByKey = new Map(def.components.map(c => [c.key, c]))
  const slot = suggestSlot(def.mealSlots, time)?.key ?? null
  const unitText = (v: number, unit: string) => (unit === 'servings' ? `${fmtNum(v)} serving${v === 1 ? '' : 's'}` : `${fmtNum(v)} ${unit}`)

  const model: TodayModel = {
    date,
    time,
    weekChip: weekChip(enrolment.startDate, date, def.identity.durationWeeks),
    weekDetail: programmeWeekLabel(enrolment.startDate, date, def.identity.durationWeeks),
    dayLabel: scheduled ? shortLabel(scheduled.label) : null,
    kcal: { eaten: totals.kcal, target: targets.kcal },
    protein: { value: totals.proteinG, target: targets.proteinG },
    satFat: { value: totals.satFatG, target: targets.satFatTargetG, ceiling: targets.satFatCeilingG },
    chips: progress.map(c => ({
      ...componentChip(c),
      sources: componentByKey.get(c.key)?.sources ?? [],
      suggestions: foodsForComponent(library, c.key).map(({ food, amount }) => {
        const item = itemFromLibrary(food)
        return { id: food.id, name: food.name, amount: unitText(amount, c.unit), kcal: item.kcal, items: [item] }
      }),
    })),
    slot,
    checkin: {
      date,
      supplements: def.supplements.map(s => ({ key: s.key, name: s.name, dose: s.dose })),
      existing: todayCheckin,
      typicalBed: sleep.typicalBedTime,
      typicalWake: sleep.typicalWakeTime,
      weightUnit: hs.settings.units.weight,
      startEditing: editCheckin,
    },
    morningCheck: morningDue?.id && def.painRules ? {
      checkId: morningDue.id,
      sessionName: sessionNameOf(morningDue.sessionKey),
      sessionDate: morningDue.date,
      duringPain: morningDue.duringPain,
      threshold: def.painRules.okThreshold,
      redFlags: def.painRules.redFlags,
    } : null,
    adjustment: adjustment.pending?.status === 'proposal' ? (() => {
      const p = adjustment.pending
      const next = applyKcalChange(enrolment.targets, p.kcalChange, { sex: enrolment.profile?.sex, minKcal: def.energy?.minKcal })
      return {
        periodEnd: p.period.end, kcalChange: p.kcalChange, reasoning: p.reasoning, caveat: p.caveat,
        currentKcal: targets.kcal, newKcal: next.kcal, currentCarbsG: targets.carbsG, newCarbsG: next.carbsG,
      }
    })() : null,
    notices,
    jointStop: tctx?.joint.level === 'stop' ? tctx.joint.message : null,
    recs: recs.map(r => ({ key: r.key, message: r.message, group: r.group })),
    session,
    cardio: act && def.cardio ? {
      label: `${def.cardio.intensity?.zone ?? 'Cardio'} · ${def.cardio.minutes} min`,
      todayMinutes: act.sessions.reduce((n, s) => n + s.minutes, 0),
      weekMinutes: act.weekly.minutes,
      weekTarget: act.weekly.target,
    } : null,
    steps: act && def.dailyMovement ? {
      value: act.steps,
      target: act.stepsTarget,
      tone: act.stepsStatus === 'in_range' || act.stepsStatus === 'above' ? 'good' : 'neutral',
    } : null,
    activity: act,
    trip: trip ? {
      label: trip.label, start: trip.start, end: trip.end, eatingOut: def.eatingOut,
      dates: Array.from({ length: Math.min(60, Math.max(1, Math.round((Date.parse(trip.end) - Date.parse(trip.start)) / 86_400_000) + 1)) }, (_, i) => addDays(trip.start, i)),
      currentTz: enrolment.timezone, homeTz: enrolment.homeTimezone,
    } : null,
  }
  return <TodayView m={model} />
}
