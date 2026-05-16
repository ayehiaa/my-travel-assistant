import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: roleRecord } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!roleRecord) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const now = new Date().toISOString()

  if (roleRecord.role === 'main' || roleRecord.role === 'premium') {
    // Expire any pending links past their expires_at
    await admin
      .from('account_links')
      .update({ status: 'expired' })
      .eq('main_user_id', user.id)
      .eq('status', 'pending')
      .lt('expires_at', now)

    const { data: links } = await supabase
      .from('account_links')
      .select('id, assistant_user_id, created_at, status, expires_at')
      .eq('main_user_id', user.id)
      .order('created_at', { ascending: true })

    const assistantIds = (links ?? []).map(l => l.assistant_user_id)
    let nameMap = new Map<string, string>()
    if (assistantIds.length > 0) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, display_name')
        .in('user_id', assistantIds)
      nameMap = new Map((roles ?? []).map(r => [r.user_id, r.display_name]))
    }

    const enriched = (links ?? []).map(l => ({
      id: l.id,
      assistantUserId: l.assistant_user_id,
      displayName: nameMap.get(l.assistant_user_id) ?? 'Unknown',
      createdAt: l.created_at,
      status: l.status,
      expiresAt: l.expires_at,
    }))

    return NextResponse.json({ links: enriched })
  }

  // Assistant: return linked main accounts
  const { data: links } = await supabase
    .from('account_links')
    .select('id, main_user_id, created_at, status')
    .eq('assistant_user_id', user.id)
    .order('created_at', { ascending: true })

  const mainIds = (links ?? []).map(l => l.main_user_id)
  let nameMap = new Map<string, string>()
  if (mainIds.length > 0) {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, display_name')
      .in('user_id', mainIds)
    nameMap = new Map((roles ?? []).map(r => [r.user_id, r.display_name]))
  }

  const enriched = (links ?? []).map(l => ({
    id: l.id,
    mainUserId: l.main_user_id,
    displayName: nameMap.get(l.main_user_id) ?? 'Unknown',
    createdAt: l.created_at,
    status: l.status,
  }))

  return NextResponse.json({ links: enriched })
}


export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: roleRecord } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (roleRecord?.role !== 'main' && roleRecord?.role !== 'premium') {
    return NextResponse.json({ error: 'Only main or premium accounts can remove assistants' }, { status: 403 })
  }

  const linkId = request.nextUrl.searchParams.get('id')
  if (!linkId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase
    .from('account_links')
    .delete()
    .eq('id', linkId)
    .eq('main_user_id', user.id)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
