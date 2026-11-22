import { HHMM_RE, WEEKDAYS, type Weekday } from './programmeSchema'

/**
 * Pure date/time helpers for Health day boundaries (specs/029 §9: day boundaries in the user's timezone).
 * Local dates are 'YYYY-MM-DD'; local times are 'HH:MM'; minutes are minutes since local midnight.
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parts(instant: Date, timeZone: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const out: Record<string, string> = {}
  for (const p of fmt.formatToParts(instant)) out[p.type] = p.value
  return out
}

/** Local calendar date of an instant in a timezone. */
export function localDate(instant: Date, timeZone: string): string {
  const p = parts(instant, timeZone)
  return `${p.year}-${p.month}-${p.day}`
}

/** Local wall-clock time 'HH:MM' of an instant in a timezone. */
export function localTime(instant: Date, timeZone: string): string {
  const p = parts(instant, timeZone)
  return `${p.hour}:${p.minute}`
}

export function hhmmToMinutes(hhmm: string): number | null {
  if (!HHMM_RE.test(hhmm)) return null
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function minutesToHhmm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Valid calendar date string (rejects 2026-02-30). */
export function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false
  const d = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function weekdayOf(date: string): Weekday {
  // getUTCDay: 0 = Sunday
  const idx = new Date(`${date}T00:00:00Z`).getUTCDay()
  return WEEKDAYS[(idx + 6) % 7]
}

/** Monday of the ISO week containing `date`. */
export function weekStart(date: string): string {
  return addDays(date, -WEEKDAYS.indexOf(weekdayOf(date)))
}

/** Days left in the ISO week including `date` (Mon → 7, Sun → 1). */
export function daysLeftInWeek(date: string): number {
  return 7 - WEEKDAYS.indexOf(weekdayOf(date))
}

// ── Programme weeks (spec 029 P3.2: starter week + Monday-aligned weeks) ──────

/**
 * First Monday of the programme: the start date when it is a Monday, else the Monday after it. Week 1 begins here;
 * the days from a non-Monday start to the following Sunday are the "starter week" (week 0).
 */
export function firstProgrammeMonday(startDate: string): string {
  const offset = WEEKDAYS.indexOf(weekdayOf(startDate))
  return offset === 0 ? startDate : addDays(startDate, 7 - offset)
}

/** The programme has a starter week (start date is not a Monday). */
export function hasStarterWeek(startDate: string): boolean {
  return weekdayOf(startDate) !== 'mon'
}

/** Last day of the programme: first Monday + 7 × duration − 1 (a Sunday). */
export function programmeEndDate(startDate: string, durationWeeks: number): string {
  return addDays(firstProgrammeMonday(startDate), 7 * durationWeeks - 1)
}

/**
 * Programme week for a date: null before the start, 0 in the starter week (non-Monday start → that Sunday),
 * 1..N for the Mon–Sun weeks from the first programme Monday (not clamped: past the end returns N+1, N+2, …).
 */
export function programmeWeek(startDate: string, date: string): number | null {
  if (date < startDate) return null
  const d = daysBetween(firstProgrammeMonday(startDate), date)
  if (d < 0) return 0
  return Math.floor(d / 7) + 1
}

/** First day of programme week `week`: week ≤ 0 → the start date; week ≥ 1 → its Monday. */
export function programmeWeekStart(startDate: string, week: number): string {
  if (week <= 0) return startDate
  return addDays(firstProgrammeMonday(startDate), (week - 1) * 7)
}

export interface WeekWindow {
  /** First counted day: max(Monday of the week, start date). */
  weekStart: string
  /** Sunday of the ISO week. */
  weekEnd: string
  /** Days in the window (1–7). */
  days: number
  /** days / 7. */
  fraction: number
  /** The window is the starter week (start date after that week's Monday). */
  isStarter: boolean
}

/**
 * The programme window of the ISO week containing `date`: Monday–Sunday, clipped to start at the start date in the
 * starter week. Dates before the start week → the full ISO week (not a starter week).
 */
export function weekWindow(startDate: string, date: string): WeekWindow {
  const monday = weekStart(date)
  const weekEnd = addDays(monday, 6)
  const isStarter = startDate > monday && startDate <= weekEnd
  const start = isStarter ? startDate : monday
  const days = daysBetween(start, weekEnd) + 1
  return { weekStart: start, weekEnd, days, fraction: days / 7, isStarter }
}

const DOW_SHORT: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'Fri–Sun' from a date to that Sunday ('Sun' alone for a Sunday). */
function dayRange(from: string): string {
  const d = weekdayOf(from)
  return d === 'sun' ? 'Sun' : `${DOW_SHORT[d]}–Sun`
}

/** 'Mon 23 Nov' for a local date. */
export function shortDayLabel(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${DOW_SHORT[weekdayOf(date)]} ${d} ${MONTHS[m - 1]}`
}

/**
 * Display label for the programme week of `date`: "Starter week · 3 days (Fri–Sun) · Week 1 starts Mon 23 Nov" in
 * week 0, "Week X of N" during the programme, null before the start or after the end.
 */
export function programmeWeekLabel(startDate: string, date: string, durationWeeks: number): string | null {
  const week = programmeWeek(startDate, date)
  if (week === null || week > durationWeeks) return null
  if (week === 0) {
    const w = weekWindow(startDate, date)
    const range = dayRange(w.weekStart)
    return `Starter week · ${w.days} day${w.days === 1 ? '' : 's'} (${range}) · Week 1 starts ${shortDayLabel(firstProgrammeMonday(startDate))}`
  }
  return `Week ${week} of ${durationWeeks}`
}

/** Header for a starter-week review: "Starter week (Fri–Sun)". */
export function starterWeekRangeLabel(startDate: string): string {
  return `Starter week (${dayRange(startDate)})`
}

/** Weekly target pro-rated to a window: round(target × fraction), never below 0. */
export function proRate(target: number, fraction: number): number {
  return Math.max(0, Math.round(target * fraction))
}

/**
 * UTC instant for a local date + time in a timezone (DST-safe to the minute for real wall-clock times).
 * Used to turn "eaten at 13:20 today" into a timestamp.
 */
export function zonedInstant(date: string, hhmm: string, timeZone: string): Date {
  const minutes = hhmmToMinutes(hhmm) ?? 0
  const guess = new Date(`${date}T${minutesToHhmm(minutes)}:00Z`)
  // Offset of the zone at the guess; apply twice to settle across DST transitions.
  let instant = guess
  for (let i = 0; i < 2; i++) {
    const p = parts(instant, timeZone)
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
    instant = new Date(instant.getTime() - (asUtc - guess.getTime()))
  }
  return instant
}
