import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { canInviteCustomers } from '@/lib/access'
import { logAudit } from '@/lib/auditLogger'

const ParamsSchema = z.object({ id: z.string().uuid() })

// ── DELETE ────────────────────────────────────────────────────────────────────
// Revoke a pending customer invitation (admin only). The row is kept and marked expired (the status CHECK only
// allows pending | accepted | expired), so the signup link stops working immediately.

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canInviteCustomers(user.access)) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid invitation id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: invitation } = await admin
    .from('customer_invitations')
    .select('id, email, status')
    .eq('id', parsed.data.id)
    .maybeSingle()

  if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  if (invitation.status !== 'pending') {
    return NextResponse.json({ error: 'Only pending invitations can be revoked' }, { status: 409 })
  }

  const nowIso = new Date().toISOString()
  const { error } = await admin
    .from('customer_invitations')
    .update({ status: 'expired', expires_at: nowIso })
    .eq('id', invitation.id)
    .eq('status', 'pending')

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  await logAudit({
    performedBy:   user.id,
    action:        'customer_invitation_revoked',
    tripId:        null,
    changedFields: { email: { before: invitation.email, after: null }, status: { before: 'pending', after: 'revoked' } },
  })

  return NextResponse.json({ revoked: true })
}
