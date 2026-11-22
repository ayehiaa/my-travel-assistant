import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireHealthUser } from '@/lib/health/healthServer'
import { HealthSettingsUpdateSchema, mergeHealthSettings } from '@/lib/health/healthSettings'
import { loadHealthSettings, p2DbError } from '@/lib/health/p2Server'
import { readVapidConfig } from '@/lib/health/pushConfig'
import { readEmailConfig } from '@/lib/notifications/config'

/** Health settings (units + reminders), owner-only. GET returns settings + which channels are configured. */

export async function GET() {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const supabase = await createClient()
  const { settings, available } = await loadHealthSettings(supabase, auth.user.id)
  return NextResponse.json({
    settings,
    available,
    channels: { email: readEmailConfig(process.env).ok, push: readVapidConfig(process.env).ok },
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  let raw: unknown
  try { raw = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = HealthSettingsUpdateSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' }, { status: 400 })

  const supabase = await createClient()
  const { settings } = await loadHealthSettings(supabase, auth.user.id)
  const next = mergeHealthSettings(settings, parsed.data)
  const { error } = await supabase.from('health_settings').upsert(
    { user_id: auth.user.id, units: next.units, reminders: next.reminders, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (error) return p2DbError(error)
  return NextResponse.json({ settings: next })
}
