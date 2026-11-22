import type { ActiveEnrolment, ServerClient } from '@/lib/health/healthServer'
import { loadCheckins, weighInsOf } from '@/lib/health/healthServer'
import { loadAdjustments, P2MigrationNeeded } from '@/lib/health/p2Server'
import { applyKcalChange, computeProposal, latestFinishedPeriod, type AdjustmentProposal } from '@/lib/health/adjustment'
import type { StoredAdjustment } from '@/lib/health/adjustment'
import AdjustmentCard from './AdjustmentCard'
import { CARD, CARD_TITLE } from './ui'

export interface AdjustmentState {
  available: boolean
  pending: AdjustmentProposal | null
  history: StoredAdjustment[]
}

/** Current fortnight proposal (undecided) + decision history. Best effort: unavailable when the P2 tables are missing. */
export async function loadAdjustmentState(supabase: ServerClient, userId: string, enrolment: ActiveEnrolment, today: string): Promise<AdjustmentState> {
  const period = latestFinishedPeriod(enrolment.def, enrolment.startDate, today)
  let history: StoredAdjustment[] = []
  try {
    history = await loadAdjustments(supabase, userId, enrolment.id)
  } catch (err) {
    return { available: !(err instanceof P2MigrationNeeded), pending: null, history: [] }
  }
  if (!period || history.some(h => h.periodEnd === period.end)) return { available: true, pending: null, history }
  const checkins = await loadCheckins(supabase, userId, period.start, period.end).catch(() => [])
  return { available: true, pending: computeProposal(enrolment.def, enrolment.startDate, weighInsOf(checkins), period), history }
}

/** Proposal card (accept / decline) or, with `showInsufficient`, the "not enough weigh-ins" explanation. */
export function AdjustmentProposalView({ enrolment, proposal, showInsufficient }: { enrolment: ActiveEnrolment; proposal: AdjustmentProposal | null; showInsufficient?: boolean }) {
  if (!proposal) return null
  if (proposal.status !== 'proposal') {
    if (!showInsufficient) return null
    return (
      <section className={CARD}>
        <h2 className={CARD_TITLE}>Fortnightly check</h2>
        <p className="text-sm text-[var(--ink-2)]">{proposal.reasoning}</p>
      </section>
    )
  }
  const next = applyKcalChange(enrolment.targets, proposal.kcalChange, { sex: enrolment.profile?.sex, minKcal: enrolment.def.energy?.minKcal })
  return (
    <AdjustmentCard
      periodEnd={proposal.period.end}
      kcalChange={proposal.kcalChange}
      reasoning={proposal.reasoning}
      caveat={proposal.caveat}
      currentKcal={enrolment.targets.kcal}
      newKcal={next.kcal}
      currentCarbsG={enrolment.targets.carbsG}
      newCarbsG={next.carbsG}
    />
  )
}
