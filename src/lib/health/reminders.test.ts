import { describe, it, expect } from 'vitest'
import { SEED_PROGRAMME as def } from './seedProgramme'
import { DEFAULT_REMINDERS } from './healthSettings'
import { buildReminder, dueReminderTypes, inQuietHours, pushPayload, reminderEntityId, reminderTimes, renderReminderEmail, type ReminderData, type ScheduleContext } from './reminders'

const settings = { ...DEFAULT_REMINDERS, enabled: true, trainingTime: '12:00' }
const ctx = (over: Partial<ScheduleContext> = {}): ScheduleContext => ({
  def, settings, weekday: 'mon', typicalWake: '07:00', bedtime: '23:00', trainingToday: true, milestoneStartsToday: false, adjustmentDayToday: false, ...over,
})
const data = (over: Partial<ReminderData> = {}): ReminderData => ({
  checkinDone: false, trainingToday: true, trainedToday: false, trainingTime: '12:00', cutoff: '14:00', gaps: [], bedtime: '23:00',
  lastMealGapHours: [2, 3], reviewFocus: [], milestone: null, proposal: null, ...over,
})

describe('reminderTimes', () => {
  it('schedules from wake, cut-off, dinner, bedtime and training time', () => {
    const t = reminderTimes(ctx())
    expect(t).toMatchObject({
      morning_checkin: '07:30', pre_training_coffee: '11:15', caffeine_cutoff: '13:30', evening_gap: '18:00', bedtime: '20:00',
      weekly_review: null, milestone_due: null, adjustment_proposal: null,
    })
    expect(reminderTimes(ctx({ settings: { ...settings, trainingTime: '18:00' } })).pre_training_coffee).toBe('13:30')
    expect(reminderTimes(ctx({ trainingToday: false })).pre_training_coffee).toBeNull()
    expect(reminderTimes(ctx({ weekday: 'sun', milestoneStartsToday: true })).weekly_review).toBe('18:00')
  })
})

describe('dueReminderTypes', () => {
  const times = reminderTimes(ctx())
  it('due within the hour after its time; off when disabled', () => {
    expect(dueReminderTypes('07:30', times, settings)).toEqual(['morning_checkin'])
    expect(dueReminderTypes('08:29', times, settings)).toEqual(['morning_checkin'])
    expect(dueReminderTypes('08:30', times, settings)).toEqual([])
    expect(dueReminderTypes('07:30', times, { ...settings, enabled: false })).toEqual([])
    expect(dueReminderTypes('07:30', times, { ...settings, types: { ...settings.types, morning_checkin: false } })).toEqual([])
    expect(dueReminderTypes('07:30', times, { ...settings, channels: { email: false, push: false } })).toEqual([])
  })
  it('skips reminders scheduled in quiet hours', () => {
    expect(dueReminderTypes('07:30', times, { ...settings, quietEnd: '08:00' })).toEqual([])
    expect(inQuietHours('23:30', '22:00', '07:00')).toBe(true)
    expect(inQuietHours('06:59', '22:00', '07:00')).toBe(true)
    expect(inQuietHours('07:00', '22:00', '07:00')).toBe(false)
    expect(inQuietHours('13:00', '12:00', '14:00')).toBe(true)
  })
})

describe('buildReminder', () => {
  it('skips when there is nothing to say', () => {
    expect(buildReminder('morning_checkin', data({ checkinDone: true }))).toBeNull()
    expect(buildReminder('evening_gap', data())).toBeNull()
    expect(buildReminder('pre_training_coffee', data({ trainedToday: true }))).toBeNull()
    expect(buildReminder('adjustment_proposal', data({ proposal: { kcalChange: 0, reasoning: 'x' } }))).toBeNull()
  })
  it('words each type', () => {
    expect(buildReminder('pre_training_coffee', data())?.body).toMatch(/45 minutes before/)
    expect(buildReminder('pre_training_coffee', data({ trainingTime: '18:00' }))?.body).toMatch(/skip the coffee/)
    expect(buildReminder('evening_gap', data({ gaps: ['No pulse yet', '20 g protein short'] }))?.body).toBe('No pulse yet · 20 g protein short')
    expect(buildReminder('bedtime', data())?.body).toMatch(/2–3 h before your 23:00/)
    expect(buildReminder('milestone_due', data({ milestone: { week: 6, tasks: ['Mid-point review'] } }))?.title).toBe('Week 6 milestone')
  })
  it('renders email (escaped) and push payloads', () => {
    const c = buildReminder('evening_gap', data({ gaps: ['<b>pulses</b>'] }))!
    const e = renderReminderEmail(c, 'https://app.example')
    expect(e.html).toContain('&lt;b&gt;pulses')
    expect(e.text).toContain('https://app.example/health')
    expect(pushPayload(c, '2026-11-22')).toMatchObject({ url: '/health', tag: 'health-evening_gap-2026-11-22' })
    expect(reminderEntityId('u1', 'bedtime', '2026-11-22')).toBe('u1:bedtime:2026-11-22')
  })
})
