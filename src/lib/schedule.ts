/**
 * Pure schedule logic for scheduled analysis runs (specs/022-scheduler-autopilot).
 *
 * Scheduled runs fire on NYSE trading days at 10:30 America/New_York (one hour after the 9:30 open). Weekends are
 * handled here; exchange holidays are handled at fire time by the Alpaca calendar check (isTradingDayFromCalendar).
 */

export const NY_TIME_ZONE = 'America/New_York'
export const SCHEDULE_HOUR_NY = 10
export const SCHEDULE_MINUTE_NY = 30
/** Inngest cron: weekdays at 10:30 New York time (DST handled by the TZ prefix). */
export const SCHEDULER_CRON = 'TZ=America/New_York 30 10 * * 1-5'
export const SCHEDULE_DESCRIPTION = 'Trading days at 10:30 New York time (15:30 UK)'

// ── Run interval ─────────────────────────────────────────────────────────────

export const RUN_INTERVALS = [1, 7, 14, 30] as const
export type RunInterval = (typeof RUN_INTERVALS)[number]
export const DEFAULT_RUN_INTERVAL: RunInterval = 30

export const RUN_INTERVAL_LABELS: Record<RunInterval, string> = {
  1:  'Daily',
  7:  'Weekly',
  14: 'Fortnightly',
  30: 'Monthly',
}

/**
 * Calendar interval → trading days between scheduled runs. A week has 5 trading days, a month ~21.
 * next run = today (ET) + N weekdays, i.e. "next trading day + (N − 1) trading days".
 */
export const TRADING_DAYS_PER_INTERVAL: Record<RunInterval, number> = {
  1:  1,
  7:  5,
  14: 10,
  30: 21,
}

export function parseRunInterval(raw: unknown): RunInterval {
  const n = typeof raw === 'string' ? Number(raw) : raw
  return (RUN_INTERVALS as readonly unknown[]).includes(n) ? (n as RunInterval) : DEFAULT_RUN_INTERVAL
}

// ── Autopilot mode ───────────────────────────────────────────────────────────

export const AUTOPILOT_MODES = ['off', 'approval', 'auto'] as const
export type AutopilotMode = (typeof AUTOPILOT_MODES)[number]
export const AUTOPILOT_CONFIRM_TEXT = 'ENABLE AUTOPILOT'
export const AUTOPILOT_MIGRATION_WARNING =
  'Autopilot settings could not be saved — the database migration 20261120d_scheduler_autopilot has not been applied yet.'

/** Anything unknown or missing (column not migrated yet) → 'off'. */
export function parseAutopilotMode(raw: unknown): AutopilotMode {
  return raw === 'approval' || raw === 'auto' ? raw : 'off'
}

/** True when switching to `next` needs the typed confirmation (only a change INTO 'auto'). */
export function autopilotChangeNeedsConfirm(current: AutopilotMode, next: AutopilotMode): boolean {
  return next === 'auto' && current !== 'auto'
}

export interface AutopilotSettings {
  mode: AutopilotMode
  run_interval_days: RunInterval
  last_run_at: string | null
  next_run_at: string | null
  /** False until migration 20261120d adds portfolio_settings.autopilot_mode. */
  migration_applied: boolean
}

/** Defensive read of a portfolio_settings row (select('*')); missing row / columns → conservative defaults. */
export function readAutopilotSettings(row: Record<string, unknown> | null | undefined): AutopilotSettings {
  const r = row ?? {}
  return {
    mode:              parseAutopilotMode(r.autopilot_mode),
    run_interval_days: parseRunInterval(r.run_interval_days),
    last_run_at:       typeof r.last_run_at === 'string' ? r.last_run_at : null,
    next_run_at:       typeof r.next_run_at === 'string' ? r.next_run_at : null,
    migration_applied: 'autopilot_mode' in r,
  }
}

// ── New York time ────────────────────────────────────────────────────────────

export interface YMD {
  year: number
  month: number // 1-12
  day: number
}

interface ZonedParts extends YMD {
  hour: number
  minute: number
  second: number
}

const nyFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: NY_TIME_ZONE,
  year:     'numeric',
  month:    '2-digit',
  day:      '2-digit',
  hour:     '2-digit',
  minute:   '2-digit',
  second:   '2-digit',
  hourCycle: 'h23',
})

