import { createClient } from '@/lib/supabase/server'
import { loadCheckins, nowFor, sleepNightsOf, weighInsOf, type ActiveEnrolment } from '@/lib/health/healthServer'
import { formatDuration, sevenDayAverageSeries, sleepSummary, waterWeightNote, weightTrend } from '@/lib/health/checkin'
import { addDays, programmeWeekLabel, weekStart } from '@/lib/health/time'
import { signedPhotoUrls } from '@/lib/health/healthPhotos'
import {
  loadHealthSettings, loadLabs, loadMilestoneKeys, loadProgressPhotos, loadWaist, loadWeeklyReviews, P2_MIGRATION_MESSAGE,
  P2MigrationNeeded, storeWeeklyReview,
} from '@/lib/health/p2Server'
import { buildWeeklyReview } from '@/lib/health/reviewServer'
import { labEscalations, milestoneViews, nonHdl, signed, waistBand, waistBands, waistDue, waistTrend } from '@/lib/health/measurements'
import { cmTo, kgTo, lipidTo } from '@/lib/health/units'
import { applyKcalChange } from '@/lib/health/adjustment'
import { adherenceTone, foodGoalAdherence } from '@/lib/health/lifestyleUi'
import type { WeeklyReview } from '@/lib/health/weeklyReview'
import HealthNotice from './HealthNotice'
import { loadAdjustmentState } from './AdjustmentSection'
import ProgressView, { type ProgressModel } from './ProgressView'
import { fmtNum } from './ui'

function fmtDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Progress (specs/029 §5 + P2, redesigned in specs/032): loads the data and renders the summary-first view. */
export default async function ProgressTab({ userId, enrolment }: { userId: string; enrolment: ActiveEnrolment }) {
  const supabase = await createClient()
  const today = nowFor(enrolment).date
  const def = enrolment.def
  // "All" = since the programme start (at most a year), never less than 3 months.
  const startFrom = addDays(enrolment.startDate, -14)
  const yearAgo = addDays(today, -364)
  const from = [startFrom > yearAgo ? startFrom : yearAgo, addDays(today, -90)].sort()[0]
  let checkins: Awaited<ReturnType<typeof loadCheckins>>
  try {
    checkins = await loadCheckins(supabase, userId, addDays(from, -7), today)
  } catch (err) {
    return <HealthNotice title="Could not load progress">{err instanceof Error ? err.message : 'Try again shortly.'}</HealthNotice>
  }
  const { settings } = await loadHealthSettings(supabase, userId)
  const units = settings.units
  const wu = units.weight
  const len = units.length

  const weighIns = weighInsOf(checkins)
  const series = sevenDayAverageSeries(weighIns, from, today)
  const firstIdx = series.findIndex(p => p.avg !== null)
  const daily = new Map(weighIns.map(w => [w.date, w.weightKg]))
  const trend = weightTrend(weighIns, today)
  const sleep = sleepSummary(sleepNightsOf(checkins), today, def)
  const preferred = def.adjustment?.preferredLossKgPerWeek
  const startWeight = enrolment.profile?.weightKg ?? null
  const waterNote = waterWeightNote(def, enrolment.startDate, today)
  const adjustment = await loadAdjustmentState(supabase, userId, enrolment, today)

  // Waist, labs, milestones, photos, weekly reviews (P2 tables; a notice when missing).
  let p2: { waist: Awaited<ReturnType<typeof loadWaist>>; labs: Awaited<ReturnType<typeof loadLabs>>; photos: Awaited<ReturnType<typeof loadProgressPhotos>>; done: Set<string>; reviews: WeeklyReview[] } | null = null
  let p2Notice: string | null = null
  try {
    const [waist, labs, photos, done, reviews] = await Promise.all([
      loadWaist(supabase, userId), loadLabs(supabase, userId), loadProgressPhotos(supabase, userId),
      loadMilestoneKeys(supabase, userId, enrolment.id), loadWeeklyReviews(supabase, userId),
    ])
    p2 = { waist, labs, photos, done, reviews }
  } catch (err) {
    p2Notice = err instanceof P2MigrationNeeded
      ? `${P2_MIGRATION_MESSAGE.replace('This needs a database update — apply', 'The owner must apply')} for waist, labs, milestones and reviews.`
      : 'Could not load measurements — try again shortly.'
  }

  // Weekly reviews: this week so far (live) + store last week's if it is missing (best effort).
  let current: WeeklyReview | null = null
  let past: WeeklyReview[] = []
  if (p2) {
    const thisWeek = weekStart(today)
    const lastWeek = addDays(thisWeek, -7)
    const [cur, previous] = await Promise.all([
      buildWeeklyReview(supabase, userId, enrolment, thisWeek, today).catch(() => null),
      lastWeek >= weekStart(enrolment.startDate) && !p2.reviews.some(r => r.weekStart === lastWeek)
        ? buildWeeklyReview(supabase, userId, enrolment, lastWeek, today).catch(() => null)
        : Promise.resolve(null),
    ])
    current = cur
    let reviews = p2.reviews
    if (previous) {
      await storeWeeklyReview(supabase, userId, previous)
      reviews = [previous, ...reviews].sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    }
    past = reviews.filter(r => r.weekStart !== thisWeek)
  }

  const w = (kg: number) => `${fmtNum(kgTo(kg, wu))} ${wu}`
  const tiles: ProgressModel['tiles'] = [
    {
      key: 'weight', label: 'Weight (7-day)', value: trend.average !== null ? w(trend.average) : '—',
      sub: trend.weeklyChangeKg !== null ? `${trend.weeklyChangeKg > 0 ? '↑' : trend.weeklyChangeKg < 0 ? '↓' : '→'} ${fmtNum(kgTo(Math.abs(trend.weeklyChangeKg), wu), 2)} ${wu}/wk` : 'needs 3 weigh-ins',
    },
  ]
  const wt = p2 ? waistTrend(p2.waist) : null
  if (wt) tiles.push({ key: 'waist', label: 'Waist', value: wt.latest ? `${cmTo(wt.latest.cm, len)} ${len}` : '—', sub: wt.changeCm !== null ? `${signed(cmTo(wt.changeCm, len), len)} since first` : null })
  if (current) {
    const fg = foodGoalAdherence(current.components)
    if (fg) tiles.push({ key: 'food', label: 'Food goals', value: `${fg.pct}%`, tone: fg.tone, status: fg.tone === 'good' ? 'On track' : fg.tone === 'close' ? 'Close' : 'Behind' })
    const s = current.sessions
    const sTone = adherenceTone(s.done, s.planned || null)
    tiles.push({ key: 'train', label: 'Training', value: `${s.done}/${s.planned}`, sub: s.partial ? `+${s.partial} partial` : null, tone: sTone, status: sTone === 'good' ? 'Done' : null })
    const cTone = adherenceTone(current.cardio.minutes, current.cardio.target)
    tiles.push({ key: 'cardio', label: 'Cardio', value: `${current.cardio.minutes} min`, sub: current.cardio.target !== null ? `of ${current.cardio.target}` : null, tone: cTone, status: cTone === 'good' ? 'Done' : null })
    const stepsMin = def.dailyMovement?.stepsMin ?? null
    const stTone = current.steps.average !== null ? adherenceTone(current.steps.average, stepsMin) : 'neutral'
    tiles.push({ key: 'steps', label: 'Steps (avg)', value: current.steps.average !== null ? current.steps.average.toLocaleString('en-GB') : '—', sub: stepsMin ? `goal ${stepsMin.toLocaleString('en-GB')}` : null, tone: stTone, status: stTone === 'good' ? 'On track' : null })
    tiles.push({ key: 'protein', label: 'Protein days', value: `${current.proteinDays}/${current.daysCounted}`, tone: adherenceTone(current.proteinDays, current.daysCounted || null) })
  }
  tiles.push({
    key: 'sleep', label: 'Sleep (avg)', value: sleep.nights ? formatDuration(sleep.averageMinutes) : '—',
    sub: sleep.nights ? `${sleep.typicalBedTime ?? ''}–${sleep.typicalWakeTime ?? ''} · ${sleep.consistentNights}/${sleep.nights} steady` : 'add in check-in',
    tone: sleep.durationOk === null ? 'neutral' : sleep.durationOk ? 'good' : 'close',
    status: sleep.durationOk === null ? null : sleep.durationOk ? 'In range' : 'Outside range',
  })

  const sex = enrolment.profile?.sex
  const bands = waistBands(sex)
  const lip = (v: number | null, kind: 'chol' | 'tg' = 'chol') => (v === null ? null : lipidTo(v, units.lipids, kind))
  const urls = p2 ? await signedPhotoUrls(p2.photos.map(p => p.path)) : {}
  const views = p2 ? milestoneViews(def, { startDate: enrolment.startDate, today, startWeightKg: startWeight, weighIns, waist: p2.waist, doneKeys: p2.done }) : []
  const pending = adjustment.pending

  const model: ProgressModel = {
    today,
    units,
    weekTitle: current ? `${current.label ?? 'This week'} · ${current.daysCounted} of ${current.windowDays ?? 7} days` : (programmeWeekLabel(enrolment.startDate, today, def.identity.durationWeeks) ?? 'This week'),
    tiles,
    adjustment: pending?.status === 'proposal' ? (() => {
      const next = applyKcalChange(enrolment.targets, pending.kcalChange, { sex, minKcal: def.energy?.minKcal })
      return {
        periodEnd: pending.period.end, kcalChange: pending.kcalChange, reasoning: pending.reasoning, caveat: pending.caveat,
        currentKcal: enrolment.targets.kcal, newKcal: next.kcal, currentCarbsG: enrolment.targets.carbsG, newCarbsG: next.carbsG,
      }
    })() : null,
    adjustmentNote: pending && pending.status !== 'proposal' ? pending.reasoning : null,
    weight: {
      points: (firstIdx >= 0 ? series.slice(firstIdx) : []).map(p => ({
        date: p.date,
        line: p.avg === null ? null : kgTo(p.avg, wu),
        dot: daily.has(p.date) ? kgTo(daily.get(p.date)!, wu) : null,
      })),
      baseline: startWeight === null ? null : kgTo(startWeight, wu),
      unit: wu,
      info: [
        ...(trend.weeklyChangePct !== null ? [`${fmtNum(trend.weeklyChangePct, 2)}% of body weight a week.`] : []),
        ...(startWeight !== null && trend.average !== null ? [`Since start: ${signed(Math.round(kgTo(trend.average - startWeight, wu) * 10) / 10, wu)} (start ${w(startWeight)}).`] : []),
        ...(preferred ? [`Programme range: lose ${preferred[0]}–${preferred[1]} kg a week.`] : []),
        'Daily weight is mostly water — watch the average.',
        ...(waterNote ? [waterNote] : []),
      ],
      history: adjustment.history.map(h => ({
        id: h.id,
        text: `${fmtDay(h.periodEnd)}: ${h.status === 'accepted' ? (h.kcalChange !== 0 ? `${h.kcalChange > 0 ? '+' : '−'}${Math.abs(h.kcalChange)} kcal${h.after ? ` → ${h.after.kcal}` : ''}` : 'no change') : 'declined'}`,
        reasoning: h.reasoning,
      })),
    },
    p2Notice,
    waist: p2 ? {
      points: [...p2.waist].sort((a, b) => a.date.localeCompare(b.date)).map(r => ({ date: r.date, line: cmTo(r.cm, len), dot: cmTo(r.cm, len) })),
      card: {
        today, unit: len,
        rows: p2.waist.map(r => ({ id: r.id, date: r.date, display: cmTo(r.cm, len), band: waistBand(r.cm, sex) })),
        due: waistDue(wt?.latest?.date ?? null, today),
        bandsText: `Raised above ${cmTo(bands.raised, len)} ${len}, high above ${cmTo(bands.high, len)} ${len}.`,
        changeText: wt?.changeCm != null ? signed(cmTo(wt.changeCm, len), len) : null,
      },
    } : null,
    labs: p2 ? {
      today, unit: units.lipids,
      rows: p2.labs.map(l => ({ id: l.id ?? l.date, date: l.date, total: lip(l.totalMmol), ldl: lip(l.ldlMmol), hdl: lip(l.hdlMmol), tg: lip(l.tgMmol, 'tg'), nonHdl: lip(nonHdl(l)) })),
      expectations: def.outcomes?.expectations ?? [],
      escalations: labEscalations(def, enrolment.startDate, p2.labs).map(e => `${e.metric} ${e.value} ${e.unit} on ${e.date} (above ${e.threshold}): ${e.note}`),
    } : null,
    milestones: p2 && views.length > 0 ? views.map(v => ({
      week: v.week,
      dates: `${fmtDay(v.start)} – ${fmtDay(v.end)}`,
      state: v.state,
      tasks: v.tasks,
      expected: v.expected,
      actual: [
        ...(v.actual.weightChangeKg !== null ? [`weight ${signed(kgTo(v.actual.weightChangeKg, wu), wu)}`] : []),
        ...(v.actual.waistChangeCm !== null ? [`waist ${signed(cmTo(v.actual.waistChangeCm, len), len)}`] : []),
      ],
    })) : null,
    photos: p2 ? { today, photos: p2.photos.map(p => ({ id: p.id, date: p.date, url: urls[p.path] ?? null })) } : null,
    reviews: p2 ? { current, past } : null,
  }
  return <ProgressView m={model} />
}
