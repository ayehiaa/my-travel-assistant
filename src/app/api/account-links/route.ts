import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deactivateAssistant } from '@/lib/deactivateAssistant'
import { logAudit } from '@/lib/auditLogger'

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

  const deleteSchema = z.object({ id: z.string().uuid() })
  const parsed = deleteSchema.safeParse({ id: request.nextUrl.searchParams.get('id') })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid link id' }, { status: 400 })
  const linkId = parsed.data.id

  const admin = createAdminClient()

  // Fetch the link row to get assistant_user_id before deleting
  const { data: linkRow, error: fetchError } = await admin
    .from('account_links')
    .select('assistant_user_id')
    .eq('id', linkId)
    .eq('main_user_id', user.id)
    .single()

  if (fetchError || !linkRow) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  const assistantUserId = linkRow.assistant_user_id

  const { error: deleteError } = await admin
    .from('account_links')
    .delete()
    .eq('id', linkId)
    .eq('main_user_id', user.id)

  if (deleteError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Count remaining active or pending links for this assistant
  const { count, error: countError } = await admin
    .from('account_links')
    .select('id', { count: 'exact', head: true })
    .eq('assistant_user_id', assistantUserId)
    .in('status', ['active', 'pending'])

  if (countError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const remainingCount = count ?? 0

  if (remainingCount === 0) {
    try {
      await deactivateAssistant(assistantUserId, user.id)
    } catch {
      console.error('[DELETE /api/account-links] deactivateAssistant failed')
      return NextResponse.json({ error: 'Failed to deactivate assistant account' }, { status: 500 })
    }
  } else {
    await logAudit({ performedBy: user.id, action: 'assistant_unlinked', tripId: null })
  }

  return NextResponse.json({ deactivated: remainingCount === 0 }, { status: 200 })
}
