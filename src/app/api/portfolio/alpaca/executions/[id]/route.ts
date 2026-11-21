import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { hasFeature } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { normalizeExecution } from '@/lib/tradeExecution'

const ParamsSchema = z.object({ id: z.string().uuid() })

// ── GET ───────────────────────────────────────────────────────────────────────
// Live status of one execution (polled by AlpacaResultsPanel). Owner only.

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasFeature(user.access, 'portfolio')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = ParamsSchema.safeParse(await params)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid execution id' }, { status: 400 })

  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from('alpaca_executions')
    .select('*')
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Execution not found' }, { status: 404 })

  return NextResponse.json({ execution: normalizeExecution(row) })
}
