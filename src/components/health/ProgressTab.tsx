import { createClient } from '@/lib/supabase/server'
import { loadCheckins, nowFor, sleepNightsOf, weighInsOf, type ActiveEnrolment } from '@/lib/health/healthServer'
import { formatDuration, sevenDayAverageSeries, sleepSummary, waterWeightNote, weightTrend } from '@/lib/health/checkin'
import { addDays } from '@/lib/health/time'
import LineChart from '@/components/portfolio/hub/LineChart'
import HealthNotice from './HealthNotice'
import { CARD, CARD_TITLE, fmtNum } from './ui'

const CHART_DAYS = 84

function fmtDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Progress (specs/029 §5, P1a scope): 7-day average weight trend, rate of loss, sleep. */
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
  const weighIns = weighInsOf(checkins)
  const series = sevenDayAverageSeries(weighIns, from, today)
  const firstIdx = series.findIndex(p => p.avg !== null)
  const shown = firstIdx >= 0 ? series.slice(firstIdx) : []
  const trend = weightTrend(weighIns, today)
  const sleep = sleepSummary(sleepNightsOf(checkins), today, enrolment.def)
  const preferred = enrolment.def.adjustment?.preferredLossKgPerWeek
  const startWeight = enrolment.profile?.weightKg ?? null
  const waterNote = waterWeightNote(enrolment.def, enrolment.startDate, today)

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD} aria-labelledby="wt-h">
        <h2 id="wt-h" className={CARD_TITLE}>Weight — 7-day average</h2>
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--ink-2)]">
          <span><span className="block text-xs text-[var(--ink-3)]">Average now</span><strong className="text-xl text-[var(--ink)]">{trend.average !== null ? `${fmtNum(trend.average)} kg` : '—'}</strong></span>
          <span><span className="block text-xs text-[var(--ink-3)]">Change / week</span><strong className="text-xl text-[var(--ink)]">{trend.weeklyChangeKg !== null ? `${trend.weeklyChangeKg > 0 ? '+' : ''}${fmtNum(trend.weeklyChangeKg, 2)} kg` : '—'}</strong>
            {trend.weeklyChangePct !== null && <span className="ml-1 text-xs">({fmtNum(trend.weeklyChangePct, 2)}% body weight)</span>}</span>
          {startWeight !== null && trend.average !== null && (
            <span><span className="block text-xs text-[var(--ink-3)]">Since start</span><strong className="text-xl text-[var(--ink)]">{fmtNum(trend.average - startWeight)} kg</strong></span>
          )}
        </div>
        <div className="text-[var(--blue-700)]">
          <LineChart
            values={shown.map(p => p.avg)}
            title="7-day average weight"
            description={`7-day average weight from ${shown[0] ? fmtDay(shown[0].date) : '—'} to ${fmtDay(today)}`}
            baseline={startWeight}
            startLabel={shown[0] ? fmtDay(shown[0].date) : undefined}
            endLabel={fmtDay(today)}
          />
        </div>
        {startWeight !== null && <p className="mt-1 text-xs text-[var(--ink-3)]">Dashed line: start weight {fmtNum(startWeight)} kg.</p>}
        {preferred && <p className="mt-2 text-xs text-[var(--ink-3)]">Programme range: lose {preferred[0]}–{preferred[1]} kg a week. Daily weight is mostly water — judge progress by the average.</p>}
        {waterNote && <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">{waterNote}</p>}
      </section>

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

      <p className="text-xs text-[var(--ink-3)]">Waist, photos, labs, adherence and milestones arrive in a later update.</p>
    </div>
  )
}
