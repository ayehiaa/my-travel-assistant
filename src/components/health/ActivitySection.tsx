import { createClient } from '@/lib/supabase/server'
import type { ActiveEnrolment } from '@/lib/health/healthServer'
import { loadCardio, loadSteps, P2MigrationNeeded } from '@/lib/health/p2Server'
import { cardioTypeOptions, hrFlagMessage, hrZoneFlag, intervalsUnlock, stepsStatus, stepsTargetLabel, weeklyCardio } from '@/lib/health/cardio'
import { recoveryOk, type JointCheck } from '@/lib/health/painRules'
import { addDays, programmeWeek, weekStart } from '@/lib/health/time'
import ActivityCard, { type ActivityCardProps } from './ActivityCard'
import HealthNotice from './HealthNotice'

export type ActivityLoad =
  | { status: 'ok'; props: Omit<ActivityCardProps, 'title'> }
  | { status: 'error' }

/** Loads the week's cardio + the day's steps as ActivityCard props (migration missing → the card's notice). */
export async function loadActivityProps({ userId, enrolment, date, painPassed, checks }: {
  userId: string; enrolment: ActiveEnrolment; date: string; painPassed: boolean | null; checks: JointCheck[]
}): Promise<ActivityLoad> {
  const supabase = await createClient()
  const def = enrolment.def
  const monday = weekStart(date)
  let cardio: Awaited<ReturnType<typeof loadCardio>> = []
  let steps: Awaited<ReturnType<typeof loadSteps>> = []
  let migrationNeeded = false
  try {
    ;[cardio, steps] = await Promise.all([loadCardio(supabase, userId, monday, addDays(monday, 6)), loadSteps(supabase, userId, date, date)])
  } catch (err) {
    if (err instanceof P2MigrationNeeded) migrationNeeded = true
    else return { status: 'error' }
  }
  const wk = weeklyCardio(def, cardio, date, enrolment.startDate)
  const daySteps = steps.find(s => s.date === date)?.steps ?? null
  const z = def.cardio?.intensity
  const unlock = painPassed !== null && def.cardio?.unlockables.some(u => /interval/i.test(u.name))
    ? intervalsUnlock(def, { week: programmeWeek(enrolment.startDate, date), painRulePassed: painPassed === true, recoveryOk: recoveryOk(def.painRules, checks) })
    : null
  return {
    status: 'ok',
    props: {
      date,
      typeOptions: cardioTypeOptions(def),
      avoidTypes: def.cardio?.avoid ?? [],
      zone: z ? { zone: z.zone, bpmMin: z.bpmMin ?? null, bpmMax: z.bpmMax ?? null } : null,
      weekly: { minutes: wk.minutes, target: wk.targetMinutes, note: wk.starter ? `Starter week: ${wk.targetSessions ?? 0} session${wk.targetSessions === 1 ? '' : 's'} in ${wk.days} day${wk.days === 1 ? '' : 's'}` : null },
      sessions: cardio.filter(c => c.date === date).map(c => ({
        id: c.id ?? '', type: c.type, minutes: c.minutes, avgHr: c.avgHr, intervals: c.intervals,
        hrMessage: hrFlagMessage(def, hrZoneFlag(def, c.avgHr)),
      })),
      steps: daySteps,
      stepsTarget: stepsTargetLabel(def),
      stepsStatus: stepsStatus(def, daySteps),
      intervals: unlock ? { available: unlock.available, reason: unlock.reason, prescription: unlock.prescription } : null,
      migrationNeeded,
    },
  }
}

/** Server wrapper: loads the week's cardio + the day's steps and renders the ActivityCard (specs/029 US7). */
export default async function ActivitySection({ title, ...args }: {
  userId: string
  enrolment: ActiveEnrolment
  date: string
  /** From the training context; null when unavailable (the intervals option is then hidden). */
  painPassed: boolean | null
  checks: JointCheck[]
  title?: string
}) {
  const r = await loadActivityProps(args)
  if (r.status === 'error') return <HealthNotice title="Could not load cardio">Try again shortly.</HealthNotice>
  return <ActivityCard {...r.props} title={title} />
}
