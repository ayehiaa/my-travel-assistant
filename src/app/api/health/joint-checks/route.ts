import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { nowFor, requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'
import { trainingDbError } from '@/lib/health/trainingServer'
import { JointCheckInputSchema, knownRedFlags } from '@/lib/health/painRules'

/**
 * Joint checks (specs/029 US6): the next-morning answer (pain 0–10, swelling, red flags from the programme list) and
 * the user's "my physiotherapist has cleared me" confirmation after a red flag.
 */
export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = JointCheckInputSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid joint check' }, { status: 400 })
  const input = parsed.data

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const { enrolment } = enrol
  const today = nowFor(enrolment).date

  const { data: existing, error: readErr } = await supabase
    .from('health_joint_checks')
    .select('id, local_date, red_flags')
    .eq('id', input.checkId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (readErr) return trainingDbError(readErr)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date().toISOString()
  if (input.action === 'next_morning') {
    if (String(existing.local_date) >= today) return NextResponse.json({ error: 'The next-morning check opens the day after the session' }, { status: 400 })
    const redFlags = knownRedFlags(enrolment.def.painRules, input.redFlags)
    const { error } = await supabase.from('health_joint_checks').update({
      next_morning_pain: input.nextMorningPain,
      next_morning_date: today,
      swelling: input.swelling,
      red_flags: redFlags,
      // A new red flag always needs a fresh clearance.
      ...(redFlags.length > 0 ? { physio_cleared: false, cleared_on: null } : {}),
      updated_at: now,
    }).eq('id', input.checkId).eq('user_id', user.id)
    if (error) return trainingDbError(error)
    return NextResponse.json({ saved: true, redFlag: redFlags.length > 0 })
  }

  const flags = Array.isArray(existing.red_flags) ? existing.red_flags : []
  if (flags.length === 0) return NextResponse.json({ error: 'There is no red flag to clear on this check' }, { status: 400 })
  const { error } = await supabase.from('health_joint_checks').update({
    physio_cleared: true,
    cleared_on: today,
    updated_at: now,
  }).eq('id', input.checkId).eq('user_id', user.id)
  if (error) return trainingDbError(error)
  return NextResponse.json({ saved: true })
}
