import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'

const ExpenseInsertSchema = z.object({
  title:        z.string().min(1).max(200),
  amount:       z.number().nonnegative(),
  currency:     z.string().min(1).max(10),
  category_id:  z.string().uuid(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trip_id:      z.string().uuid().nullable().optional(),
  notes:        z.string().max(2000).nullable().optional(),
})

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('expenses')
    .select('*, category:expense_categories(name)')
    .eq('owner_id', activeMainAccountId)
    .order('expense_date', { ascending: false })

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return NextResponse.json(data ?? [])
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeMainAccountId = await getActiveMainAccountId(user)

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = ExpenseInsertSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = await createClient()

  const [{ count }, { data: ownerRoleRow }] = await Promise.all([
    supabase
      .from('expenses')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', activeMainAccountId),
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', activeMainAccountId)
      .single(),
  ])

  if (ownerRoleRow?.role === 'main' && (count ?? 0) >= 10) {
    return NextResponse.json({ error: 'EXPENSE_LIMIT_REACHED' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      owner_id:         activeMainAccountId,
      created_by:       user.id,
      last_modified_by: user.id,
      ...parsed.data,
    })
    .select('*, category:expense_categories(name)')
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  await logAudit({
    performedBy:  user.id,
    action:       'expense_created',
    tripId:       null,
    tripSnapshot: null,
    onBehalfOf:   user.role === 'assistant' ? activeMainAccountId : undefined,
  })

  return NextResponse.json(data, { status: 201 })
}
