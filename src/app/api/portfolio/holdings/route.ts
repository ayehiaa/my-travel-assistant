import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'

const HoldingInsertSchema = z.object({
  ticker:          z.string().min(1).max(10).regex(/^[A-Za-z0-9.]{1,10}$/).transform(v => v.toUpperCase()),
  company_name:    z.string().min(1).max(100),
  total_value_usd: z.number().positive(),
})

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('portfolio_holdings')
    .select('*')
    .eq('user_id', user.id)
    .order('total_value_usd', { ascending: false })

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const holdings = data ?? []
  const total_holdings_usd = holdings.reduce(
    (sum: number, h: { total_value_usd: number }) => sum + h.total_value_usd,
    0
  )

  return NextResponse.json({ holdings, total_holdings_usd })
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = HoldingInsertSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('portfolio_holdings')
    .insert({ user_id: user.id, ...parsed.data })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ticker already exists in portfolio' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  await logAudit({ performedBy: user.id, action: 'holding_created', tripId: null })

  return NextResponse.json({ holding: data }, { status: 201 })
}
