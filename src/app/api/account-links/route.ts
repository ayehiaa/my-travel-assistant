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

  if (roleRecord.role === 'main') {
    // Return linked assistants
    const { data: links } = await supabase
      .from('account_links')
      .select('id, assistant_user_id, created_at')
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
    }))

    return NextResponse.json({ links: enriched })
  }

  // Assistant: return linked main accounts
  const { data: links } = await supabase
    .from('account_links')
    .select('id, main_user_id, created_at')
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
  }))

  return NextResponse.json({ links: enriched })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: roleRecord } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (roleRecord?.role !== 'main') {
    return NextResponse.json({ error: 'Only main accounts can add assistants' }, { status: 403 })
  }

  const { email } = await request.json()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  // Look up the user by email via admin client
  const admin = createAdminClient()
  const { data: listData, error: listError } = await admin.auth.admin.listUsers()
  if (listError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const targetAuthUser = listData.users.find(u => u.email === email)
  if (!targetAuthUser) {
    return NextResponse.json({ error: 'No account found with that email' }, { status: 404 })
  }

  if (targetAuthUser.id === user.id) {
    return NextResponse.json({ error: 'Cannot link yourself' }, { status: 400 })
  }

  // Ensure the target is an assistant account
  const { data: targetRole } = await supabase
    .from('user_roles')
    .select('role, display_name')
    .eq('user_id', targetAuthUser.id)
    .single()

  if (!targetRole) {
    return NextResponse.json({ error: 'Account not found in this system' }, { status: 404 })
  }
  if (targetRole.role !== 'assistant') {
    return NextResponse.json({ error: 'That account is not an assistant account' }, { status: 400 })
  }

  const { data: link, error: insertError } = await supabase
    .from('account_links')
    .insert({
      main_user_id: user.id,
      assistant_user_id: targetAuthUser.id,
      created_by: user.id,
    })
    .select()
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'This assistant is already linked' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({
    id: link.id,
    assistantUserId: targetAuthUser.id,
    displayName: targetRole.display_name,
    createdAt: link.created_at,
  }, { status: 201 })
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

  if (roleRecord?.role !== 'main') {
    return NextResponse.json({ error: 'Only main accounts can remove assistants' }, { status: 403 })
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
