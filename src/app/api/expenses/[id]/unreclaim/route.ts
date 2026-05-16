import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (user.role === 'assistant') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()

  // Verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from('expenses')
    .select('id')
    .eq('id', id)
    .eq('owner_id', activeMainAccountId)
    .single()

  if (fetchError || !existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('expenses')
    .update({
      reclaimed: false,
      reclaimed_at: null,
      reclaimed_by: null,
      reclaim_reference: null,
      last_modified_by: user.id,
    })
    .eq('id', id)
    .select('*, category:expense_categories(name)')
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  await logAudit({
    performedBy: user.id,
    action: 'expense_unreclaimed',
    tripId: null,
    tripSnapshot: null,
  })

  return NextResponse.json(data)
}
