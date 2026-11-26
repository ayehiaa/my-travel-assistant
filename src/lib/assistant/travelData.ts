import { daysOutsideUKInWindow } from '@/lib/daysCalculator'

/**
 * My Assistant (specs/033) — pure travel + expense shaping for the tools (compact rows, filters, groupings).
 * Days outside the UK follow the dashboard exactly: departure and return days excluded, trips counted when they
 * overlap the window, window = 12 months ending at the reference date.
 */

export interface LegRow {
  from_airport: string
  to_airport: string
  airline?: string | null
  flight_number?: string | null
  departure_at: string
  arrival_at?: string | null
  leg_order?: number | null
}

export interface TripRow {
  id: string
  trip_type?: string | null
  source?: string | null
  days_outside_uk?: number | null
  created_at: string
  legs?: LegRow[] | null
}

export interface TripSummary {
  id: string
  route: string
  start: string
  end: string
  legs: number
  type: string | null
  daysOutsideUk: number
}

const day = (iso: string) => iso.slice(0, 10)

function orderedLegs(t: TripRow): LegRow[] {
  return [...(t.legs ?? [])].sort((a, b) => (a.leg_order ?? 0) - (b.leg_order ?? 0) || a.departure_at.localeCompare(b.departure_at))
}

export function summarizeTrip(t: TripRow): TripSummary {
  const legs = orderedLegs(t)
  const route = legs.length ? [legs[0].from_airport, ...legs.map(l => l.to_airport)].join(' → ') : '(no flights)'
  const start = legs[0]?.departure_at ?? t.created_at
  const end = legs[legs.length - 1]?.departure_at ?? start
  return {
    id: t.id,
    route,
    start: day(start),
    end: day(end),
    legs: legs.length,
    type: t.trip_type ?? null,
    daysOutsideUk: typeof t.days_outside_uk === 'number' ? t.days_outside_uk : 0,
  }
}

export interface TripFilter {
  when?: 'upcoming' | 'past' | 'all' | null
  from?: string | null
  to?: string | null
  destinationContains?: string | null
}

/** Filter + order: upcoming soonest first; past / all newest first. Dates are YYYY-MM-DD; `today` local. */
export function filterTrips(trips: readonly TripRow[], f: TripFilter, today: string): TripSummary[] {
  const needle = f.destinationContains?.trim().toUpperCase() ?? ''
  const rows = trips
    .filter(t => {
      if (!needle) return true
      return (t.legs ?? []).some(l => l.from_airport.toUpperCase().includes(needle) || l.to_airport.toUpperCase().includes(needle))
    })
    .map(summarizeTrip)
    .filter(s => {
      if (f.when === 'upcoming' && s.start < today) return false
      if (f.when === 'past' && s.start >= today) return false
      if (f.from && s.end < f.from) return false
      if (f.to && s.start > f.to) return false
      return true
    })
  return f.when === 'upcoming'
    ? rows.sort((a, b) => a.start.localeCompare(b.start))
    : rows.sort((a, b) => b.start.localeCompare(a.start))
}

export interface DaysBreakdown {
  windowStart: string
  windowEnd: string
  totalDays: number
  trips: Array<{ id: string; route: string; start: string; end: string; daysInWindow: number }>
}

/** Days outside the UK inside [windowStart, windowEnd] (YYYY-MM-DD, inclusive), per trip. */
export function daysOutsideInWindow(trips: readonly TripRow[], windowStart: string, windowEnd: string): DaysBreakdown {
  const ws = new Date(windowStart)
  const we = new Date(windowEnd)
  const out: DaysBreakdown['trips'] = []
  for (const t of trips) {
    const legs = orderedLegs(t)
    if (!legs.length) continue
    const first = legs[0].departure_at
    const last = legs[legs.length - 1].departure_at
    if (day(first) > windowEnd || day(last) < windowStart) continue
    const n = daysOutsideUKInWindow(first, last, ws, we)
    if (n > 0) {
      const s = summarizeTrip(t)
      out.push({ id: s.id, route: s.route, start: s.start, end: s.end, daysInWindow: n })
    }
  }
  out.sort((a, b) => a.start.localeCompare(b.start))
  return { windowStart, windowEnd, totalDays: out.reduce((s, t) => s + t.daysInWindow, 0), trips: out }
}

