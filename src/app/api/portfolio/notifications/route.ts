import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { hasFeature } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'
import { readEmailConfig } from '@/lib/notifications/config'
import {
  NOTIFICATIONS_MIGRATION_WARNING,
  NotificationPrefsUpdateSchema,
  mergeNotificationPrefs,
  readNotificationPrefs,
} from '@/lib/notifications/prefs'

// ── GET ───────────────────────────────────────────────────────────────────────
// Effective notification preferences (defaults when the row / column is missing) + whether email is configured.

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasFeature(user.access, 'portfolio')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const row = data as Record<string, unknown> | null
  return NextResponse.json({
    prefs:              readNotificationPrefs(row),
    email_configured:   readEmailConfig(process.env).ok,
    migration_applied:  row !== null && 'notification_prefs' in row,
  })
}

// ── PUT ───────────────────────────────────────────────────────────────────────
// Partial update { enabled?, types?: { <type>: boolean } }. Written best-effort: a missing column returns a warning.

export async function PUT(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasFeature(user.access, 'portfolio')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const parsed = NotificationPrefsUpdateSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const supabase = await createClient()
  await supabase
    .from('portfolio_settings')
    .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })

  const { data: row } = await supabase
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  const before = readNotificationPrefs(row as Record<string, unknown> | null)
  const next = mergeNotificationPrefs(before, parsed.data)

  const { data: written, error } = await supabase
    .from('portfolio_settings')
    .update({ notification_prefs: next, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select('user_id')

  if (error || !written || written.length === 0) {
    return NextResponse.json({ prefs: before, warning: NOTIFICATIONS_MIGRATION_WARNING })
  }

  await logAudit({
    performedBy:   user.id,
    action:        'portfolio_settings_updated',
    tripId:        null,
    changedFields: {
      notification_prefs: {
        before: { enabled: before.enabled, types: before.types },
        after:  { enabled: next.enabled, types: next.types },
      },
    },
  })

  return NextResponse.json({ prefs: next, warning: null })
}