/** Wall-clock parts of `date` in New York. */
export function nyParts(date: Date): ZonedParts {
  const parts: Record<string, number> = {}
  for (const p of nyFormatter.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return {
    year:   parts.year,
    month:  parts.month,
    day:    parts.day,
    hour:   parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

/** 'YYYY-MM-DD' of the New York calendar date at `date`. */
export function nyDateString(date: Date): string {
  return formatYmd(nyParts(date))
}

export function formatYmd(d: YMD): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

export function parseYmd(s: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

/** Minutes New York is offset from UTC at `date` (e.g. −300 in winter, −240 in summer). */
export function nyOffsetMinutes(date: Date): number {
  const p = nyParts(date)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

/** UTC instant of a New York wall-clock time (DST aware). */
export function nyWallTimeToUtc(d: YMD, hour: number, minute: number): Date {
  const guess = Date.UTC(d.year, d.month - 1, d.day, hour, minute)
  let utc = guess - nyOffsetMinutes(new Date(guess)) * 60000
  // Re-check once: the offset at the corrected instant may differ around a DST switch.
  utc = guess - nyOffsetMinutes(new Date(utc)) * 60000
  return new Date(utc)
}

/** 0 = Sunday … 6 = Saturday, for a calendar date. */
export function weekdayOf(d: YMD): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()
}

export function isWeekend(d: YMD): boolean {
  const w = weekdayOf(d)
  return w === 0 || w === 6
}

export function addCalendarDays(d: YMD, n: number): YMD {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n))
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
}

/** Add `n` (≥ 0) weekdays to a date, skipping Saturdays and Sundays. n = 0 rolls a weekend forward to Monday. */
export function addWeekdays(d: YMD, n: number): YMD {
  let cur = d
  while (isWeekend(cur)) cur = addCalendarDays(cur, 1)
  let left = Math.max(0, Math.floor(n))
  while (left > 0) {
    cur = addCalendarDays(cur, 1)
    if (!isWeekend(cur)) left--
  }
  return cur
}

/**
 * Next scheduled run after a run at `from`: the New York date of `from` plus the interval's trading days
 * (weekends skipped), at 10:30 New York time. Holidays are not known here — a run that lands on one is skipped at
 * fire time by the calendar check and stays due, so it happens on the next trading day.
 */
export function computeNextRunAt(from: Date, interval: RunInterval): Date {
  const base = nyParts(from)
  const target = addWeekdays(base, TRADING_DAYS_PER_INTERVAL[interval])
  return nyWallTimeToUtc(target, SCHEDULE_HOUR_NY, SCHEDULE_MINUTE_NY)
}

/** The next 10:30 New York weekday slot at or after `now` (used for display when nothing is scheduled yet). */
export function nextScheduleSlot(now: Date): Date {
  const today = nyParts(now)
  const todaySlot = nyWallTimeToUtc(today, SCHEDULE_HOUR_NY, SCHEDULE_MINUTE_NY)
  if (!isWeekend(today) && todaySlot.getTime() >= now.getTime()) return todaySlot
  return nyWallTimeToUtc(addWeekdays(addCalendarDays(today, 1), 0), SCHEDULE_HOUR_NY, SCHEDULE_MINUTE_NY)
}

/** Slack so a cron firing a little before the stored 10:30 instant still counts as due. */
export const DUE_TOLERANCE_MS = 30 * 60 * 1000

/** Due when nothing is scheduled yet, the stored time is unreadable, or it is at/before now (+ tolerance). */
export function isDue(nextRunAt: string | null | undefined, now: Date, toleranceMs = DUE_TOLERANCE_MS): boolean {
  if (!nextRunAt) return true
  const t = new Date(nextRunAt).getTime()
  if (!Number.isFinite(t)) return true
  return t <= now.getTime() + toleranceMs
}

/** A user is picked up by the scheduler only with autopilot on and a run due. */
export function isScheduledRunDue(settings: Pick<AutopilotSettings, 'mode' | 'next_run_at'>, now: Date): boolean {
  return settings.mode !== 'off' && isDue(settings.next_run_at, now)
}

// ── Cooldown ─────────────────────────────────────────────────────────────────

export type RunTrigger = 'manual' | 'schedule'

export const MANUAL_COOLDOWN_SECONDS = 24 * 60 * 60
/** Scheduled runs only need the last run to be > 20 h old, so a daily 10:30 schedule always works. */
export const SCHEDULED_COOLDOWN_SECONDS = 20 * 60 * 60

/** Seconds left before another run may start (0 = allowed). */
export function cooldownRemainingSeconds(lastRunAt: string | null | undefined, now: Date, trigger: RunTrigger): number {
  if (!lastRunAt) return 0
  const last = new Date(lastRunAt).getTime()
  if (!Number.isFinite(last)) return 0
  const cooldown = trigger === 'schedule' ? SCHEDULED_COOLDOWN_SECONDS : MANUAL_COOLDOWN_SECONDS
  const elapsed = (now.getTime() - last) / 1000
  return elapsed >= cooldown ? 0 : Math.ceil(cooldown - elapsed)
}

// ── Market calendar ──────────────────────────────────────────────────────────

/** Alpaca `/v2/calendar?start=D&end=D` returns one entry for a trading day and none for a weekend / holiday. */
export function isTradingDayFromCalendar(entries: unknown, date: string): boolean {
  if (!Array.isArray(entries)) return false
  return entries.some(e => !!e && typeof e === 'object' && (e as { date?: unknown }).date === date)
}

// ── Display ──────────────────────────────────────────────────────────────────

/** "Mon 23 Nov, 15:30 UK (10:30 New York)". Explicit time zones, so server and client render the same text. */
export function formatRunTime(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return 'unknown'
  const uk = d.toLocaleString('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
  const ny = d.toLocaleString('en-GB', { timeZone: NY_TIME_ZONE, hour: '2-digit', minute: '2-digit' })
  return `${uk} UK (${ny} New York)`
}
