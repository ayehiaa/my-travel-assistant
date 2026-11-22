import { createClient } from '@/lib/supabase/server'
import { loadCheckins, loadEntries, nowFor, type ActiveEnrolment } from '@/lib/health/healthServer'
import { signedPhotoUrls } from '@/lib/health/healthPhotos'
import { sumNutrients, uncertaintyBand } from '@/lib/health/nutrition'
import { formatDuration, sleepDurationMinutes } from '@/lib/health/checkin'
import { healthHref } from '@/lib/health/healthHub'
import FoodEntryCard from './FoodEntryCard'
import LogDatePicker from './LogDatePicker'
import HealthNotice from './HealthNotice'
import { CARD, CARD_TITLE, fmtNum } from './ui'

/** Log (specs/029 §5): one day's food entries (edit / delete), check-in, totals; date picker for past days. */
export default async function LogTab({ userId, enrolment, date }: { userId: string; enrolment: ActiveEnrolment; date: string }) {
  const supabase = await createClient()
  const today = nowFor(enrolment).date
  let entries: Awaited<ReturnType<typeof loadEntries>>
  let checkins: Awaited<ReturnType<typeof loadCheckins>>
  try {
    ;[entries, checkins] = await Promise.all([loadEntries(supabase, userId, date, date), loadCheckins(supabase, userId, date, date)])
  } catch (err) {
    return <HealthNotice title="Could not load this day">{err instanceof Error ? err.message : 'Try again shortly.'}</HealthNotice>
  }
  const urls = await signedPhotoUrls(entries.flatMap(e => e.photoPaths))
  const checkin = checkins[0] ?? null
  const totals = sumNutrients(entries.flatMap(e => e.items))
  const band = uncertaintyBand(totals.kcal)
  const { def } = enrolment
  const slots = def.mealSlots.map(s => ({ key: s.key, name: s.name }))
  const componentLabels = Object.fromEntries(def.components.map(c => [c.key, { name: c.name, unit: c.unit }]))
  const supplementNames = new Map(def.supplements.map(s => [s.key, s.name]))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LogDatePicker date={date} today={today} />
        {date === today && <a href={`${healthHref({ tab: 'today' })}#log-food`} className="text-sm font-semibold text-[var(--blue-700)] underline">+ Log food</a>}
      </div>

      <section className={CARD} aria-labelledby="day-h">
        <h2 id="day-h" className={CARD_TITLE}>Day summary</h2>
        <p className="text-sm text-[var(--ink-2)]">
          <strong className="text-[var(--ink)]">{totals.kcal} kcal</strong> ({band.low}–{band.high}) · protein {fmtNum(totals.proteinG)} g ·
          sat fat {fmtNum(totals.satFatG)} g · carbs {fmtNum(totals.carbsG)} g · fat {fmtNum(totals.fatG)} g · fibre {fmtNum(totals.fibreG)} g
        </p>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          {checkin ? (
            <>
              Check-in: {checkin.weightKg != null ? `${checkin.weightKg} kg` : 'no weight'}
              {checkin.bedTime && checkin.wakeTime && <> · sleep {checkin.bedTime}–{checkin.wakeTime} ({formatDuration(sleepDurationMinutes(checkin.bedTime, checkin.wakeTime))})</>}
              {checkin.supplementsTaken.length > 0 && <> · {checkin.supplementsTaken.map(k => supplementNames.get(k) ?? k).join(', ')}</>}
            </>
          ) : 'No morning check-in this day.'}
        </p>
      </section>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule)] p-6 text-center text-sm text-[var(--ink-3)]">Nothing logged on this day.</p>
      ) : (
        entries.map(e => (
          <FoodEntryCard
            key={e.id}
            entry={{ id: e.id, time: e.time, slot: e.slot, text: e.text, restaurant: e.restaurant, items: e.items }}
            photoUrls={e.photoPaths.map(p => urls[p]).filter((u): u is string => !!u)}
            slots={slots}
            componentLabels={componentLabels}
          />
        ))
      )}
    </div>
  )
}
