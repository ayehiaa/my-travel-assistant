import Link from 'next/link'
import { healthHref } from '@/lib/health/healthHub'
import { ceilingMeter, kcalMeter, minTargetMeter, type Tone } from '@/lib/health/lifestyleUi'
import type { RecommendationGroup } from '@/lib/health/rules'
import ActivityCard, { type ActivityCardProps } from './ActivityCard'
import AdjustmentCard, { type AdjustmentCardProps } from './AdjustmentCard'
import CheckinCard from './CheckinCard'
import ComponentChipsRow, { type ChipSuggestion } from './ComponentChipsRow'
import DayTimezoneControl from './DayTimezoneControl'
import NextMorningCheckCard from './NextMorningCheckCard'
import StepsInline from './StepsInline'
import type { ComponentChip } from '@/lib/health/lifestyleUi'
import { fmtNum } from './ui'
import Chip from './ui/Chip'
import InfoPopover from './ui/InfoPopover'
import Meter from './ui/Meter'
import { SheetTrigger } from './ui/BottomSheet'
import { PRIMARY_BTN, SMALL_BTN } from './ui/Section'
import { TONE_TEXT_CLASS } from './ui/tone'

export interface TodayModel {
  date: string
  time: string
  weekChip: string
  weekDetail: string | null
  dayLabel: string | null
  kcal: { eaten: number; target: number }
  protein: { value: number; target: number }
  satFat: { value: number; target: number; ceiling: number }
  chips: Array<ComponentChip & { sources: string[]; suggestions: ChipSuggestion[] }>
  slot: string | null
  checkin: React.ComponentProps<typeof CheckinCard>
  morningCheck: React.ComponentProps<typeof NextMorningCheckCard> | null
  adjustment: AdjustmentCardProps | null
  notices: Array<{ key: string; text: string; href: string }>
  jointStop: string | null
  recs: Array<{ key: string; message: string; group: RecommendationGroup }>
  session: {
    label: string
    status: 'done' | 'partial' | 'skipped' | 'todo' | 'none'
    href: string | null
    note: string | null
    warnings: string[]
  } | null
  cardio: { label: string; todayMinutes: number; weekMinutes: number; weekTarget: number | null } | null
  steps: { value: number | null; target: string | null; tone: Tone } | null
  activity: Omit<ActivityCardProps, 'title'> | null
  trip: { label: string; start: string; end: string; eatingOut: string[]; dates: string[]; currentTz: string; homeTz: string } | null
}

const STATUS_TEXT: Record<'done' | 'partial' | 'skipped', { text: string; tone: Tone }> = {
  done: { text: '✓ Done', tone: 'good' },
  partial: { text: '◐ Partial', tone: 'close' },
  skipped: { text: 'Skipped', tone: 'neutral' },
}

function PlanRow({ title, meta, right }: { title: React.ReactNode; meta?: React.ReactNode; right: React.ReactNode }) {
  return (
    <li className="flex min-h-14 items-center gap-3 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[var(--ink)]">{title}</span>
        {meta && <span className="block truncate text-xs text-[var(--ink-3)]">{meta}</span>}
      </span>
      <span className="shrink-0">{right}</span>
    </li>
  )
}

