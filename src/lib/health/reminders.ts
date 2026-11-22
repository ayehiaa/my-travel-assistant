import type { ProgrammeDefinition } from './programmeSchema'
import type { Weekday } from './programmeSchema'
import { hhmmToMinutes, minutesToHhmm } from './time'
import { HEALTH_REMINDER_TYPES, type HealthReminderType, type ReminderSettings } from './healthSettings'
import { escapeHtml } from '@/lib/notifications/format'

/**
 * Health reminders (specs/029 US12, phase P2). Pure: when each reminder is scheduled, whether it is due now (cron
 * every 15 min, one-hour catch-up window, quiet hours), what it says, and the email / push renderings.
 * Delivery (email via Resend, Web Push) is in reminderDelivery.ts; idempotency is per user / type / local date.
 */

export const REMINDER_WINDOW_MINUTES = 60

export interface ScheduleContext {
  def: ProgrammeDefinition
  settings: ReminderSettings
  weekday: Weekday
  /** Typical wake / bed times from recent check-ins (or the programme's target bedtime). */
  typicalWake: string | null
  bedtime: string | null
  /** A lifting session is recommended today and not yet done. */
  trainingToday: boolean
  /** First day of a milestone week. */
  milestoneStartsToday: boolean
  /** A fortnight finished yesterday (adjustment proposal available today). */
  adjustmentDayToday: boolean
}

const shift = (hhmm: string, minutes: number): string | null => {
  const m = hhmmToMinutes(hhmm)
  return m === null ? null : minutesToHhmm(m + minutes)
}

/** Scheduled local time of each reminder today (null = not today). */
export function reminderTimes(ctx: ScheduleContext): Record<HealthReminderType, string | null> {
  const { def, settings } = ctx
  const cutoff = def.sleep?.caffeineCutoff ?? def.nutritionRules.find(r => r.type === 'caffeine_cutoff')?.time ?? null
  const meals = def.mealSlots.filter(s => s.isMeal)
  const lastMeal = meals[meals.length - 1] ?? null
  const gapMax = def.sleep?.lastMealGapHours?.[1] ?? def.nutritionRules.find(r => r.type === 'last_meal_before_bed')?.minGapHours ?? null
  let coffee: string | null = null
  if (ctx.trainingToday && settings.trainingTime && cutoff) {
    const t = hhmmToMinutes(settings.trainingTime)!
    const c = hhmmToMinutes(cutoff)!
    coffee = t < c ? shift(settings.trainingTime, -45) : shift(cutoff, -30)
  }
  return {
    morning_checkin:     shift(ctx.typicalWake ?? '07:30', 30),
    pre_training_coffee: coffee,
    caffeine_cutoff:     cutoff ? shift(cutoff, -30) : null,
    evening_gap:         lastMeal ? shift(lastMeal.start, -60) : '18:00',
    bedtime:             ctx.bedtime && gapMax ? shift(ctx.bedtime, -Math.round(gapMax * 60)) : null,
    weekly_review:       ctx.weekday === settings.weeklyReviewDay ? settings.weeklyReviewTime : null,
    milestone_due:       ctx.milestoneStartsToday ? '09:00' : null,
    adjustment_proposal: ctx.adjustmentDayToday ? '09:00' : null,
  }
}

/** Inside quiet hours (start inclusive, end exclusive; wraps midnight when start > end). */
export function inQuietHours(time: string, start: string, end: string): boolean {
  const t = hhmmToMinutes(time), s = hhmmToMinutes(start), e = hhmmToMinutes(end)
  if (t === null || s === null || e === null || s === e) return false
  return s < e ? t >= s && t < e : t >= s || t < e
}

/**
 * Reminder types due at `now`: enabled (master + type), scheduled today, scheduled time ≤ now < time + window, and
 * the scheduled time is outside quiet hours (a reminder that falls in quiet hours is skipped for the day).
 */
export function dueReminderTypes(now: string, times: Record<HealthReminderType, string | null>, settings: ReminderSettings, windowMinutes = REMINDER_WINDOW_MINUTES): HealthReminderType[] {
  if (!settings.enabled || (!settings.channels.email && !settings.channels.push)) return []
  const n = hhmmToMinutes(now)
  if (n === null) return []
  return HEALTH_REMINDER_TYPES.filter(type => {
    if (!settings.types[type]) return false
    const at = times[type]
    const t = at ? hhmmToMinutes(at) : null
    if (t === null || at === null) return false
    if (inQuietHours(at, settings.quietStart, settings.quietEnd)) return false
    return n >= t && n < t + windowMinutes
  })
}

/** Idempotency entity per user / type / local date (also the Inngest event id suffix). */
export function reminderEntityId(userId: string, type: HealthReminderType, localDate: string): string {
  return `${userId}:${type}:${localDate}`
}

