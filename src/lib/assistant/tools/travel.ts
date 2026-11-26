import { zonedParts } from '../text'
import type { ToolInput } from '../toolDefs'
import { appWindow, daysOutsideInWindow, filterExpenses, filterTrips, groupExpenses, summarizeTrip, totalsByCurrency, type ExpenseRow, type TripRow } from '../travelData'
import { ToolError, type ToolContext } from './context'

/** Server only — travel and expense tools. Every query is scoped to ctx.dataOwnerId and also passes RLS. */

const TRIP_COLS = 'id, source, trip_type, days_outside_uk, created_at, legs:trip_legs(from_airport, to_airport, airline, flight_number, departure_at, arrival_at, leg_order)'
const EXPENSE_COLS = 'id, title, amount, currency, expense_date, notes, reclaimed, reclaimed_at, trip_id, category:expense_categories(name)'

async function loadTrips(ctx: ToolContext): Promise<TripRow[]> {
  const { data, error } = await ctx.supabase.from('trips').select(TRIP_COLS).eq('owner_id', ctx.dataOwnerId).limit(2000)
  if (error) throw new ToolError('Could not load trips right now.')
  return (data ?? []) as unknown as TripRow[]
}

async function loadExpenses(ctx: ToolContext, from?: string | null, to?: string | null): Promise<ExpenseRow[]> {
  let q = ctx.supabase.from('expenses').select(EXPENSE_COLS).eq('owner_id', ctx.dataOwnerId)
  if (from) q = q.gte('expense_date', from)
  if (to) q = q.lte('expense_date', to)
  const { data, error } = await q.order('expense_date', { ascending: false }).limit(5000)
  if (error) throw new ToolError('Could not load expenses right now.')
  return ((data ?? []) as unknown as Array<ExpenseRow & { category: unknown }>).map(r => ({
    ...r,
    amount: Number(r.amount),
    category: Array.isArray(r.category) ? (r.category[0] ?? null) : (r.category as ExpenseRow['category']),
  }))
}

const today = (ctx: ToolContext) => zonedParts(ctx.now, ctx.timeZone).date

export async function listTrips(ctx: ToolContext, input: ToolInput<'list_trips'>) {
  const all = filterTrips(await loadTrips(ctx), {
    when: input.when ?? 'all', from: input.from, to: input.to, destinationContains: input.destination_contains,
  }, today(ctx))
  const offset = input.offset ?? 0
  const limit = input.limit ?? 20
  return {
    today: today(ctx),
    filter: { when: input.when ?? 'all', from: input.from ?? null, to: input.to ?? null, destination: input.destination_contains ?? null },
    total: all.length,
    offset,
    trips: all.slice(offset, offset + limit).map(t => ({
      id: t.id, route: t.route, depart: t.start, return_or_last_leg: t.end, legs: t.legs, type: t.type, days_outside_uk: t.daysOutsideUk,
    })),
    note: 'Dates are the departure dates of the first and last flight leg.',
  }
}

export async function tripDetails(ctx: ToolContext, input: ToolInput<'trip_details'>) {
  const { data, error } = await ctx.supabase.from('trips').select(TRIP_COLS).eq('owner_id', ctx.dataOwnerId).eq('id', input.trip_id).maybeSingle()
  if (error) throw new ToolError('Could not load the trip right now.')
  if (!data) throw new ToolError('No trip with that id was found.')
  const row = data as unknown as TripRow
  const s = summarizeTrip(row)
  const expenses = filterExpenses(await loadExpenses(ctx), { tripId: input.trip_id })
  const legs = [...(row.legs ?? [])].sort((a, b) => (a.leg_order ?? 0) - (b.leg_order ?? 0))
  return {
    id: s.id,
    route: s.route,
    type: s.type,
    days_outside_uk: s.daysOutsideUk,
    legs: legs.map(l => ({
      from: l.from_airport, to: l.to_airport, airline: l.airline ?? null, flight: l.flight_number ?? null,
      departure_at: l.departure_at, arrival_at: l.arrival_at ?? null,
    })),
    expenses: {
      count: expenses.length,
      totals_by_currency: totalsByCurrency(expenses),
      items: expenses.slice(0, 30).map(e => ({ date: e.expense_date, title: e.title, amount: e.amount, currency: e.currency, category: e.category?.name ?? null, reclaimed: e.reclaimed })),
    },
  }
}

