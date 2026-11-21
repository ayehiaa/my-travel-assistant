import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSignupRole } from '@/lib/invitationRoles'

const schema = z.object({
  token:    z.string().uuid(),
  fullName: z.string().min(1).max(100),
  password: z.string().min(8),
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { token, fullName, password } = parsed.data

  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Re-validate the invitation token server-side
  const { data: invitation } = await admin
    .from('customer_invitations')
    // select('*') so this works before migration 20261121 (no role column → 'main')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (
    !invitation ||
    invitation.status !== 'pending' ||
    new Date(invitation.expires_at) < new Date()
  ) {
    return NextResponse.json({ error: 'Invitation is invalid or has expired' }, { status: 410 })
  }

  // Create the user with email pre-confirmed — no confirmation email needed
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: fullName.trim() },
  })

  if (createError) {
    const msg = createError.message.toLowerCase().includes('already')
      ? 'An account with this email already exists'
      : 'Failed to create account'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Role from the invitation, re-validated and capped at the inviter's CURRENT role (anything unexpected → 'main')
  const { data: inviterRole } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', invitation.invited_by)
    .maybeSingle()
  const role = resolveSignupRole((invitation as Record<string, unknown>).role, inviterRole?.role)

  // Provision user_roles row
  await admin
    .from('user_roles')
    .insert({ user_id: newUser.user.id, role, display_name: fullName.trim() })

  // Consume the invitation token
  await admin
    .from('customer_invitations')
    .update({ status: 'accepted' })
    .eq('id', invitation.id)

  return NextResponse.json({ success: true })
}