/** Today (specs/032): one glance — meters, goal chips, check-in, next best action, today's plan. */
export default function TodayView({ m }: { m: TodayModel }) {
  const k = kcalMeter(m.kcal.eaten, m.kcal.target)
  const p = minTargetMeter(m.protein.value, m.protein.target)
  const sf = ceilingMeter(m.satFat.value, m.satFat.target, m.satFat.ceiling)
  const foodHref = healthHref({ tab: 'food' })
  const [top, ...more] = m.recs

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Chip>{m.weekChip}</Chip>
        {m.dayLabel && <span className="min-w-0 truncate text-xs text-[var(--ink-3)]">{m.dayLabel}</span>}
        {m.weekDetail && <InfoPopover label="About this week" align="left">{m.weekDetail}</InfoPopover>}
      </div>

      {m.trip && (
        <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-1">
          <p className="min-w-0 truncate text-sm text-teal-900"><span aria-hidden="true">✈ </span><strong>Travel</strong> · {m.trip.label}</p>
          <InfoPopover label="Travel details">
            <p className="font-semibold text-[var(--ink)]">{m.trip.start} → {m.trip.end}</p>
            <p className="mt-1 text-xs">Hotel exercise swaps are pre-selected.</p>
            {m.trip.eatingOut.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs">{m.trip.eatingOut.map(r => <li key={r}>{r}</li>)}</ul>}
            <DayTimezoneControl dates={m.trip.dates} currentTz={m.trip.currentTz} homeTz={m.trip.homeTz} />
          </InfoPopover>
        </div>
      )}

      {m.jointStop && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">▲ {m.jointStop}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <Meter label="Calories left" value={k.left.toLocaleString('en-GB')} unit="kcal" sub={`${m.kcal.eaten} of ${m.kcal.target}`} ratio={k.ratio} tone={k.tone} status={k.status} href={foodHref} />
        </div>
        <Meter label="Protein" value={fmtNum(m.protein.value, 0)} unit={`/ ${fmtNum(m.protein.target, 0)} g`} ratio={p.ratio} tone={p.tone} status={p.status} href={foodHref} />
        <Meter label="Sat fat" value={fmtNum(m.satFat.value)} unit={`/ ${fmtNum(m.satFat.target)} g`} sub={`limit ${fmtNum(m.satFat.ceiling)} g`} ratio={sf.ratio} marker={sf.markerRatio} tone={sf.tone} status={sf.status} href={foodHref} />
      </div>

      {m.chips.length > 0 && <ComponentChipsRow chips={m.chips} date={m.date} time={m.time} slot={m.slot} />}

      <CheckinCard {...m.checkin} />

      {m.morningCheck && <NextMorningCheckCard {...m.morningCheck} />}
      {m.adjustment && <AdjustmentCard {...m.adjustment} />}

      {top && (
        <section aria-label="Next best action" className="rounded-xl border border-[var(--rule)] bg-white">
          <div className="flex items-start gap-3 px-4 py-3">
            <span aria-hidden="true" className={`mt-0.5 text-lg ${top.group === 'ceiling' || top.group === 'safety' ? 'text-red-700' : 'text-[var(--blue-700)]'}`}>{top.group === 'ceiling' || top.group === 'safety' ? '▲' : '→'}</span>
            <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--ink)]">{top.message}</p>
          </div>
          {more.length > 0 && (
            <details className="group border-t border-[var(--rule-soft)]">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-xs font-semibold text-[var(--blue-700)] [&::-webkit-details-marker]:hidden">
                {more.length} more <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
              </summary>
              <ul className="m-0 flex list-none flex-col gap-2 px-4 pb-3 text-sm text-[var(--ink-2)]">
                {more.map(r => <li key={r.key}>{r.group === 'ceiling' || r.group === 'safety' ? '▲ ' : '→ '}{r.message}</li>)}
              </ul>
            </details>
          )}
        </section>
      )}

      {(m.session || m.cardio || m.steps) && (
        <section aria-labelledby="plan-h" className="rounded-xl border border-[var(--rule)] bg-white px-4 pb-1 pt-3">
          <h2 id="plan-h" className="text-sm font-bold text-[var(--ink)]">Today&apos;s plan</h2>
          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--rule-soft)] p-0">
            {m.session && (
              <PlanRow
                title={m.session.label}
                meta={m.session.status === 'none' ? m.session.note : m.session.warnings[0] ?? null}
                right={m.session.status === 'todo' && m.session.href
                  ? <Link href={m.session.href} className={PRIMARY_BTN}>Start</Link>
                  : m.session.status === 'done' || m.session.status === 'partial' || m.session.status === 'skipped'
                    ? <span className={`text-sm font-bold ${TONE_TEXT_CLASS[STATUS_TEXT[m.session.status].tone]}`}>{STATUS_TEXT[m.session.status].text}</span>
                    : <Link href={healthHref({ tab: 'train' })} className={SMALL_BTN}>Week</Link>}
              />
            )}
            {m.cardio && (
              <PlanRow
                title={m.cardio.label}
                meta={`${m.cardio.weekMinutes}${m.cardio.weekTarget !== null ? ` / ${m.cardio.weekTarget}` : ''} min this week`}
                right={m.activity ? (
                  <SheetTrigger title="Cardio & steps" triggerClassName={m.cardio.todayMinutes > 0 ? SMALL_BTN : PRIMARY_BTN} trigger={m.cardio.todayMinutes > 0 ? `✓ ${m.cardio.todayMinutes} min` : 'Log'}>
                    <ActivityCard {...m.activity} bare />
                  </SheetTrigger>
                ) : null}
              />
            )}
            {m.steps && (
              <PlanRow
                title="Steps"
                meta={m.steps.target ? <span className={m.steps.tone === 'good' ? 'text-green-700' : undefined}>{m.steps.tone === 'good' ? '✓ ' : ''}{m.steps.target}</span> : null}
                right={<StepsInline date={m.date} steps={m.steps.value} />}
              />
            )}
          </ul>
        </section>
      )}

      {m.notices.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {m.notices.map(n => (
            <li key={n.key}>
              <Link href={n.href} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-900">
                <span className="min-w-0 truncate">! {n.text}</span><span aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
