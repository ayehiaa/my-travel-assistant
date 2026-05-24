import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCustomerInvitationEmail } from '@/lib/email'

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

const schema = z.object({ id: z.string().uuid() })

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

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: invitation } = await admin
    .from('customer_invitations')
    .select('*')
    .eq('id', parsed.data.id)
    .eq('invited_by', user.id)
    .maybeSingle()

  if (!invitation) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  }
  if (invitation.status === 'accepted') {
    return NextResponse.json({ error: 'This invitation has already been accepted' }, { status: 409 })
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + THREE_DAYS_MS)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const { data: updated, error: updateError } = await admin
    .from('customer_invitations')
    .update({
      token: crypto.randomUUID(),
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    })
    .eq('id', parsed.data.id)
    .select()
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const signupLink = `${appUrl}/signup?token=${updated.token}`

  await sendCustomerInvitationEmail({
    toEmail: updated.email,
    toName: updated.invited_name,
    invitedBy: roleRecord.display_name,
    signupLink,
    expiresAt,
  })

  return NextResponse.json({ expiresAt: updated.expires_at })
}
