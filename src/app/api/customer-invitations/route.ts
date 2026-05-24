import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCustomerInvitationEmail } from '@/lib/email'

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

const postSchema = z.object({
  email: z.string().email(),
  invitedName: z.string().min(1).max(100),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: roleRecord } = await supabase
    .from('user_roles')
    .select('role, display_name')
    .eq('user_id', user.id)
    .single()

  if (roleRecord?.role !== 'premium' && roleRecord?.role !== 'premium_plus') {
    return NextResponse.json({ error: 'Premium accounts only' }, { status: 403 })
  }

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const parsed = postSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { email, invitedName } = parsed.data
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('customer_invitations')
    .select('id, status')
    .eq('invited_by', user.id)
    .eq('email', email)
    .in('status', ['pending', 'accepted'])
    .maybeSingle()

  if (existing) {
    const msg = existing.status === 'accepted'
      ? 'This email has already accepted an invitation'
      : 'A pending invitation for this email already exists'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + THREE_DAYS_MS)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const { data: invitation, error: insertError } = await admin
    .from('customer_invitations')
    .insert({
      invited_by: user.id,
      email,
      invited_name: invitedName,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, email, invited_name, status, expires_at, invited_at, invited_by, token')
    .single()

  if (insertError || !invitation) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const signupLink = `${appUrl}/signup?token=${invitation.token}`

  await sendCustomerInvitationEmail({
    toEmail: email,
    toName: invitedName,
    invitedBy: roleRecord.display_name,
    signupLink,
    expiresAt,
  })

  const { token: omit, ...safeInvitation } = invitation
  void omit
  return NextResponse.json(safeInvitation, { status: 201 })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: roleRecord } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (roleRecord?.role !== 'premium' && roleRecord?.role !== 'premium_plus') {
    return NextResponse.json({ error: 'Premium accounts only' }, { status: 403 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  await admin
    .from('customer_invitations')
    .update({ status: 'expired' })
    .eq('invited_by', user.id)
    .eq('status', 'pending')
    .lt('expires_at', now)

  const { data: invitations, error } = await admin
    .from('customer_invitations')
    .select('id, email, invited_name, status, expires_at, invited_at, invited_by')
    .eq('invited_by', user.id)
    .order('invited_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return NextResponse.json(invitations)
}
