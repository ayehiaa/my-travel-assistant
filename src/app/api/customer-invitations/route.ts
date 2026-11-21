import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCustomerInvitationEmail } from '@/lib/email'
import { InvitableRoleSchema, canGrantRole, isMissingSchemaError, readInvitationRole } from '@/lib/invitationRoles'

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

const postSchema = z.object({
  email: z.string().email(),
  invitedName: z.string().min(1).max(100),
  role: InvitableRoleSchema.default('main'),
})

const MIGRATION_NEEDED_MESSAGE =
  'Role selection needs a database update — apply supabase/apply_friend_onboarding_2026-11-21.sql, or invite as Main'

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

  const { email, invitedName, role } = parsed.data

  // An inviter can only grant a role up to their own (premium → main|premium; premium_plus → all three)
  if (!canGrantRole(roleRecord.role, role)) {
    return NextResponse.json({ error: 'You cannot invite someone with a higher role than your own' }, { status: 403 })
  }

  const admin = createAdminClient()

  // customer_invitations.role comes from migration 20261121. Without it only 'main' invites are possible —
  // other roles are refused (never silently downgraded).
  const { error: probeError } = await admin.from('customer_invitations').select('role').limit(1)
  const roleColumnExists = !isMissingSchemaError(probeError)
  if (!roleColumnExists && role !== 'main') {
    return NextResponse.json({ error: MIGRATION_NEEDED_MESSAGE }, { status: 400 })
  }

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
      ...(roleColumnExists ? { role } : {}),
    })
    .select('*')
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
    role,
  })

  const { token: omit, ...safeInvitation } = invitation as Record<string, unknown>
  void omit
  return NextResponse.json({ ...safeInvitation, role: readInvitationRole(invitation) }, { status: 201 })
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
    .select('*')
    .eq('invited_by', user.id)
    .order('invited_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Never expose tokens; role reads as 'main' when the column does not exist yet
  return NextResponse.json((invitations ?? []).map(inv => ({
    id:           inv.id,
    email:        inv.email,
    invited_name: inv.invited_name,
    status:       inv.status,
    expires_at:   inv.expires_at,
    invited_at:   inv.invited_at,
    invited_by:   inv.invited_by,
    role:         readInvitationRole(inv),
  })))
}
