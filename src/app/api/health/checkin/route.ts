import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CheckinInputSchema } from '@/lib/health/checkin'
import { dbErrorResponse, ensureDailyLog, nowFor, refreshRuleEvents, requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'

/** Morning check-in (specs/029 US2): weight, bed/wake time, supplements taken. One per local date (upsert). */

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = CheckinInputSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid check-in' }, { status: 400 })
  }
  const input = parsed.data

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const { enrolment } = enrol

  if (input.date > nowFor(enrolment).date) return NextResponse.json({ error: 'Cannot check in for a future date' }, { status: 400 })
  const known = new Set(enrolment.def.supplements.map(s => s.key))
  const supplements = [...new Set(input.supplementsTaken)].filter(k => known.has(k))

  const log = await ensureDailyLog(supabase, user.id, input.date)
  if ('error' in log) return dbErrorResponse(log.error)

  const { error } = await supabase.from('health_checkins').upsert({
    user_id:           user.id,
    daily_log_id:      log.id,
    local_date:        input.date,
    weight_kg:         input.weightKg ?? null,
    bed_time:          input.bedTime ?? null,
    wake_time:         input.wakeTime ?? null,
    supplements_taken: supplements,
    updated_at:        new Date().toISOString(),
  }, { onConflict: 'user_id,local_date' })
  if (error) return dbErrorResponse(error)

  await refreshRuleEvents(supabase, user.id, enrolment, input.date)
  return NextResponse.json({ saved: true })
}
