import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'
import { trainingDbError } from '@/lib/health/trainingServer'
import { unlockKey } from '@/lib/health/training'

/**
 * "Approved by my physio" for conditional unlocks that require professional approval (specs/029 US6 #3).
 * approved: true records the approval; false withdraws it.
 */

const InputSchema = z.object({
  unlockKey: z.string().regex(/^[a-z0-9_]{1,40}$/),
  approved:  z.boolean(),
}).strict()

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = InputSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid approval' }, { status: 400 })
  const input = parsed.data

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const unlocks = enrol.enrolment.def.movementRestrictions?.conditionalUnlocks ?? []
  const target = unlocks.find(u => unlockKey(u.movement) === input.unlockKey && u.requires === 'professional_approval')
  if (!target) return NextResponse.json({ error: 'This movement does not need a professional approval' }, { status: 400 })

  if (input.approved) {
    const { error } = await supabase.from('health_professional_approvals').upsert(
      { user_id: user.id, unlock_key: input.unlockKey, approved_at: new Date().toISOString() },
      { onConflict: 'user_id,unlock_key' },
    )
    if (error) return trainingDbError(error)
  } else {
    const { error } = await supabase.from('health_professional_approvals').delete().eq('user_id', user.id).eq('unlock_key', input.unlockKey)
    if (error) return trainingDbError(error)
  }
  return NextResponse.json({ saved: true })
}
