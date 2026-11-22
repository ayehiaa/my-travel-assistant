import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'
import { DayTimezoneInputSchema } from '@/lib/health/travel'
import { p2DbError } from '@/lib/health/p2Server'

/**
 * Per-day timezone override (specs/029 US11 travel mode, §9 day boundaries). `timezone: null` clears the dates back
 * to the enrolment timezone. Dates may be past or future (trip days are usually planned ahead).
 */
export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  let raw: unknown
  try { raw = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = DayTimezoneInputSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  const { dates, timezone } = parsed.data

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, auth.user.id)
  if (!enrol.ok) return enrol.response

  const unique = [...new Set(dates)]
  const { error } = timezone === null || timezone === enrol.enrolment.homeTimezone
    ? await supabase.from('health_day_timezones').delete().eq('user_id', auth.user.id).in('local_date', unique)
    : await supabase.from('health_day_timezones').upsert(
        unique.map(d => ({ user_id: auth.user.id, local_date: d, timezone })),
        { onConflict: 'user_id,local_date' },
      )
  if (error) return p2DbError(error)
  return NextResponse.json({ saved: true })
}