export async function daysOutsideUk(ctx: ToolContext, input: ToolInput<'days_outside_uk'>) {
  const trips = await loadTrips(ctx)
  const mode = input.mode ?? 'app_window'
  if (mode === 'range') {
    if (!input.from || !input.to) throw new ToolError('mode "range" needs both from and to dates.')
    if (input.from > input.to) throw new ToolError('from must be on or before to.')
    const years = (new Date(input.to).getTime() - new Date(input.from).getTime()) / (365.25 * 86_400_000)
    if (years > 5) throw new ToolError('The range can be at most 5 years.')
    const r = daysOutsideInWindow(trips, input.from, input.to)
    return { mode, window: { from: r.windowStart, to: r.windowEnd }, total_days_outside_uk: r.totalDays, trips: r.trips, rule: 'Departure and return days are not counted.' }
  }
  const { data } = await ctx.supabase.from('user_roles').select('reference_date').eq('user_id', ctx.dataOwnerId).maybeSingle()
  const ref = typeof data?.reference_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(data.reference_date) ? data.reference_date.slice(0, 10) : null
  const end = ref ?? today(ctx)
  const w = appWindow(end)
  const r = daysOutsideInWindow(trips, w.start, w.end)
  return {
    mode,
    window: { from: w.start, to: w.end },
    window_end_source: ref ? 'reference date from Settings' : 'today (no reference date is set in Settings)',
    total_days_outside_uk: r.totalDays,
    allowance_days: 90,
    remaining_of_allowance: Math.max(0, 90 - r.totalDays),
    trips: r.trips,
    rule: 'Rolling 12 months ending at the window end, as on the dashboard. Departure and return days are not counted.',
  }
}

export async function queryExpenses(ctx: ToolContext, input: ToolInput<'query_expenses'>) {
  const rows = filterExpenses(await loadExpenses(ctx, input.from, input.to), {
    category: input.category, tripId: input.trip_id, reclaimed: input.reclaimed ?? 'any', textContains: input.text_contains,
  })
  const offset = input.offset ?? 0
  const limit = input.limit ?? 25
  return {
    filter: {
      from: input.from ?? null, to: input.to ?? null, category: input.category ?? null, trip_id: input.trip_id ?? null,
      reclaimed: input.reclaimed ?? 'any', text: input.text_contains ?? null,
    },
    total: rows.length,
    totals_by_currency: totalsByCurrency(rows),
    offset,
    expenses: rows.slice(offset, offset + limit).map(e => ({
      id: e.id, date: e.expense_date, title: e.title, amount: e.amount, currency: e.currency,
      category: e.category?.name ?? null, trip_id: e.trip_id ?? null, reclaimed: e.reclaimed,
    })),
  }
}

export async function expenseSummary(ctx: ToolContext, input: ToolInput<'expense_summary'>) {
  const rows = filterExpenses(await loadExpenses(ctx, input.from, input.to), { reclaimed: input.reclaimed ?? 'any' })
  let label: (id: string) => string = id => id
  if (input.group_by === 'trip') {
    const trips = new Map((await loadTrips(ctx)).map(t => [t.id, summarizeTrip(t)]))
    label = id => {
      const t = trips.get(id)
      return t ? `${t.route} (${t.start})` : 'Unknown trip'
    }
  }
  return {
    group_by: input.group_by,
    period: { from: input.from ?? null, to: input.to ?? null },
    reclaimed: input.reclaimed ?? 'any',
    expense_count: rows.length,
    totals_by_currency: totalsByCurrency(rows),
    groups: groupExpenses(rows, input.group_by, label).map(g => ({ key: g.key, label: g.label, by_currency: g.byCurrency })),
    note: 'Amounts are per currency as stored; nothing is converted.',
  }
}
