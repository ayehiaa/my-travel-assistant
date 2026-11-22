import type { ActiveEnrolment } from '@/lib/health/healthServer'
import { nowFor } from '@/lib/health/healthServer'
import { weekdayOf } from '@/lib/health/time'
import { CARD, CARD_TITLE } from './ui'

/** Placeholder until the training player (specs/029 phase P1b). Shows the programme's schedule for today. */
export default function TrainingTab({ enrolment }: { enrolment: ActiveEnrolment }) {
  const today = nowFor(enrolment).date
  const scheduled = enrolment.def.weeklySchedule?.days.find(d => d.day === weekdayOf(today))
  return (
    <section className={CARD}>
      <h2 className={CARD_TITLE}>Training — coming next</h2>
      <p className="text-sm text-[var(--ink-2)]">The guided session player (sets, reps, rest timer, progression and joint checks) is coming in the next update.</p>
      {scheduled && <p className="mt-2 text-sm text-[var(--ink)]">Today&apos;s plan: <strong>{scheduled.label}</strong></p>}
    </section>
  )
}
