import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  evaluateDay, loadCheckins, nowFor, sleepNightsOf, weighInsOf, type ActiveEnrolment,
} from '@/lib/health/healthServer'
import { rankRecommendations, type RecommendationGroup } from '@/lib/health/rules'
import {
  componentProgress, mealsRemaining, progressRatio, remainingBudget, sumComponents, sumNutrients, uncertaintyBand,
} from '@/lib/health/nutrition'
import { formatDuration, sleepSummary, waterWeightNote, weightTrend } from '@/lib/health/checkin'
import { addDays, programmeWeek, weekdayOf } from '@/lib/health/time'
import { healthHref } from '@/lib/health/healthHub'
import CheckinCard from './CheckinCard'
import QuickLog from './QuickLog'
import HealthNotice from './HealthNotice'
import { CARD, CARD_TITLE, fmtNum } from './ui'

function Bar({ label, value, target, unit, ceiling, lowerIsBetter }: {
  label: string; value: number; target: number; unit: string; ceiling?: number; lowerIsBetter?: boolean
}) {
  const max = ceiling ?? target
  const over = lowerIsBetter ? value > target : false
  const overCeiling = ceiling !== undefined && value > ceiling
  const met = !lowerIsBetter && value >= target
  const tone = overCeiling ? 'bg-red-600' : over ? 'bg-amber-500' : met ? 'bg-green-600' : 'bg-[var(--blue-700)]'
  const status = overCeiling ? 'over ceiling' : over ? 'over target' : met ? 'target met' : null
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-[var(--ink)]">{label}</span>
        <span className="text-[var(--ink-2)]">
          <strong className="text-[var(--ink)]">{fmtNum(value)}</strong> / {fmtNum(target)}{unit}
          {ceiling !== undefined && <span className="text-xs text-[var(--ink-3)]"> (ceiling {fmtNum(ceiling)}{unit})</span>}
          {status && <span className={`ml-1 text-xs font-bold ${overCeiling ? 'text-red-700' : over ? 'text-amber-700' : 'text-green-700'}`}>· {status}</span>}
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-[var(--paper-2)]" role="presentation">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${progressRatio(value, max) * 100}%` }} />
        {ceiling !== undefined && ceiling > target && (
          <div className="absolute top-0 h-full w-0.5 bg-[var(--ink-3)]" style={{ left: `${(target / ceiling) * 100}%` }} aria-hidden="true" />
        )}
      </div>
    </div>
  )
}

const GROUP_LABEL: Record<RecommendationGroup, string> = {
  safety: 'Safety', ceiling: 'Limit', daily: 'Today', weekly: 'This week', habit: 'Habit',
}

