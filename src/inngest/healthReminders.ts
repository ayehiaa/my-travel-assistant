import { z } from 'zod'
import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { deriveAccess, hasFeature } from '@/lib/access'
import { evaluateDay, loadCheckins, loadHealthState, nowFor, plannedBedtime, sleepNightsOf, weighInsOf, type ServerClient } from '@/lib/health/healthServer'
import { loadTrainingContext } from '@/lib/health/trainingServer'
import { loadAdjustments, loadHealthSettings, storeWeeklyReview } from '@/lib/health/p2Server'
import { buildWeeklyReview } from '@/lib/health/reviewServer'
import { sleepSummary } from '@/lib/health/checkin'
import { rankRecommendations } from '@/lib/health/rules'
import { computeProposal, latestFinishedPeriod } from '@/lib/health/adjustment'
import { addDays, weekStart, weekdayOf } from '@/lib/health/time'
import { buildReminder, dueReminderTypes, reminderTimes, type ReminderData } from '@/lib/health/reminders'
import { deliverHealthReminder } from '@/lib/health/reminderDelivery'
import type { HealthReminderType } from '@/lib/health/healthSettings'

/**
 * Health reminders (specs/029 US12, phase P2). One cron every 15 minutes finds users with reminders enabled and the
 * Health add-on, and fans out one event per user per quarter hour. The per-user function works out the user's local
 * time (enrolment timezone, or the per-day travel override), which reminders are due (one-hour catch-up window,
 * quiet hours), what each says, and delivers email + Web Push. Idempotent per user / type / local date.
 * Without the P2 migration there are no settings rows → nobody has reminders enabled → nothing happens.
 */

export const HEALTH_REMINDERS_USER_EVENT = 'health/reminders.user'

export const healthRemindersCron = inngest.createFunction(
  { id: 'health-reminders-cron', triggers: [{ cron: '*/15 * * * *' }], concurrency: { limit: 1 } },
  async ({ step }) => {
    const slot = new Date(Math.floor(Date.now() / (15 * 60_000)) * 15 * 60_000).toISOString()
    const userIds = await step.run('find-users', async (): Promise<string[]> => {
      const admin = createAdminClient()
      const { data, error } = await admin.from('health_settings').select('user_id, reminders')
      if (error || !data) return []
      const enabled = data.filter(r => (r.reminders as { enabled?: unknown } | null)?.enabled === true).map(r => String(r.user_id))
      if (enabled.length === 0) return []
      const { data: roles } = await admin.from('user_roles').select('*').in('user_id', enabled)
      return (roles ?? []).filter(r => hasFeature(deriveAccess(r), 'health')).map(r => String(r.user_id))
    })
    if (userIds.length === 0) return { slot, users: 0 }
    await step.sendEvent('fan-out', userIds.map(user_id => ({
      id: `health-rem-${user_id}-${slot}`,
      name: HEALTH_REMINDERS_USER_EVENT,
      data: { user_id, slot },
    })))
    return { slot, users: userIds.length }
  },
)

const UserEventSchema = z.object({ user_id: z.string().uuid(), slot: z.string() })

export const healthRemindersUser = inngest.createFunction(
  {
    id: 'health-reminders-user',
    triggers: [{ event: HEALTH_REMINDERS_USER_EVENT }],
    retries: 1,
    idempotency: 'event.data.user_id + "-" + event.data.slot',
    concurrency: { limit: 5 },
  },
  async ({ event, step }) => {
    const parsed = UserEventSchema.safeParse(event.data)
    if (!parsed.success) return { status: 'invalid_event' }
    const userId = parsed.data.user_id

    const plan = await step.run('plan', async () => {
      const db = createAdminClient() as unknown as ServerClient
      const { settings } = await loadHealthSettings(db, userId)
      if (!settings.reminders.enabled) return null
      const state = await loadHealthState(db, userId)
      if (state.status !== 'active') return null
      const enrolment = state.enrolment
      const { date, time } = nowFor(enrolment)
      const checkins = await loadCheckins(db, userId, addDays(date, -14), date).catch(() => [])
      const sleep = sleepSummary(sleepNightsOf(checkins), date, enrolment.def)
      const training = await loadTrainingContext(db, userId, enrolment)
      const tctx = training.status === 'ok' ? training.ctx : null
      const trainedToday = !!tctx?.weekWorkouts.some(w => w.date === date && w.status !== 'skipped')
      const trainingToday = !!tctx?.recommendation.sessionKey && !trainedToday
      const milestone = enrolment.def.milestones.find(m => addDays(enrolment.startDate, (m.week - 1) * 7) === date) ?? null
      const period = latestFinishedPeriod(enrolment.def, enrolment.startDate, date)
      const bedtime = plannedBedtime(enrolment.def, checkins, date)
      const times = reminderTimes({
        def: enrolment.def,
        settings: settings.reminders,
        weekday: weekdayOf(date),
        typicalWake: sleep.typicalWakeTime,
        bedtime,
        trainingToday,
        milestoneStartsToday: milestone !== null,
        adjustmentDayToday: !!period && addDays(period.end, 1) === date,
      })
      const due = dueReminderTypes(time, times, settings.reminders)
      if (due.length === 0) return null

      const cutoff = enrolment.def.sleep?.caffeineCutoff ?? null
      const data: ReminderData = {
        checkinDone: checkins.some(c => c.date === date),
        trainingToday,
        trainedToday,
        trainingTime: settings.reminders.trainingTime,
        cutoff,
        gaps: [],
        bedtime,
        lastMealGapHours: enrolment.def.sleep?.lastMealGapHours ?? null,
        reviewFocus: [],
        milestone: milestone ? { week: milestone.week, tasks: milestone.tasks } : null,
        proposal: null,
      }
      if (due.includes('evening_gap')) {
        const ev = await evaluateDay(db, userId, enrolment, date, time).catch(() => null)
        data.gaps = ev ? rankRecommendations(ev.findings.filter(f => f.group !== 'habit')).map(f => f.message) : []
      }
      if (due.includes('weekly_review')) {
        const review = await buildWeeklyReview(db, userId, enrolment, weekStart(date), date).catch(() => null)
        if (review) {
          await storeWeeklyReview(db, userId, review)
          data.reviewFocus = review.focus
        }
      }
      if (due.includes('adjustment_proposal') && period) {
        const decided = await loadAdjustments(db, userId, enrolment.id).then(a => a.some(x => x.periodEnd === period.end)).catch(() => true)
        if (!decided) {
          const p = computeProposal(enrolment.def, enrolment.startDate, weighInsOf(await loadCheckins(db, userId, period.start, period.end).catch(() => [])), period)
          if (p.status === 'proposal') data.proposal = { kcalChange: p.kcalChange, reasoning: p.reasoning }
        }
      }
      const messages = due
        .map(type => buildReminder(type, data))
        .filter((c): c is NonNullable<typeof c> => c !== null)
      return { date, channels: settings.reminders.channels, messages }
    })

    if (!plan || plan.messages.length === 0) return { sent: 0 }
    let sent = 0
    for (const m of plan.messages) {
      const r = await step.run(`send-${m.type as HealthReminderType}`, () => deliverHealthReminder(userId, m, plan.date, plan.channels))
      if (r.email || r.push > 0) sent++
    }
    return { sent }
  },
)
