import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { ensureDailyLog, nowFor, requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'
import { CardioInputSchema, StepsInputSchema, checkCardioInput, intervalsUnlock } from '@/lib/health/cardio'
import { loadTrainingContext } from '@/lib/health/trainingServer'
import { recoveryOk } from '@/lib/health/painRules'
import { p2DbError } from '@/lib/health/p2Server'
import { programmeWeek } from '@/lib/health/time'

/**
 * Cardio sessions and daily steps (specs/029 US7, phase P2).
 * POST { kind: 'cardio', ... } — avoid-list types return 409 { needsConfirmation } until confirmAvoid is sent;
 *      intervals only when unlocked (week ≥ 5, pain rule passed, recovery OK).
 * POST { kind: 'steps', date, steps } — upsert per date.
 * DELETE ?id=<cardio session id>
 */

const BodySchema = z.discriminatedUnion('kind', [
  CardioInputSchema.extend({ kind: z.literal('cardio') }),
  StepsInputSchema.extend({ kind: z.literal('steps') }),
])

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let raw: unknown
  try { raw = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  const input = parsed.data

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const { enrolment } = enrol
  const today = nowFor(enrolment).date
  if (input.date > today) return NextResponse.json({ error: 'Cannot log a future date' }, { status: 400 })

  if (input.kind === 'steps') {
    const { error } = await supabase.from('health_steps').upsert(
      { user_id: user.id, local_date: input.date, steps: input.steps, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,local_date' },
    )
    if (error) return p2DbError(error)
    return NextResponse.json({ saved: true })
  }

  let unlock = intervalsUnlock(enrolment.def, { week: null, painRulePassed: false, recoveryOk: false })
  if (input.intervals) {
    const t = await loadTrainingContext(supabase, user.id, enrolment)
    if (t.status === 'ok') {
      unlock = intervalsUnlock(enrolment.def, {
        week: programmeWeek(enrolment.startDate, today),
        painRulePassed: t.ctx.painPassed,
        recoveryOk: recoveryOk(enrolment.def.painRules, t.ctx.checks),
      })
    }
  }
  const check = checkCardioInput(enrolment.def, input, unlock)
  if (!check.ok) return NextResponse.json({ error: check.error, needsConfirmation: check.needsConfirmation ?? false }, { status: check.status })

  const log = await ensureDailyLog(supabase, user.id, input.date)
  if ('error' in log) return p2DbError(log.error)
  const { error } = await supabase.from('health_cardio_sessions').insert({
    user_id: user.id,
    daily_log_id: log.id,
    local_date: input.date,
    cardio_type: input.type,
    minutes: input.minutes,
    avg_hr: input.avgHr ?? null,
    intervals: input.intervals,
    notes: input.notes ?? null,
  })
  if (error) return p2DbError(error)
  return NextResponse.json({ saved: true })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const supabase = await createClient()
  const { data, error } = await supabase.from('health_cardio_sessions').delete().eq('id', id).eq('user_id', auth.user.id).select('id')
  if (error) return p2DbError(error)
  if (!data || data.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
