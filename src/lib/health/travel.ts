import { z } from 'zod'
import type { ProgrammeDefinition } from './programmeSchema'
import type { FoodItem } from './nutrition'
import { addDays, isValidDate, localDate } from './time'
import { isValidTimeZone } from './targets'

/**
 * Travel and restaurant modes (specs/029 US11, phase P2). Pure.
 *
 * - Trips come from the existing Trips module: the user's own trips (`trips.owner_id = user`) with their legs.
 *   A trip covers every local date from the first leg's departure to the last leg's arrival (or departure when there
 *   is no arrival). A one-way trip covers only its travel day(s) — there is no known return.
 * - Day boundaries: an optional per-day timezone override (set by the user, e.g. for trip days); otherwise the
 *   enrolment timezone. "Today" is resolved with `resolveTimezone()` so a day is never split or duplicated.
 */

export interface TripLegLite { departureAt: string; arrivalAt: string | null; from: string; to: string }
export interface TripLite { id: string; tripType: string; legs: TripLegLite[] }

export interface TripRange { tripId: string; start: string; end: string; label: string }

const isoDate = (iso: string, tz: string): string | null => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : localDate(d, tz)
}

export function tripRanges(trips: readonly TripLite[], tz: string): TripRange[] {
  const out: TripRange[] = []
  for (const t of trips) {
    const legs = [...t.legs].sort((a, b) => a.departureAt.localeCompare(b.departureAt))
    if (legs.length === 0) continue
    const start = isoDate(legs[0].departureAt, tz)
    const last = legs[legs.length - 1]
    const end = isoDate(last.arrivalAt ?? last.departureAt, tz) ?? start
    if (!start || !end) continue
    const via = legs.map(l => l.to).filter((x, i, a) => a.indexOf(x) === i && x !== legs[0].from)
    out.push({ tripId: t.id, start, end: end < start ? start : end, label: `${legs[0].from} → ${via.join(' → ') || last.to}` })
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

export function tripOn(ranges: readonly TripRange[], date: string): TripRange | null {
  return ranges.find(r => r.start <= date && date <= r.end) ?? null
}

/** Rows of the existing trips query (`trips` + `trip_legs`) → TripLite (defensive). */
export function rowsToTrips(rows: unknown[]): TripLite[] {
  const out: TripLite[] = []
  for (const raw of rows) {
    const r = raw as Record<string, unknown>
    const legs = Array.isArray(r.legs) ? (r.legs as Record<string, unknown>[]) : []
    out.push({
      id: String(r.id),
      tripType: String(r.trip_type ?? 'round_trip'),
      legs: legs
        .filter(l => typeof l.departure_at === 'string')
        .map(l => ({ departureAt: String(l.departure_at), arrivalAt: (l.arrival_at as string | null) ?? null, from: String(l.from_airport ?? ''), to: String(l.to_airport ?? '') })),
    })
  }
  return out
}

// ── Per-day timezone ────────────────────────────────────────────────────────

export interface DayTimezone { date: string; timezone: string }

export const DayTimezoneInputSchema = z.object({
  dates:    z.array(z.string().refine(isValidDate, { message: 'Invalid date' })).min(1).max(60),
  /** null clears the override (back to the enrolment timezone). */
  timezone: z.string().trim().min(1).max(64).refine(isValidTimeZone, { message: 'Unknown timezone' }).nullable(),
}).strict()

/**
 * Timezone in force at `now`: an override for local date D applies when, in that timezone, it is D. Overrides for
 * the home date ±1 are checked (latest date first, so after an eastbound flight the new day wins). Default: home tz.
 */
export function resolveTimezone(now: Date, homeTz: string, overrides: readonly DayTimezone[]): string {
  if (overrides.length === 0) return homeTz
  const home = localDate(now, homeTz)
  const near = new Set([addDays(home, -1), home, addDays(home, 1)])
  const candidates = overrides.filter(o => near.has(o.date) && isValidTimeZone(o.timezone)).sort((a, b) => b.date.localeCompare(a.date))
  for (const o of candidates) if (localDate(now, o.timezone) === o.date) return o.timezone
  return homeTz
}

// ── Restaurant mode ─────────────────────────────────────────────────────────

/** Deterministic tips for an eating-out estimate: the programme's rules first, then item-specific asks. */
export function restaurantTips(def: ProgrammeDefinition, items: ReadonlyArray<Pick<FoodItem, 'name' | 'satFatG' | 'kcal' | 'components'>>, satFatLeftG: number | null): string[] {
  const tips: string[] = []
  const names = items.map(i => i.name.toLowerCase()).join(' | ')
  const sat = items.reduce((t, i) => t + i.satFatG, 0)
  const starch = items.reduce((t, i) => t + (i.components?.starch_servings ?? 0), 0)
  if (/sauce|gravy|cream|butter|béarnaise|bearnaise|hollandaise|peppercorn|carbonara|korma|alfredo/.test(names)) {
    tips.push('Ask for the sauce on the side — butter and cream sauces are 12–20 g saturated fat each.')
  }
  if (/grill|steak|chicken|fish|kebab|shish|tawook|kofta|salmon|prawn/.test(names)) tips.push('Ask for no butter on the grill.')
  if (/fried|fries|chips|tempura|battered|crispy|schnitzel|katsu/.test(names)) tips.push('Swap fried for grilled — or share the fries.')
  if (starch > 1.5) tips.push('One starch: choose rice, bread or potatoes — not two.')
  if (satFatLeftG !== null && sat > Math.max(0, satFatLeftG)) tips.push(`This is about ${Math.round(sat)} g saturated fat — more than you have left today; leave a third of the portion.`)
  else if (items.reduce((t, i) => t + i.kcal, 0) > 900) tips.push('Big plate — leave a third of the portion.')
  for (const rule of def.eatingOut) if (tips.length < 5 && !tips.some(t => t.slice(0, 20) === rule.slice(0, 20))) tips.push(rule)
  return [...new Set(tips)].slice(0, 5)
}

/** Restaurant context for the AI prompt (menu photos / descriptions are DATA). */
export const RESTAURANT_PROMPT_NOTE =
  'This is a restaurant or takeaway dish, possibly a MENU photo or menu description. Estimate the dish as typically ' +
  'served in a UK restaurant, including hidden cooking fat (butter on the grill, oil, ghee, cream). If it is a menu, ' +
  'estimate the dish(es) the person says they are choosing, or the most likely one.'
