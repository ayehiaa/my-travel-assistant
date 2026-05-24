import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'

const HoldingUpdateSchema = z.object({
  total_value_usd: z.number().positive(),
})

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = await createClient()

  // Verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from('portfolio_holdings')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Holding not found' }, { status: 404 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = HoldingUpdateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('portfolio_holdings')
    .update({ total_value_usd: parsed.data.total_value_usd, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  await logAudit({ performedBy: user.id, action: 'holding_updated', tripId: null })

  return NextResponse.json({ holding: data })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = await createClient()

  // Verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from('portfolio_holdings')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Holding not found' }, { status: 404 })
  }

  const { error: deleteError } = await supabase
    .from('portfolio_holdings')
    .delete()
    .eq('id', id)

  if (deleteError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  await logAudit({ performedBy: user.id, action: 'holding_deleted', tripId: null })

  return new NextResponse(null, { status: 204 })
}
