import { ceilingMeter, entrySummary, kcalMeter, minTargetMeter, type RecentFood } from '@/lib/health/lifestyleUi'
import type { NutrientTotals } from '@/lib/health/nutrition'
import type { EffectiveTargets } from '@/lib/health/targets'
import ActivityCard, { type ActivityCardProps } from './ActivityCard'
import FoodEntryCard, { type FoodEntryView } from './FoodEntryCard'
import { FoodLogButton, type LogContext } from './FoodLogSheet'
import LogDatePicker from './LogDatePicker'
import RecentFoods from './RecentFoods'
import { fmtNum } from './ui'
import Bar from './ui/Bar'
import { SheetTrigger } from './ui/BottomSheet'
import Disclosure from './ui/Disclosure'
import Meter from './ui/Meter'
import { PRIMARY_BTN } from './ui/Section'

export interface FoodModel {
  date: string
  today: string
  totals: NutrientTotals
  targets: EffectiveTargets
  band: { low: number; high: number }
  starchLeft: number | null
  meals: Array<{ key: string; name: string; window: string | null; entries: FoodEntryView[] }>
  slots: Array<{ key: string; name: string }>
  componentLabels: Record<string, { name: string; unit: string }>
  recents: RecentFood[]
  log: LogContext
  relogSlot: string | null
  dayLines: string[]
  activity: Omit<ActivityCardProps, 'title'> | null
}

function kcalOf(e: FoodEntryView): number {
  return Math.round(e.items.reduce((n, i) => n + i.kcal, 0))
}

function DetailBar({ label, value, target, unit, ceiling, upper }: { label: string; value: number; target: number; unit: string; ceiling?: number; upper?: boolean }) {
  const s = ceiling !== undefined ? ceilingMeter(value, target, ceiling) : upper ? kcalMeter(value, target) : minTargetMeter(value, target)
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-[var(--ink-2)]">{label}</span>
        <span className="tabular-nums text-[var(--ink)]"><strong>{fmtNum(value)}</strong> / {fmtNum(target)}{unit}{s.status && <span className="ml-1 text-xs font-bold">· {s.status}</span>}</span>
      </div>
      <Bar ratio={s.ratio} tone={s.tone} marker={'markerRatio' in s ? (s.markerRatio as number | null) : null} />
    </li>
  )
}

