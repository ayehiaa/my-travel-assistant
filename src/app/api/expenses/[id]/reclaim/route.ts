import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'

const ReclaimBodySchema = z.object({
  reclaim_reference: z.string().max(500).nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const activeMainAccountId = await getActiveMainAccountId(user)

  let raw: unknown
  try { raw = await request.json() } catch { raw = {} }

  const parsed = ReclaimBodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

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
      reclaimed: true,
      reclaimed_at: new Date().toISOString(),
      reclaimed_by: user.id,
      reclaim_reference: parsed.data.reclaim_reference ?? null,
      last_modified_by: user.id,
    })
    .eq('id', id)
    .select('*, category:expense_categories(name)')
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  await logAudit({
    performedBy: user.id,
    action: 'expense_reclaimed',
    tripId: null,
    tripSnapshot: null,
    onBehalfOf: user.role === 'assistant' ? activeMainAccountId : undefined,
  })

  return NextResponse.json(data)
}
