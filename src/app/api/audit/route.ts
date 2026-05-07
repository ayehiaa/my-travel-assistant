import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'

const PAGE_SIZE = 20

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()

  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10))
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data: entries, error, count } = await supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .or(`performed_by.eq.${activeMainAccountId},on_behalf_of.eq.${activeMainAccountId}`)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const performerIds = [...new Set((entries ?? []).map(e => e.performed_by))]
  const onBehalfOfIds = [...new Set(
    (entries ?? []).map(e => e.on_behalf_of).filter(Boolean) as string[]
  )]
  const allUserIds = [...new Set([...performerIds, ...onBehalfOfIds])]

  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id, display_name, role')
    .in('user_id', allUserIds)

  const roleMap = new Map((roles ?? []).map(r => [r.user_id, r]))
  const enriched = (entries ?? []).map(e => ({
    ...e,
    performer: roleMap.get(e.performed_by) ?? { display_name: 'Unknown', role: 'assistant' },
    on_behalf_of_user: e.on_behalf_of
      ? { display_name: roleMap.get(e.on_behalf_of)?.display_name ?? 'Unknown' }
      : undefined,
  }))

  return NextResponse.json({ entries: enriched, total: count ?? 0, page, pageSize: PAGE_SIZE })
}
