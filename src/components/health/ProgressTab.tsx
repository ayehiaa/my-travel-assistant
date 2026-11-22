import { createClient } from '@/lib/supabase/server'
import { loadCheckins, nowFor, sleepNightsOf, weighInsOf, type ActiveEnrolment } from '@/lib/health/healthServer'
import { formatDuration, sevenDayAverageSeries, sleepSummary, waterWeightNote, weightTrend } from '@/lib/health/checkin'
import { addDays, weekStart } from '@/lib/health/time'
import { signedPhotoUrls } from '@/lib/health/healthPhotos'
import {
  loadHealthSettings, loadLabs, loadMilestoneKeys, loadProgressPhotos, loadWaist, loadWeeklyReviews, P2_MIGRATION_MESSAGE,
  P2MigrationNeeded, storeWeeklyReview,
} from '@/lib/health/p2Server'
import { buildWeeklyReview } from '@/lib/health/reviewServer'
import {
  labEscalations, milestoneViews, nonHdl, signed, waistBand, waistBands, waistDue, waistTrend,
} from '@/lib/health/measurements'
import { cmTo, kgTo, lipidTo, type Units } from '@/lib/health/units'
import type { WeeklyReview } from '@/lib/health/weeklyReview'
import LineChart from '@/components/portfolio/hub/LineChart'
import HealthNotice from './HealthNotice'
import WaistCard from './WaistCard'
import LabsCard from './LabsCard'
import MilestonesCard from './MilestonesCard'
import ProgressPhotos from './ProgressPhotos'
import { AdjustmentProposalView, loadAdjustmentState } from './AdjustmentSection'
import { CARD, CARD_TITLE, fmtNum } from './ui'

const CHART_DAYS = 84

function fmtDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Progress (specs/029 §5, P1a + P2): weight trend, adjustments, waist, labs, milestones, photos, weekly reviews, sleep. */
export default async function ProgressTab({ userId, enrolment }: { userId: string; enrolment: ActiveEnrolment }) {
  const supabase = await createClient()
  const today = nowFor(enrolment).date
  const from = addDays(today, -(CHART_DAYS - 1))
  let checkins: Awaited<ReturnType<typeof loadCheckins>>
  try {
    checkins = await loadCheckins(supabase, userId, addDays(from, -7), today)
  } catch (err) {
    return <HealthNotice title="Could not load progress">{err instanceof Error ? err.message : 'Try again shortly.'}</HealthNotice>
  }
  const { settings } = await loadHealthSettings(supabase, userId)
  const units = settings.units
  const w = (kg: number) => `${fmtNum(kgTo(kg, units.weight))} ${units.weight}`

  const weighIns = weighInsOf(checkins)
  const series = sevenDayAverageSeries(weighIns, from, today)
  const firstIdx = series.findIndex(p => p.avg !== null)
  const shown = firstIdx >= 0 ? series.slice(firstIdx) : []
  const trend = weightTrend(weighIns, today)
  const sleep = sleepSummary(sleepNightsOf(checkins), today, enrolment.def)
  const preferred = enrolment.def.adjustment?.preferredLossKgPerWeek
  const startWeight = enrolment.profile?.weightKg ?? null
  const waterNote = waterWeightNote(enrolment.def, enrolment.startDate, today)
  const adjustment = await loadAdjustmentState(supabase, userId, enrolment, today)

  return (
    <div className="flex flex-col gap-4">
      <AdjustmentProposalView enrolment={enrolment} proposal={adjustment.pending} showInsufficient />

      <section className={CARD} aria-labelledby="wt-h">
        <h2 id="wt-h" className={CARD_TITLE}>Weight — 7-day average</h2>
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--ink-2)]">
          <span><span className="block text-xs text-[var(--ink-3)]">Average now</span><strong className="text-xl text-[var(--ink)]">{trend.average !== null ? w(trend.average) : '—'}</strong></span>
          <span><span className="block text-xs text-[var(--ink-3)]">Change / week</span><strong className="text-xl text-[var(--ink)]">{trend.weeklyChangeKg !== null ? `${trend.weeklyChangeKg > 0 ? '+' : ''}${fmtNum(kgTo(trend.weeklyChangeKg, units.weight), 2)} ${units.weight}` : '—'}</strong>
            {trend.weeklyChangePct !== null && <span className="ml-1 text-xs">({fmtNum(trend.weeklyChangePct, 2)}% body weight)</span>}</span>
          {startWeight !== null && trend.average !== null && (
            <span><span className="block text-xs text-[var(--ink-3)]">Since start</span><strong className="text-xl text-[var(--ink)]">{fmtNum(kgTo(trend.average - startWeight, units.weight))} {units.weight}</strong></span>
          )}
        </div>
        <div className="text-[var(--blue-700)]">
          <LineChart
            values={shown.map(p => (p.avg === null ? null : kgTo(p.avg, units.weight)))}
            title="7-day average weight"
            description={`7-day average weight from ${shown[0] ? fmtDay(shown[0].date) : '—'} to ${fmtDay(today)}`}
            baseline={startWeight === null ? null : kgTo(startWeight, units.weight)}
            startLabel={shown[0] ? fmtDay(shown[0].date) : undefined}
            endLabel={fmtDay(today)}
          />
        </div>
        {startWeight !== null && <p className="mt-1 text-xs text-[var(--ink-3)]">Dashed line: start weight {w(startWeight)}.</p>}
        {preferred && <p className="mt-2 text-xs text-[var(--ink-3)]">Programme range: lose {preferred[0]}–{preferred[1]} kg a week. Daily weight is mostly water — judge progress by the average.</p>}
        {waterNote && <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">{waterNote}</p>}
        {adjustment.history.length > 0 && (
          <div className="mt-3 border-t border-[var(--rule-soft)] pt-2">
            <h3 className="text-xs font-bold uppercase text-[var(--ink-3)]">Adjustment history</h3>
            <ul className="mt-1 flex list-none flex-col gap-1 p-0 text-sm text-[var(--ink-2)]">
              {adjustment.history.map(h => (
                <li key={h.id}>
                  Fortnight to {fmtDay(h.periodEnd)}: <strong className="text-[var(--ink)]">{h.status === 'accepted' ? (h.kcalChange !== 0 ? `${h.kcalChange > 0 ? '+' : '−'}${Math.abs(h.kcalChange)} kcal accepted` : 'no change') : 'declined'}</strong>
                  {h.after && h.status === 'accepted' && h.kcalChange !== 0 && <> → {h.after.kcal} kcal</>}
                  <span className="block text-xs text-[var(--ink-3)]">{h.reasoning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <P2Sections userId={userId} enrolment={enrolment} today={today} units={units} weighIns={weighIns} />

      <section className={CARD} aria-labelledby="sl-h">
        <h2 id="sl-h" className={CARD_TITLE}>Sleep — last 7 nights</h2>
        {sleep.nights === 0 ? <p className="text-sm text-[var(--ink-3)]">Add bed and wake times in the morning check-in.</p> : (
          <p className="text-sm text-[var(--ink-2)]">
            Average <strong className="text-[var(--ink)]">{formatDuration(sleep.averageMinutes)}</strong>
            {sleep.durationOk !== null && <span className={sleep.durationOk ? 'text-green-700' : 'text-amber-700'}> ({sleep.durationOk ? 'in range' : 'outside the programme range'})</span>}
            {' '}· typical {sleep.typicalBedTime}–{sleep.typicalWakeTime} · {sleep.consistentNights}/{sleep.nights} nights within ±{sleep.windowMinutes} min
          </p>
        )}
      </section>
    </div>
  )
}

/** Waist, labs, milestones, photos and weekly reviews — need the P2 tables ("needs a database update" otherwise). */
async function P2Sections({ userId, enrolment, today, units, weighIns }: {
  userId: string; enrolment: ActiveEnrolment; today: string; units: Units; weighIns: ReturnType<typeof weighInsOf>
}) {
  const supabase = await createClient()
  const def = enrolment.def
  let waist: Awaited<ReturnType<typeof loadWaist>>
  let labs: Awaited<ReturnType<typeof loadLabs>>
  let photos: Awaited<ReturnType<typeof loadProgressPhotos>>
  let done: Set<string>
  let reviews: WeeklyReview[]
  try {
    ;[waist, labs, photos, done, reviews] = await Promise.all([
      loadWaist(supabase, userId),
      loadLabs(supabase, userId),
      loadProgressPhotos(supabase, userId),
      loadMilestoneKeys(supabase, userId, enrolment.id),
      loadWeeklyReviews(supabase, userId),
    ])
  } catch (err) {
    if (err instanceof P2MigrationNeeded) {
      return <HealthNotice title="Waist, labs, milestones and reviews need a database update">{P2_MIGRATION_MESSAGE.replace('This needs a database update — apply', 'The owner must apply')}.</HealthNotice>
    }
    return <HealthNotice title="Could not load measurements">Try again shortly.</HealthNotice>
  }

  // Weekly reviews: this week so far (live) + store last week's if it is missing (best effort).
  const thisWeek = weekStart(today)
  const lastWeek = addDays(thisWeek, -7)
  const [current, previous] = await Promise.all([
    buildWeeklyReview(supabase, userId, enrolment, thisWeek, today).catch(() => null),
    lastWeek >= weekStart(enrolment.startDate) && !reviews.some(r => r.weekStart === lastWeek)
      ? buildWeeklyReview(supabase, userId, enrolment, lastWeek, today).catch(() => null)
      : Promise.resolve(null),
  ])
  if (previous) {
    await storeWeeklyReview(supabase, userId, previous)
    reviews = [previous, ...reviews].sort((a, b) => b.weekStart.localeCompare(a.weekStart))
  }
  const pastReviews = reviews.filter(r => r.weekStart !== thisWeek)

  const sex = enrolment.profile?.sex
  const bands = waistBands(sex)
  const wt = waistTrend(waist)
  const len = units.length
  const urls = await signedPhotoUrls(photos.map(p => p.path))
  const views = milestoneViews(def, { startDate: enrolment.startDate, today, startWeightKg: enrolment.profile?.weightKg ?? null, weighIns, waist, doneKeys: done })
  const lip = (v: number | null, kind: 'chol' | 'tg' = 'chol') => (v === null ? null : lipidTo(v, units.lipids, kind))
  const escalations = labEscalations(def, enrolment.startDate, labs)

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <WaistCard
          today={today}
          unit={len}
          rows={waist.map(r => ({ id: r.id, date: r.date, display: cmTo(r.cm, len), band: waistBand(r.cm, sex) }))}
          due={waistDue(wt.latest?.date ?? null, today)}
          bandsText={`Risk bands: above ${cmTo(bands.raised, len)} ${len} raised, above ${cmTo(bands.high, len)} ${len} high.`}
          changeText={wt.changeCm !== null ? signed(cmTo(wt.changeCm, len), len) : null}
        />
        <LabsCard
          today={today}
          unit={units.lipids}
          rows={labs.map(l => ({ id: l.id ?? l.date, date: l.date, total: lip(l.totalMmol), ldl: lip(l.ldlMmol), hdl: lip(l.hdlMmol), tg: lip(l.tgMmol, 'tg'), nonHdl: lip(nonHdl(l)) }))}
          expectations={def.outcomes?.expectations ?? []}
          escalations={escalations.map(e => `${e.metric} ${e.value} ${e.unit} on ${e.date} (above ${e.threshold}): ${e.note}`)}
        />
      </div>

      {views.length > 0 && (
        <MilestonesCard items={views.map(v => ({
          week: v.week,
          dates: `${fmtDay(v.start)} – ${fmtDay(v.end)}`,
          state: v.state,
          tasks: v.tasks,
          expected: v.expected,
          actual: [
            ...(v.actual.weightChangeKg !== null ? [`weight ${signed(kgTo(v.actual.weightChangeKg, units.weight), units.weight)} (7-day average vs start)`] : []),
            ...(v.actual.waistChangeCm !== null ? [`waist ${signed(cmTo(v.actual.waistChangeCm, len), len)}`] : []),
          ],
        }))} />
      )}

      <ProgressPhotos today={today} photos={photos.map(p => ({ id: p.id, date: p.date, url: urls[p.path] ?? null }))} />

      <section className={CARD} aria-labelledby="rev-h">
        <h2 id="rev-h" className={CARD_TITLE}>Weekly reviews</h2>
        {current && <ReviewBlock review={current} title={`This week so far (${current.daysCounted} of 7 days)`} units={units} />}
        {pastReviews.length === 0 && <p className="mt-2 text-sm text-[var(--ink-3)]">Your first full weekly review appears after your first Sunday.</p>}
        {pastReviews.map(r => (
          <details key={r.weekStart} className="mt-3 border-t border-[var(--rule-soft)] pt-2">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--ink)]">Week of {fmtDay(r.weekStart)} — {r.focus[0] ?? ''}</summary>
            <ReviewBlock review={r} units={units} />
          </details>
        ))}
      </section>
    </>
  )
}

function ReviewBlock({ review: r, title, units }: { review: WeeklyReview; title?: string; units: Units }) {
  const n = r.daysCounted
  return (
    <div className="mt-2 text-sm text-[var(--ink-2)]">
      {title && <h3 className="mb-1 text-sm font-bold text-[var(--ink)]">{title}</h3>}
      <ul className="m-0 grid list-none gap-x-6 gap-y-1 p-0 sm:grid-cols-2">
        {r.components.map(c => (
          <li key={c.key}>{c.name}: <strong className="text-[var(--ink)]">{c.period === 'day' ? `${c.value}/${c.of} days` : `${c.value} of ${c.of} this week`}</strong></li>
        ))}
        <li>Protein on target: <strong className="text-[var(--ink)]">{r.proteinDays}/{n} days</strong></li>
        <li>Sat fat ≤ target / ≤ ceiling: <strong className="text-[var(--ink)]">{r.satFatWithinTargetDays} / {r.satFatWithinCeilingDays} of {r.daysLogged} logged days</strong></li>
        <li>Sessions: <strong className="text-[var(--ink)]">{r.sessions.done} done{r.sessions.partial ? ` + ${r.sessions.partial} partial` : ''} of {r.sessions.planned}</strong></li>
        <li>Cardio: <strong className="text-[var(--ink)]">{r.cardio.minutes}{r.cardio.target !== null ? ` / ${r.cardio.target}` : ''} min</strong></li>
        <li>Steps: <strong className="text-[var(--ink)]">{r.steps.average !== null ? `${r.steps.average.toLocaleString('en-GB')} avg (${r.steps.daysLogged} days)` : 'not logged'}</strong></li>
        <li>Sleep: <strong className="text-[var(--ink)]">{r.sleep.averageMinutes !== null ? `${formatDuration(r.sleep.averageMinutes)} avg · ${r.sleep.consistentNights}/${r.sleep.nights} consistent` : 'not logged'}</strong></li>
        <li>Weight: <strong className="text-[var(--ink)]">{r.weight.average !== null ? `${fmtNum(kgTo(r.weight.average, units.weight))} ${units.weight}` : '—'}{r.weight.changeKg !== null ? ` (${signed(kgTo(r.weight.changeKg, units.weight), units.weight)})` : ''}</strong></li>
        <li>Waist: <strong className="text-[var(--ink)]">{r.waist.latestCm !== null ? `${cmTo(r.waist.latestCm, units.length)} ${units.length}` : '—'}{r.waist.changeCm !== null ? ` (${signed(cmTo(r.waist.changeCm, units.length), units.length)})` : ''}</strong></li>
      </ul>
      <h4 className="mt-2 text-xs font-bold uppercase text-[var(--ink-3)]">Focus next week</h4>
      <ol className="mt-1 list-decimal pl-5 text-[var(--ink)]">{r.focus.map(f => <li key={f}>{f}</li>)}</ol>
    </div>
  )
}
