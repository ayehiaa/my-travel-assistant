import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { canInviteCustomers } from '@/lib/access'
import { logAudit } from '@/lib/auditLogger'
import { sendCustomerInvitationEmail } from '@/lib/email'
import {
  CustomerInviteSchema,
  isMissingSchemaError,
  isRepresentableInvitation,
  legacyInvitationRole,
  readInvitationAccess,
  type InvitationAccess,
} from '@/lib/invitationRoles'

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

const MIGRATION_NEEDED_MESSAGE =
  'This plan / add-on combination needs a database update — apply supabase/apply_plans_addons_admin.sql first'

// Customer invitations are admin-only (APP_ADMIN_EMAILS) since specs/027-plans-addons-admin.

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canInviteCustomers(user.access)) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const parsed = CustomerInviteSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { email, invitedName, plan, features } = parsed.data
  const access: InvitationAccess = { plan, features: [...new Set(features)] }

  const admin = createAdminClient()

  // plan/features come from migration 20261121b, role from 20261121. Never silently downgrade: refuse what the
  // available columns cannot store.
  const [{ error: newColsError }, { error: roleColError }] = await Promise.all([
    admin.from('customer_invitations').select('plan, features').limit(1),
    admin.from('customer_invitations').select('role').limit(1),
  ])
  const newColumns = !isMissingSchemaError(newColsError)
  const roleColumn = !isMissingSchemaError(roleColError)
  const storable = newColumns ||
    (roleColumn ? isRepresentableInvitation(access) : access.plan === 'free' && access.features.length === 0)
  if (!storable) return NextResponse.json({ error: MIGRATION_NEEDED_MESSAGE }, { status: 400 })

  const { data: existing } = await admin
    .from('customer_invitations')
    .select('id, status')
    .eq('email', email)
    .in('status', ['pending', 'accepted'])
    .limit(1)

  if (existing && existing.length > 0) {
    const msg = existing[0].status === 'accepted'
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
      ...(roleColumn ? { role: legacyInvitationRole(access) } : {}),
      ...(newColumns ? { plan: access.plan, features: access.features } : {}),
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
    invitedBy: user.displayName,
    signupLink,
    expiresAt,
    access,
  })

  await logAudit({
    performedBy:   user.id,
    action:        'customer_invited',
    tripId:        null,
    changedFields: {
      email:    { before: null, after: email },
      plan:     { before: null, after: access.plan },
      features: { before: null, after: access.features },
    },
  })

  return NextResponse.json(toPublicInvitation(invitation, user.displayName), { status: 201 })
}

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canInviteCustomers(user.access)) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  const admin = createAdminClient()
  const now = new Date().toISOString()

  await admin
    .from('customer_invitations')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', now)

  const { data: invitations, error } = await admin
    .from('customer_invitations')
    .select('*')
    .order('invited_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const inviterIds = [...new Set((invitations ?? []).map(inv => inv.invited_by as string))]
  const { data: inviters } = inviterIds.length > 0
    ? await admin.from('user_roles').select('user_id, display_name').in('user_id', inviterIds)
    : { data: [] as { user_id: string; display_name: string }[] }
  const names = new Map((inviters ?? []).map(r => [r.user_id as string, r.display_name as string]))

  return NextResponse.json((invitations ?? []).map(inv => toPublicInvitation(inv, names.get(inv.invited_by) ?? 'Unknown')))
}

/** Never expose tokens. plan/features read from the columns, or derived from the 026 role before 20261121b. */
function toPublicInvitation(inv: Record<string, unknown>, invitedByName: string) {
  const access = readInvitationAccess(inv)
  return {
    id:              inv.id,
    email:           inv.email,
    invited_name:    inv.invited_name,
    status:          inv.status,
    expires_at:      inv.expires_at,
    invited_at:      inv.invited_at,
    invited_by:      inv.invited_by,
    invited_by_name: invitedByName,
    plan:            access.plan,
    features:        access.features,
  }
}
