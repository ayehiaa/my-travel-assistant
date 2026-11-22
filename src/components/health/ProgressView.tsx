import type { Tone } from '@/lib/health/lifestyleUi'
import type { WeeklyReview } from '@/lib/health/weeklyReview'
import { formatDuration } from '@/lib/health/checkin'
import { cmTo, kgTo, type Units } from '@/lib/health/units'
import { signed } from '@/lib/health/measurements'
import AdjustmentCard, { type AdjustmentCardProps } from './AdjustmentCard'
import LabsCard from './LabsCard'
import MilestonesCard, { type MilestoneItem } from './MilestonesCard'
import ProgressPhotos from './ProgressPhotos'
import TrendChart, { type TrendPoint } from './TrendChart'
import WaistCard from './WaistCard'
import HealthNotice from './HealthNotice'
import { fmtNum } from './ui'
import Disclosure from './ui/Disclosure'
import InfoPopover from './ui/InfoPopover'
import Section from './ui/Section'
import StatTile from './ui/StatTile'

export interface ProgressModel {
  today: string
  units: Units
  weekTitle: string
  tiles: Array<{ key: string; label: string; value: string; sub?: string | null; tone?: Tone; status?: string | null }>
  adjustment: AdjustmentCardProps | null
  adjustmentNote: string | null
  weight: {
    points: TrendPoint[]
    baseline: number | null
    unit: string
    info: string[]
    history: Array<{ id: string; text: string; reasoning: string }>
  }
  p2Notice: string | null
  waist: { points: TrendPoint[]; card: React.ComponentProps<typeof WaistCard> } | null
  labs: React.ComponentProps<typeof LabsCard> | null
  milestones: MilestoneItem[] | null
  photos: React.ComponentProps<typeof ProgressPhotos> | null
  reviews: { current: WeeklyReview | null; past: WeeklyReview[] } | null
}

function fmtDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Progress (specs/032): this week's tiles first, then charts with ranges, then reviews and health checks. */
export default function ProgressView({ m }: { m: ProgressModel }) {
  return (
    <div className="flex flex-col gap-3">
      <section aria-labelledby="wk-sum-h">
        <h2 id="wk-sum-h" className="mb-2 text-sm font-bold text-[var(--ink)]">{m.weekTitle}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {m.tiles.map(t => <StatTile key={t.key} label={t.label} value={t.value} sub={t.sub} tone={t.tone} status={t.status} />)}
        </div>
      </section>

      {m.adjustment && <AdjustmentCard {...m.adjustment} />}
      {!m.adjustment && m.adjustmentNote && <p className="rounded-xl border border-[var(--rule)] bg-white px-4 py-3 text-xs text-[var(--ink-3)]">Calorie check: {m.adjustmentNote}</p>}

      <Section
        title="Weight"
        right={m.weight.info.length > 0 ? <InfoPopover label="About weight"><ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">{m.weight.info.map(t => <li key={t}>{t}</li>)}</ul></InfoPopover> : null}
      >
        <TrendChart points={m.weight.points} today={m.today} title="Weight, 7-day average" unit={m.weight.unit} baseline={m.weight.baseline} />
        <p className="mt-1 text-xs text-[var(--ink-3)]">Line: 7-day average · dots: daily{m.weight.baseline !== null && ' · dashed: start'}</p>
        {m.weight.history.length > 0 && (
          <details className="group mt-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-semibold text-[var(--blue-700)] [&::-webkit-details-marker]:hidden">Calorie changes ({m.weight.history.length}) <span aria-hidden="true" className="group-open:rotate-90">›</span></summary>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm text-[var(--ink-2)]">
              {m.weight.history.map(h => <li key={h.id}><strong className="text-[var(--ink)]">{h.text}</strong><span className="block text-xs text-[var(--ink-3)]">{h.reasoning}</span></li>)}
            </ul>
          </details>
        )}
      </Section>

      {m.p2Notice && <HealthNotice title="Needs a database update">{m.p2Notice}</HealthNotice>}

      {m.waist && (
        <Section title="Waist">
          <TrendChart points={m.waist.points} today={m.today} title="Waist" unit={m.units.length} initialRange="all" />
          <details className="group mt-2 border-t border-[var(--rule-soft)]" open={m.waist.card.due || m.waist.card.rows.length === 0}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-[var(--blue-700)] [&::-webkit-details-marker]:hidden">
              {m.waist.card.due ? '! Measure now' : 'Add / history'} <span aria-hidden="true" className="group-open:rotate-90">›</span>
            </summary>
            <WaistCard {...m.waist.card} bare />
          </details>
        </Section>
      )}

      {m.reviews && (
        <Disclosure title="Weekly reviews" meta={`${m.reviews.past.length + (m.reviews.current ? 1 : 0)}`}>
          {m.reviews.current && <ReviewBlock review={m.reviews.current} title={`${m.reviews.current.label ?? 'This week'} so far`} units={m.units} />}
          {m.reviews.past.length === 0 && <p className="mt-2 text-sm text-[var(--ink-3)]">First full review after your first Sunday.</p>}
          {m.reviews.past.map(r => (
            <details key={r.weekStart} className="mt-2 border-t border-[var(--rule-soft)] pt-1">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-[var(--ink)]">{r.label ? `${r.label}, ${fmtDay(r.windowStart ?? r.weekStart)}` : `Week of ${fmtDay(r.weekStart)}`}</summary>
              <ReviewBlock review={r} units={m.units} />
            </details>
          ))}
        </Disclosure>
      )}

      {(m.labs || m.milestones || m.photos) && (
        <section aria-labelledby="checks-h" className="flex flex-col gap-2">
          <h2 id="checks-h" className="mt-1 text-sm font-bold text-[var(--ink)]">Health checks</h2>
          {m.milestones && m.milestones.length > 0 && (
            <Disclosure title="Milestones" meta={`${m.milestones.filter(x => x.state === 'done').length}/${m.milestones.length} done`}>
              <MilestonesCard items={m.milestones} bare />
            </Disclosure>
          )}
          {m.labs && (
            <Disclosure title="Blood lipids" meta={m.labs.rows.length ? `last ${m.labs.rows[m.labs.rows.length - 1].date}` : 'none yet'}>
              <LabsCard {...m.labs} bare />
            </Disclosure>
          )}
          {m.photos && (
            <Disclosure title="Progress photos" meta={`${m.photos.photos.length}`}>
              <ProgressPhotos {...m.photos} bare />
            </Disclosure>
          )}
        </section>
      )}
    </div>
  )
}

function ReviewBlock({ review: r, title, units }: { review: WeeklyReview; title?: string; units: Units }) {
  const n = r.daysCounted
  return (
    <div className="mt-2 text-sm text-[var(--ink-2)]">
      {title && <h3 className="mb-1 text-sm font-bold text-[var(--ink)]">{title} <span className="font-normal text-[var(--ink-3)]">({r.daysCounted}/{r.windowDays ?? 7} days)</span></h3>}
      <ul className="m-0 grid list-none gap-x-6 gap-y-1 p-0 sm:grid-cols-2">
        {r.components.map(c => (
          <li key={c.key}>{c.name}: <strong className="text-[var(--ink)]">{c.period === 'day' ? `${c.value}/${c.of} days` : c.note === 'not due this week' ? 'not due' : `${c.value}/${c.of}`}</strong></li>
        ))}
        <li>Protein: <strong className="text-[var(--ink)]">{r.proteinDays}/{n} days</strong></li>
        <li>Sat fat ≤ target / limit: <strong className="text-[var(--ink)]">{r.satFatWithinTargetDays}/{r.satFatWithinCeilingDays} of {r.daysLogged}</strong></li>
        <li>Sessions: <strong className="text-[var(--ink)]">{r.sessions.done}{r.sessions.partial ? `+${r.sessions.partial}` : ''}/{r.sessions.planned}</strong></li>
        <li>Cardio: <strong className="text-[var(--ink)]">{r.cardio.minutes}{r.cardio.target !== null ? `/${r.cardio.target}` : ''} min</strong></li>
        <li>Steps: <strong className="text-[var(--ink)]">{r.steps.average !== null ? `${r.steps.average.toLocaleString('en-GB')} avg` : '—'}</strong></li>
        <li>Sleep: <strong className="text-[var(--ink)]">{r.sleep.averageMinutes !== null ? `${formatDuration(r.sleep.averageMinutes)} · ${r.sleep.consistentNights}/${r.sleep.nights} steady` : '—'}</strong></li>
        <li>Weight: <strong className="text-[var(--ink)]">{r.weight.average !== null ? `${fmtNum(kgTo(r.weight.average, units.weight))} ${units.weight}` : '—'}{r.weight.changeKg !== null ? ` (${signed(kgTo(r.weight.changeKg, units.weight), units.weight)})` : ''}</strong></li>
        <li>Waist: <strong className="text-[var(--ink)]">{r.waist.latestCm !== null ? `${cmTo(r.waist.latestCm, units.length)} ${units.length}` : '—'}{r.waist.changeCm !== null ? ` (${signed(cmTo(r.waist.changeCm, units.length), units.length)})` : ''}</strong></li>
      </ul>
      {r.focus.length > 0 && (
        <>
          <h4 className="mt-2 text-xs font-bold uppercase text-[var(--ink-3)]">Next week</h4>
          <ol className="mt-1 list-decimal pl-5 text-[var(--ink)]">{r.focus.map(f => <li key={f}>{f}</li>)}</ol>
        </>
      )}
    </div>
  )
}
