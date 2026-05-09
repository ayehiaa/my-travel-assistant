import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitationEmail } from '@/lib/email'

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

const schema = z.object({ linkId: z.string().uuid() })

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: roleRecord } = await supabase
    .from('user_roles')
    .select('role, display_name')
    .eq('user_id', user.id)
    .single()

  if (roleRecord?.role !== 'main') {
    return NextResponse.json({ error: 'Only main accounts can resend invitations' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'linkId required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: link } = await admin
    .from('account_links')
    .select('id, assistant_user_id, status')
    .eq('id', parsed.data.linkId)
    .eq('main_user_id', user.id)
    .single()

  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  if (link.status === 'active') {
    return NextResponse.json({ error: 'Invitation already accepted' }, { status: 400 })
  }

  // Look up assistant email
  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(link.assistant_user_id)
  if (authError || !authUser.user?.email) {
    return NextResponse.json({ error: 'Assistant account not found' }, { status: 404 })
  }

  const { data: assistantRole } = await admin
    .from('user_roles')
    .select('display_name')
    .eq('user_id', link.assistant_user_id)
    .single()

  const now = new Date()
  const expiresAt = new Date(now.getTime() + THREE_DAYS_MS)

  await admin
    .from('account_links')
    .update({ status: 'pending', invited_at: now.toISOString(), expires_at: expiresAt.toISOString() })
    .eq('id', link.id)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const { data: linkData, error: genError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: authUser.user.email,
    options: { redirectTo: `${appUrl}/auth/callback?next=/reset-password` },
  })

  if (genError || !linkData?.properties?.action_link) {
    return NextResponse.json({ error: 'Failed to generate invitation link' }, { status: 500 })
  }

  await sendInvitationEmail({
    assistantEmail: authUser.user.email,
    assistantName: assistantRole?.display_name ?? 'Assistant',
    mainName: roleRecord.display_name,
    resetLink: linkData.properties.action_link,
    expiresAt,
  })

  return NextResponse.json({ success: true, expiresAt: expiresAt.toISOString() })
}