/** Today (specs/029 US4): check-in, remaining budget, progress, components, recommendations, slots, quick log. */
export default async function TodayTab({ userId, enrolment }: { userId: string; enrolment: ActiveEnrolment }) {
  const supabase = await createClient()
  const { date, time } = nowFor(enrolment)
  const { def, targets } = enrolment

  let evaluation: Awaited<ReturnType<typeof evaluateDay>>
  let recentCheckins: Awaited<ReturnType<typeof loadCheckins>>
  try {
    ;[evaluation, recentCheckins] = await Promise.all([
      evaluateDay(supabase, userId, enrolment, date, time),
      loadCheckins(supabase, userId, addDays(date, -20), date),
    ])
  } catch (err) {
    return <HealthNotice title="Could not load today">{err instanceof Error ? err.message : 'Try again shortly.'}</HealthNotice>
  }

  const { entries, weekEntries, findings } = evaluation
  const items = entries.flatMap(e => e.items)
  const totals = sumNutrients(items)
  const comps = sumComponents(items)
  const weekComps = sumComponents(weekEntries.flatMap(e => e.items))
  const remainingMeals = mealsRemaining(def.mealSlots, time, entries.map(e => e.slot))
  const oneStarch = def.nutritionRules.some(r => r.type === 'one_starch_per_meal')
  const remaining = remainingBudget(totals, targets, { mealsRemaining: remainingMeals.length, oneStarchRule: oneStarch })
  const progress = componentProgress(def, comps, weekComps)
  const recs = rankRecommendations(findings)
  const band = uncertaintyBand(totals.kcal)

  const todayCheckin = recentCheckins.find(c => c.date === date) ?? null
  const trend = weightTrend(weighInsOf(recentCheckins), date)
  const sleep = sleepSummary(sleepNightsOf(recentCheckins), date, def)
  const waterNote = waterWeightNote(def, enrolment.startDate, date)
  const week = programmeWeek(enrolment.startDate, date)
  const scheduled = def.weeklySchedule?.days.find(d => d.day === weekdayOf(date))
  const componentLabels = Object.fromEntries(def.components.map(c => [c.key, { name: c.name, unit: c.unit }]))

  return (
    <div className="flex flex-col gap-4">
      <CheckinCard
        date={date}
        supplements={def.supplements.map(s => ({ key: s.key, name: s.name, dose: s.dose }))}
        existing={todayCheckin}
        typicalBed={sleep.typicalBedTime}
        typicalWake={sleep.typicalWakeTime}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <section className={CARD} aria-labelledby="budget-h">
          <h2 id="budget-h" className={CARD_TITLE}>Left today</h2>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-[var(--ink-3)]">Energy</dt>
              <dd className={`text-2xl font-bold ${remaining.kcal < 0 ? 'text-red-700' : 'text-[var(--ink)]'}`}>{remaining.kcal} <span className="text-sm font-normal">kcal</span></dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ink-3)]">Protein to go</dt>
              <dd className="text-2xl font-bold text-[var(--ink)]">{fmtNum(Math.max(0, remaining.proteinG), 0)} <span className="text-sm font-normal">g</span></dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ink-3)]">Sat fat left</dt>
              <dd className={`text-2xl font-bold ${remaining.satFatToCeilingG < 0 ? 'text-red-700' : remaining.satFatToTargetG < 0 ? 'text-amber-700' : 'text-[var(--ink)]'}`}>
                {fmtNum(remaining.satFatToTargetG)} <span className="text-sm font-normal">g</span>
              </dd>
              <dd className="text-xs text-[var(--ink-3)]">{fmtNum(remaining.satFatToCeilingG)} g to the ceiling</dd>
            </div>
            {remaining.starchServingsLeft !== null && (
              <div>
                <dt className="text-xs text-[var(--ink-3)]">Starch servings</dt>
                <dd className="text-2xl font-bold text-[var(--ink)]">{remaining.starchServingsLeft}</dd>
                <dd className="text-xs text-[var(--ink-3)]">one per meal still to come</dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-[var(--ink-3)]">Eaten {totals.kcal} kcal (likely {band.low}–{band.high}; logged figures are ±15%).</p>
        </section>

        <section className={CARD} aria-labelledby="weight-h">
          <h2 id="weight-h" className={CARD_TITLE}>Weight & sleep</h2>
          {trend.average !== null ? (
            <p className="text-sm text-[var(--ink-2)]">
              <span className="text-2xl font-bold text-[var(--ink)]">{fmtNum(trend.average)} kg</span>{' '}
              7-day average
              {trend.direction && (
                <span className="ml-1 font-semibold">
                  {trend.direction === 'down' ? '↓' : trend.direction === 'up' ? '↑' : '→'} {fmtNum(Math.abs(trend.weeklyChangeKg ?? 0))} kg/week
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-[var(--ink-2)]">Weigh in on 3 mornings to see your 7-day average.</p>
          )}
          {trend.latest && <p className="mt-1 text-xs text-[var(--ink-3)]">Latest single weigh-in {fmtNum(trend.latest.weightKg)} kg — daily weight is mostly water; watch the average.</p>}
          {waterNote && <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">{waterNote}</p>}
          <p className="mt-3 text-sm text-[var(--ink-2)]">
            Sleep last night: <strong className="text-[var(--ink)]">{formatDuration(sleep.lastNightMinutes)}</strong>
            {sleep.nights > 0 && <> · {sleep.consistentNights}/{sleep.nights} nights within ±{sleep.windowMinutes} min</>}
          </p>
          {week !== null && (
            <p className="mt-3 text-xs text-[var(--ink-3)]">
              Week {Math.min(week, def.identity.durationWeeks)} of {def.identity.durationWeeks}
              {scheduled && <> · Today: {scheduled.label}</>}
            </p>
          )}
        </section>
      </div>

      {recs.length > 0 && (
        <section className={CARD} aria-labelledby="recs-h">
          <h2 id="recs-h" className={CARD_TITLE}>What to do next</h2>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {recs.map(r => (
              <li key={r.key} className="flex gap-2 text-sm text-[var(--ink)]">
                <span className={`mt-0.5 h-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.group === 'ceiling' || r.group === 'safety' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                  {GROUP_LABEL[r.group]}
                </span>
                <span>{r.message}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <QuickLog date={date} nowTime={time} slots={def.mealSlots} componentLabels={componentLabels} />

      <div className="grid gap-4 md:grid-cols-2">
        <section className={CARD} aria-labelledby="progress-h">
          <h2 id="progress-h" className={CARD_TITLE}>Targets</h2>
          <div className="flex flex-col gap-3">
            <Bar label="Energy" value={totals.kcal} target={targets.kcal} unit=" kcal" lowerIsBetter />
            <Bar label="Protein" value={totals.proteinG} target={targets.proteinG} unit=" g" />
            <Bar label="Saturated fat" value={totals.satFatG} target={targets.satFatTargetG} ceiling={targets.satFatCeilingG} unit=" g" lowerIsBetter />
            <Bar label="Carbs" value={totals.carbsG} target={targets.carbsG} unit=" g" lowerIsBetter />
            <Bar label="Fat" value={totals.fatG} target={targets.fatG} unit=" g" lowerIsBetter />
            <Bar label="Fibre" value={totals.fibreG} target={targets.fibreMinG} unit=" g" />
          </div>
        </section>

        <section className={CARD} aria-labelledby="comp-h">
          <h2 id="comp-h" className={CARD_TITLE}>Programme components</h2>
          {progress.length === 0 ? <p className="text-sm text-[var(--ink-3)]">This programme has no component targets.</p> : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {progress.map(c => (
                <li key={c.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full text-xs font-bold ${c.met ? 'bg-green-600 text-white' : 'border border-[var(--rule)] text-transparent'}`}>✓</span>
                    <span className="text-[var(--ink)]">{c.name}</span>
                  </span>
                  <span className="text-[var(--ink-2)]">
                    {c.period === 'week'
                      ? <>{fmtNum(c.value)} of {fmtNum(c.target)} this week</>
                      : <>{fmtNum(c.value)} / {fmtNum(c.target)}{c.unit === 'servings' ? '' : ` ${c.unit}`}</>}
                    <span className="sr-only">{c.met ? ' — met' : ' — not yet'}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={CARD} aria-labelledby="slots-h">
        <h2 id="slots-h" className={CARD_TITLE}>Meals today</h2>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {def.mealSlots.map(s => {
            const logged = entries.filter(e => e.slot === s.key)
            const kcal = sumNutrients(logged.flatMap(e => e.items)).kcal
            return (
              <li key={s.key} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--rule-soft)] pb-2 text-sm last:border-0">
                <span>
                  <span className="mr-2 font-mono text-xs text-[var(--ink-3)]">{s.start}–{s.end}</span>
                  <strong className="text-[var(--ink)]">{s.name}</strong>
                  {s.template && <span className="block text-xs text-[var(--ink-3)]">Plan: {s.template}</span>}
                </span>
                <span className={logged.length ? 'font-semibold text-green-700' : 'text-[var(--ink-3)]'}>
                  {logged.length ? `✓ ${kcal} kcal` : 'not logged'}
                </span>
              </li>
            )
          })}
          {entries.filter(e => !e.slot).length > 0 && (
            <li className="text-sm text-[var(--ink-2)]">Other: {sumNutrients(entries.filter(e => !e.slot).flatMap(e => e.items)).kcal} kcal</li>
          )}
        </ol>
        <Link href={healthHref({ tab: 'log', date })} className="mt-3 inline-block text-sm font-semibold text-[var(--blue-700)] underline">Edit today&apos;s log</Link>
      </section>
    </div>
  )
}
