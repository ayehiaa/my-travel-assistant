import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'

const SettingsUpdateSchema = z.object({
  cash_usd:          z.number().nonnegative().optional(),
  target_return_pct: z.number().positive().optional(),
  risk_profile:      z.enum(['conservative', 'moderate', 'aggressive']).optional(),
  run_interval_days: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field required' })

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  if (data !== null) {
    return NextResponse.json({ settings: data })
  }

  // First visit — upsert default row to avoid race between concurrent requests
  const { error: upsertError } = await supabase
    .from('portfolio_settings')
    .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })

  if (upsertError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const { data: inserted, error: refetchError } = await supabase
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (refetchError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return NextResponse.json({ settings: inserted })
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = SettingsUpdateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('portfolio_settings')
    .upsert({ user_id: user.id, ...parsed.data, updated_at: new Date().toISOString() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  await logAudit({ performedBy: user.id, action: 'portfolio_settings_updated', tripId: null })

  return NextResponse.json({ settings: data })
}
