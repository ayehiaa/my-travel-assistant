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

/** Programme week (1-based) for a date, or null before the start. */
export function programmeWeek(startDate: string, date: string): number | null {
  const d = daysBetween(startDate, date)
  if (d < 0) return null
  return Math.floor(d / 7) + 1
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
