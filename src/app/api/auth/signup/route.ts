import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCheckViolation, resolveSignupAccess } from '@/lib/invitationRoles'
import { accessColumns, isAdminEmail, legacyRoleFor } from '@/lib/access'

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
    // select('*') so this works before migrations 20261121/20261121b (plan/features derived from role, or Free)
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

  // Plan + add-ons from the invitation, re-validated — granted only when the inviter is STILL an admin
  // (APP_ADMIN_EMAILS); anything else (legacy premium invites, rows written outside the API) → Free, no add-ons.
  const { data: inviterAuth } = await admin.auth.admin.getUserById(invitation.invited_by)
  const inviterIsAdmin = isAdminEmail(inviterAuth?.user?.email, process.env.APP_ADMIN_EMAILS)
  const granted = resolveSignupAccess(invitation, inviterIsAdmin)
  const fields = { accountType: 'member' as const, plan: granted.plan, features: granted.features }

  // Provision user_roles row: legacy role first (works before migration 20261121b) …
  await admin
    .from('user_roles')
    .insert({ user_id: newUser.user.id, role: legacyRoleFor(fields), display_name: fullName.trim() })

  // … then the new columns, best effort (missing columns → access is derived from the legacy role). If the
  // features CHECK does not allow 'health' yet (apply_health_p1a.sql not applied), retry without it so the plan
  // and the other add-ons are still granted.
  const { error: columnsError } = await admin
    .from('user_roles')
    .update(accessColumns(fields))
    .eq('user_id', newUser.user.id)
  if (columnsError && isCheckViolation(columnsError) && fields.features.includes('health')) {
    await admin
      .from('user_roles')
      .update(accessColumns({ ...fields, features: fields.features.filter(f => f !== 'health') }))
      .eq('user_id', newUser.user.id)
  }

  // Consume the invitation token
  await admin
    .from('customer_invitations')
    .update({ status: 'accepted' })
    .eq('id', invitation.id)

  return NextResponse.json({ success: true })
}
