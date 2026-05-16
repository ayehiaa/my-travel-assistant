import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

const schema = z.object({ token: z.string().uuid() })

export async function PATCH(request: NextRequest) {
  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: invitation } = await admin
    .from('customer_invitations')
    .select('id, email, invited_name, status, expires_at')
    .eq('token', parsed.data.token)
    .maybeSingle()

  if (!invitation) {
    return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 404 })
  }
  if (invitation.status !== 'pending') {
    return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 410 })
  }
  if (new Date(invitation.expires_at) < new Date()) {
    await admin
      .from('customer_invitations')
      .update({ status: 'expired' })
      .eq('id', invitation.id)
    return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 })
  }

  const { error: updateError } = await admin
    .from('customer_invitations')
    .update({ status: 'accepted' })
    .eq('id', invitation.id)

  if (updateError) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ email: invitation.email, invited_name: invitation.invited_name })
}
