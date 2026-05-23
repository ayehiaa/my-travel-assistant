import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'

const ExpenseUpdateSchema = z.object({
  title:        z.string().min(1).max(200).optional(),
  amount:       z.number().nonnegative().optional(),
  currency:     z.string().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO 4217 code').optional(),
  category_id:  z.string().uuid().optional(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  trip_id:      z.string().uuid().nullable().optional(),
  notes:        z.string().max(2000).nullable().optional(),
})

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()
  const { id } = await params

  // Verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from('expenses')
    .select()
    .eq('id', id)
    .eq('owner_id', activeMainAccountId)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = ExpenseUpdateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('expenses')
    .update({ ...parsed.data, last_modified_by: user.id })
    .eq('id', id)
    .select('*, category:expense_categories(name)')
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  await logAudit({
    performedBy:  user.id,
    action:       'expense_updated',
    tripId:       null,
    tripSnapshot: null,
    onBehalfOf:   user.role === 'assistant' ? activeMainAccountId : undefined,
  })

  return NextResponse.json(data)
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (user.role === 'assistant') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()
  const { id } = await params

  // Verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from('expenses')
    .select('id')
    .eq('id', id)
    .eq('owner_id', activeMainAccountId)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  }

  const { error: deleteError } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id)

  if (deleteError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  await logAudit({
    performedBy:  user.id,
    action:       'expense_deleted',
    tripId:       null,
    tripSnapshot: null,
  })

  return new NextResponse(null, { status: 204 })
}
