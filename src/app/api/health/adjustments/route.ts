import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'
import { dbErrorResponse, loadCheckins, nowFor, requireEnrolment, requireHealthUser, weighInsOf } from '@/lib/health/healthServer'
import { AdjustmentDecisionSchema, applyKcalChange, computeProposal, latestFinishedPeriod } from '@/lib/health/adjustment'
import { p2DbError } from '@/lib/health/p2Server'

/**
 * Accept or decline the fortnightly adjustment proposal (specs/029 §6.3, US8). The proposal is recomputed here from
 * stored weigh-ins (the client only names the period). Accept → effective targets updated (protein kept, kcal from
 * carbs) + history row + audit; decline → history row + audit. One decision per enrolment + period.
 */
export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let raw: unknown
  try { raw = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = AdjustmentDecisionSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  const { periodEnd, decision } = parsed.data

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const { enrolment } = enrol
  const today = nowFor(enrolment).date

  const period = latestFinishedPeriod(enrolment.def, enrolment.startDate, today)
  if (!period || period.end !== periodEnd) return NextResponse.json({ error: 'That proposal is no longer current — reload the page' }, { status: 409 })

  let checkins: Awaited<ReturnType<typeof loadCheckins>>
  try { checkins = await loadCheckins(supabase, user.id, period.start, period.end) }
  catch { return NextResponse.json({ error: 'Could not load your weigh-ins' }, { status: 500 }) }
  const proposal = computeProposal(enrolment.def, enrolment.startDate, weighInsOf(checkins), period)
  if (proposal.status !== 'proposal') return NextResponse.json({ error: 'Not enough weigh-ins for a proposal this fortnight' }, { status: 409 })

  const before = enrolment.targets
  const after = decision === 'accept' && proposal.kcalChange !== 0
    ? applyKcalChange(before, proposal.kcalChange, { sex: enrolment.profile?.sex, minKcal: enrolment.def.energy?.minKcal })
    : before

  const { data: row, error } = await supabase.from('health_adjustments').insert({
    user_id: user.id,
    enrolment_id: enrolment.id,
    period_end: period.end,
    status: decision === 'accept' ? 'accepted' : 'declined',
    kcal_change: decision === 'accept' ? after.kcal - before.kcal : 0,
    loss_kg: proposal.lossKg,
    reasoning: proposal.reasoning,
    targets_before: before,
    targets_after: after,
  }).select('id').single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'You already decided on this fortnight' }, { status: 409 })
    return p2DbError(error)
  }

  if (after !== before) {
    const { error: upd } = await supabase.from('health_enrolments')
      .update({ effective_targets: after, updated_at: new Date().toISOString() })
      .eq('id', enrolment.id).eq('user_id', user.id)
    if (upd) {
      await supabase.from('health_adjustments').delete().eq('id', row.id)
      return dbErrorResponse(upd)
    }
  }

  try {
    // Only the decision and the kcal change — no weights or other health values in the audit log.
    await logAudit({
      performedBy: user.id,
      action: decision === 'accept' ? 'health_adjustment_accepted' : 'health_adjustment_declined',
      tripId: null,
      changedFields: { kcal_target: { before: before.kcal, after: after.kcal }, period_end: { before: null, after: period.end } },
    })
  } catch {
    // best effort
  }
  return NextResponse.json({ saved: true, targets: after })
}