/** The dashboard's rolling window: one year back from the reference date (same calendar day), inclusive. */
export function appWindow(referenceDate: string): { start: string; end: string } {
  const end = new Date(`${referenceDate}T00:00:00Z`)
  const start = new Date(end)
  start.setUTCFullYear(start.getUTCFullYear() - 1)
  return { start: start.toISOString().slice(0, 10), end: referenceDate }
}

// ── Expenses ────────────────────────────────────────────────────────────────

export interface ExpenseRow {
  id: string
  title: string
  amount: number
  currency: string
  expense_date: string
  notes?: string | null
  reclaimed: boolean
  trip_id?: string | null
  category?: { name?: string | null } | null
}

export interface ExpenseFilter {
  from?: string | null
  to?: string | null
  category?: string | null
  tripId?: string | null
  reclaimed?: 'yes' | 'no' | 'any' | null
  textContains?: string | null
}

export function filterExpenses(rows: readonly ExpenseRow[], f: ExpenseFilter): ExpenseRow[] {
  const cat = f.category?.trim().toLowerCase() ?? ''
  const text = f.textContains?.trim().toLowerCase() ?? ''
  return rows
    .filter(e => {
      if (f.from && e.expense_date < f.from) return false
      if (f.to && e.expense_date > f.to) return false
      if (f.tripId && e.trip_id !== f.tripId) return false
      if (f.reclaimed === 'yes' && !e.reclaimed) return false
      if (f.reclaimed === 'no' && e.reclaimed) return false
      if (cat && !(e.category?.name ?? '').toLowerCase().includes(cat)) return false
      if (text && !`${e.title} ${e.notes ?? ''}`.toLowerCase().includes(text)) return false
      return true
    })
    .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || a.title.localeCompare(b.title))
}

export interface CurrencyTotals { total: number; reclaimed: number; pending: number; count: number }

const r2 = (v: number) => Math.round(v * 100) / 100

function addTo(map: Record<string, CurrencyTotals>, e: ExpenseRow) {
  const t = (map[e.currency] ??= { total: 0, reclaimed: 0, pending: 0, count: 0 })
  t.total = r2(t.total + e.amount)
  if (e.reclaimed) t.reclaimed = r2(t.reclaimed + e.amount)
  else t.pending = r2(t.pending + e.amount)
  t.count++
}

/** Totals per currency (never converted). */
export function totalsByCurrency(rows: readonly ExpenseRow[]): Record<string, CurrencyTotals> {
  const map: Record<string, CurrencyTotals> = {}
  for (const e of rows) addTo(map, e)
  return map
}

export interface ExpenseGroup { key: string; label: string; byCurrency: Record<string, CurrencyTotals> }

/** Group totals by category / month (YYYY-MM) / trip; groups sorted by key (months ascending), "no trip" last. */
export function groupExpenses(rows: readonly ExpenseRow[], by: 'category' | 'month' | 'trip', tripLabel: (id: string) => string = id => id): ExpenseGroup[] {
  const groups = new Map<string, ExpenseGroup>()
  for (const e of rows) {
    const key = by === 'category' ? (e.category?.name ?? 'Uncategorised') : by === 'month' ? e.expense_date.slice(0, 7) : (e.trip_id ?? '')
    const label = by === 'trip' ? (key ? tripLabel(key) : 'Not linked to a trip') : key
    const g = groups.get(key) ?? { key: key || 'none', label, byCurrency: {} }
    addTo(g.byCurrency, e)
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === 'none') return 1
    if (b.key === 'none') return -1
    return a.key.localeCompare(b.key)
  })
}