// ── Content ─────────────────────────────────────────────────────────────────

export interface ReminderData {
  checkinDone: boolean
  trainingToday: boolean
  trainedToday: boolean
  trainingTime: string | null
  cutoff: string | null
  /** What is still missing today (evening gap), already worded, max 3. */
  gaps: string[]
  bedtime: string | null
  lastMealGapHours: [number, number] | null
  reviewFocus: string[]
  milestone: { week: number; tasks: string[] } | null
  proposal: { kcalChange: number; reasoning: string } | null
}

export interface ReminderContent {
  type: HealthReminderType
  title: string
  body: string
  /** Path inside the app (no origin). */
  path: string
}

/** Wording per type; null = nothing to say (skip: already done, no gap, …). */
export function buildReminder(type: HealthReminderType, d: ReminderData): ReminderContent | null {
  switch (type) {
    case 'morning_checkin':
      return d.checkinDone ? null : { type, title: 'Morning check-in', body: 'Weigh in and log last night\'s sleep — under 30 seconds.', path: '/health' }
    case 'pre_training_coffee': {
      if (!d.trainingToday || d.trainedToday || !d.trainingTime) return null
      const before = d.cutoff && (hhmmToMinutes(d.trainingTime) ?? 0) < (hhmmToMinutes(d.cutoff) ?? 0)
      return before
        ? { type, title: 'Pre-training coffee', body: `Training at ${d.trainingTime} — a black coffee now, about 45 minutes before.`, path: '/health?tab=training' }
        : { type, title: 'No pre-training coffee today', body: `Training at ${d.trainingTime} is after your ${d.cutoff ?? 'caffeine'} cut-off — skip the coffee; sleep matters more than the lift.`, path: '/health?tab=training' }
    }
    case 'caffeine_cutoff':
      return d.cutoff ? { type, title: 'Caffeine cut-off soon', body: `Last caffeinated drink before ${d.cutoff} — decaf after that.`, path: '/health' } : null
    case 'evening_gap':
      return d.gaps.length === 0 ? null : { type, title: 'Still missing today', body: d.gaps.slice(0, 3).join(' · '), path: '/health' }
    case 'bedtime':
      return d.bedtime && d.lastMealGapHours
        ? { type, title: 'Kitchen closing', body: `Last meal now — ${d.lastMealGapHours[0]}–${d.lastMealGapHours[1]} h before your ${d.bedtime} bedtime.`, path: '/health' }
        : null
    case 'weekly_review':
      return { type, title: 'Your weekly review is ready', body: d.reviewFocus.length ? `Focus next week: ${d.reviewFocus[0]}` : 'See how the week went and plan next week\'s food.', path: '/health?tab=progress' }
    case 'milestone_due':
      return d.milestone ? { type, title: `Week ${d.milestone.week} milestone`, body: d.milestone.tasks.slice(0, 4).join(' · '), path: '/health?tab=progress' } : null
    case 'adjustment_proposal':
      return d.proposal && d.proposal.kcalChange !== 0
        ? { type, title: 'Calorie adjustment proposed', body: d.proposal.reasoning, path: '/health?tab=progress' }
        : null
  }
}

export interface PushPayload { title: string; body: string; url: string; tag: string }

export function pushPayload(c: ReminderContent, localDate: string): PushPayload {
  return { title: c.title, body: c.body.slice(0, 240), url: c.path, tag: `health-${c.type}-${localDate}` }
}

export function renderReminderEmail(c: ReminderContent, baseUrl: string): { subject: string; text: string; html: string } {
  const url = `${baseUrl}${c.path}`
  const settings = `${baseUrl}/health?tab=programme#health-settings`
  const text = `${c.title}\n\n${c.body}\n\nOpen: ${url}\n\nTurn reminders off in Health → Programme → Settings: ${settings}\nNot medical advice.`
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(c.title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:32px auto;padding:0 16px;">
<div style="background:#15803d;border-radius:12px 12px 0 0;padding:16px 24px;"><span style="font-size:17px;font-weight:700;color:#fff;">Sojourn Health</span></div>
<div style="background:#fff;border-radius:0 0 12px 12px;padding:24px;">
<h1 style="margin:0 0 12px;font-size:19px;color:#111827;">${escapeHtml(c.title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#374151;">${escapeHtml(c.body)}</p>
<a href="${escapeHtml(url)}" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;font-weight:700;padding:10px 20px;border-radius:999px;font-size:14px;">Open Health</a>
<p style="margin:24px 0 0;font-size:12px;color:#6b7280;">Turn reminders off in <a href="${escapeHtml(settings)}" style="color:#6b7280;">Health settings</a>. Not medical advice.</p>
</div></div></body></html>`
  return { subject: c.title, text, html }
}
