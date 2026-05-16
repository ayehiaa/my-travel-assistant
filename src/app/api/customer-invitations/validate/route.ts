import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token || !UUID_RE.test(token)) {
    return NextResponse.json({ valid: false })
  }

  const admin = createAdminClient()

  const { data: invitation } = await admin
    .from('customer_invitations')
    .select('id, email, invited_name, status, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (
    !invitation ||
    invitation.status !== 'pending' ||
    new Date(invitation.expires_at) < new Date()
  ) {
    return NextResponse.json({ valid: false })
  }

  return NextResponse.json({
    valid: true,
    email: invitation.email,
    invited_name: invitation.invited_name,
  })
}
