import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireHealthUser } from '@/lib/health/healthServer'
import { PushSubscriptionInputSchema, PushUnsubscribeSchema, readVapidConfig } from '@/lib/health/pushConfig'
import { p2DbError } from '@/lib/health/p2Server'

/**
 * Web Push subscriptions for Health reminders (specs/029 US12). GET → the VAPID public key (null when push is not
 * configured on the server); POST → store this browser's subscription; DELETE → remove it.
 */

export async function GET() {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const vapid = readVapidConfig(process.env)
  return NextResponse.json({ publicKey: vapid.ok ? vapid.publicKey : null })
}

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  if (!readVapidConfig(process.env).ok) return NextResponse.json({ error: 'Push notifications are not configured on this server' }, { status: 503 })
  let raw: unknown
  try { raw = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = PushSubscriptionInputSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 })
  const sub = parsed.data

  const supabase = await createClient()
  // An endpoint belongs to one browser profile; a re-subscribe by another user replaces nothing they own (RLS).
  const { error } = await supabase.from('health_push_subscriptions').upsert({
    user_id: auth.user.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: (request.headers.get('user-agent') ?? '').slice(0, 300) || null,
    failure_count: 0,
  }, { onConflict: 'endpoint' })
  if (error) return p2DbError(error)
  return NextResponse.json({ subscribed: true })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  let raw: unknown
  try { raw = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = PushUnsubscribeSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const supabase = await createClient()
  const { error } = await supabase.from('health_push_subscriptions').delete().eq('user_id', auth.user.id).eq('endpoint', parsed.data.endpoint)
  if (error) return p2DbError(error)
  return NextResponse.json({ unsubscribed: true })
}