/** Food (specs/032): date switcher, day meters, log button, recent & favourites, day timeline by meal. */
export default function FoodView({ m }: { m: FoodModel }) {
  const k = kcalMeter(m.totals.kcal, m.targets.kcal)
  const p = minTargetMeter(m.totals.proteinG, m.targets.proteinG)
  const sf = ceilingMeter(m.totals.satFatG, m.targets.satFatTargetG, m.targets.satFatCeilingG)
  const isToday = m.date === m.today
  const logged = m.meals.some(x => x.entries.length > 0)

  return (
    <div className="flex flex-col gap-3">
      <LogDatePicker date={m.date} today={m.today} />

      <div className="grid grid-cols-3 gap-2">
        <Meter label={isToday ? 'kcal left' : 'kcal'} value={(isToday ? k.left : m.totals.kcal).toLocaleString('en-GB')} sub={`of ${m.targets.kcal}`} ratio={k.ratio} tone={k.tone} status={k.tone === 'bad' ? k.status : null} />
        <Meter label="Protein" value={fmtNum(m.totals.proteinG, 0)} sub={`of ${fmtNum(m.targets.proteinG, 0)} g`} ratio={p.ratio} tone={p.tone} status={p.tone === 'good' ? '' : null} />
        <Meter label="Sat fat" value={fmtNum(m.totals.satFatG)} sub={`of ${fmtNum(m.targets.satFatTargetG)} g`} ratio={sf.ratio} marker={sf.markerRatio} tone={sf.tone} status={sf.tone === 'good' ? null : sf.tone === 'bad' ? 'Over' : '!'} />
      </div>

      <FoodLogButton ctx={m.log} className={`${PRIMARY_BTN} w-full`} label={isToday ? 'Log food' : 'Log food for this day'} />

      <Disclosure title="Day details" meta={`${m.totals.kcal} kcal (${m.band.low}–${m.band.high})`}>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          <DetailBar label="Energy" value={m.totals.kcal} target={m.targets.kcal} unit=" kcal" upper />
          <DetailBar label="Protein" value={m.totals.proteinG} target={m.targets.proteinG} unit=" g" />
          <DetailBar label="Sat fat" value={m.totals.satFatG} target={m.targets.satFatTargetG} ceiling={m.targets.satFatCeilingG} unit=" g" />
          <DetailBar label="Carbs" value={m.totals.carbsG} target={m.targets.carbsG} unit=" g" upper />
          <DetailBar label="Fat" value={m.totals.fatG} target={m.targets.fatG} unit=" g" upper />
          <DetailBar label="Fibre" value={m.totals.fibreG} target={m.targets.fibreMinG} unit=" g" />
        </ul>
        <p className="mt-3 text-xs text-[var(--ink-3)]">
          Logged values ±15%.{isToday && m.starchLeft !== null && <> Starch servings left: <strong className="text-[var(--ink)]">{m.starchLeft}</strong>.</>}
        </p>
        {m.dayLines.length > 0 && <ul className="mt-2 flex list-none flex-col gap-1 p-0 text-xs text-[var(--ink-2)]">{m.dayLines.map(l => <li key={l}>{l}</li>)}</ul>}
      </Disclosure>

      {m.recents.length > 0 && (
        <Disclosure id="recent" title="Recent & favourites" meta={`${m.recents.length}`} open={!logged}>
          <RecentFoods foods={m.recents} date={m.date} time={m.log.nowTime} slot={m.relogSlot} />
        </Disclosure>
      )}

      <section aria-labelledby="meals-h" className="rounded-xl border border-[var(--rule)] bg-white">
        <h2 id="meals-h" className="px-4 pb-1 pt-3 text-sm font-bold text-[var(--ink)]">Meals</h2>
        {!logged && <p className="px-4 pb-3 text-sm text-[var(--ink-3)]">Nothing logged yet.</p>}
        <ol className="m-0 list-none p-0">
          {m.meals.filter(x => x.entries.length > 0 || x.window !== null).map(meal => {
            const total = meal.entries.reduce((n, e) => n + kcalOf(e), 0)
            return (
              <li key={meal.key} className="border-t border-[var(--rule-soft)] first:border-t-0">
                <div className="flex min-h-10 items-baseline justify-between gap-2 px-4 pt-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-[var(--ink-3)]">{meal.name}{meal.window && <span className="ml-1 font-normal normal-case tracking-normal">{meal.window}</span>}</span>
                  <span className={`text-xs font-semibold ${meal.entries.length ? 'text-[var(--ink)]' : 'text-[var(--ink-4)]'}`}>{meal.entries.length ? `${total} kcal` : '—'}</span>
                </div>
                {meal.entries.length > 0 && (
                  <ul className="m-0 list-none p-0 pb-1">
                    {meal.entries.map(e => {
                      const t = e.items.reduce((a, i) => ({ p: a.p + i.proteinG, s: a.s + i.satFatG }), { p: 0, s: 0 })
                      return (
                        <li key={e.id}>
                          <SheetTrigger
                            title={`${e.time} · ${meal.name}`}
                            triggerClassName="flex min-h-12 w-full items-center gap-3 px-4 py-1.5 text-left hover:bg-[var(--paper-2)]"
                            trigger={(
                              <>
                                <span className="w-11 shrink-0 font-mono text-xs text-[var(--ink-3)]">{e.time}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm text-[var(--ink)]">{entrySummary(e.items, e.text)}{e.photos.length > 0 && <span aria-label="has photos"> 📷</span>}</span>
                                  <span className="block text-xs text-[var(--ink-3)]">protein {fmtNum(t.p, 0)} g · sat fat {fmtNum(t.s)} g</span>
                                </span>
                                <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--ink)]">{kcalOf(e)}</span>
                              </>
                            )}
                          >
                            <FoodEntryCard entry={e} slots={m.slots} componentLabels={m.componentLabels} bare />
                          </SheetTrigger>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      </section>

      {m.activity && (
        <Disclosure title="Cardio & steps" meta={m.activity.migrationNeeded ? undefined : `${m.activity.weekly.minutes} min this week`}>
          <ActivityCard {...m.activity} bare />
        </Disclosure>
      )}
    </div>
  )
}
