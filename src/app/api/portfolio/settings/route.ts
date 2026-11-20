import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'
import { LIVE_TRADING_CONFIRM_TEXT, RiskLimitsSchema, readSafetySettings } from '@/lib/riskLimits'
import { MIGRATION_MISSING_WARNING } from '@/lib/tradingSafety'

const SettingsUpdateSchema = z.object({
  target_return_pct: z.number().positive().optional(),
  target_horizon:    z.enum(['monthly', 'annual']).optional(),
  risk_profile:      z.enum(['conservative', 'moderate', 'aggressive']).optional(),
  run_interval_days: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional(),
  // ── Safety settings (migration 20261120c; written best-effort) ──
  risk_limits:       RiskLimitsSchema.optional(),
  dry_run:           z.boolean().optional(),
  /** Required (= LIVE_TRADING_CONFIRM_TEXT) when dry_run is set to false. */
  confirm_text:      z.string().max(100).optional(),
}).refine(
  data => Object.keys(data).some(k => k !== 'confirm_text'),
  { message: 'At least one field required' },
)

const BASE_FIELDS = ['target_return_pct', 'target_horizon', 'risk_profile', 'run_interval_days'] as const

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
// Base settings are written as before. risk_limits / dry_run go in a SEPARATE best-effort update so a missing
// migration can never break saving the other settings; the response then carries safety_settings_warning.

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

  const { risk_limits, dry_run, confirm_text } = parsed.data
  if (dry_run === false && confirm_text !== LIVE_TRADING_CONFIRM_TEXT) {
    return NextResponse.json(
      { error: `Type "${LIVE_TRADING_CONFIRM_TEXT}" to turn dry run off` },
      { status: 400 },
    )
  }

  const base: Record<string, unknown> = {}
  for (const key of BASE_FIELDS) {
    if (parsed.data[key] !== undefined) base[key] = parsed.data[key]
  }

  const supabase = await createClient()

  if (Object.keys(base).length > 0) {
    const { error } = await supabase
      .from('portfolio_settings')
      .upsert({ user_id: user.id, ...base, updated_at: new Date().toISOString() })
    if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    await logAudit({ performedBy: user.id, action: 'portfolio_settings_updated', tripId: null })
  } else {
    await supabase
      .from('portfolio_settings')
      .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })
  }

  let safetyWarning: string | null = null
  if (risk_limits !== undefined || dry_run !== undefined) {
    const { data: beforeRow } = await supabase
      .from('portfolio_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    const before = readSafetySettings(beforeRow as Record<string, unknown> | null)

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (risk_limits !== undefined) update.risk_limits = risk_limits
    if (dry_run !== undefined) update.dry_run = dry_run

    const { data: written, error: safetyError } = await supabase
      .from('portfolio_settings')
      .update(update)
      .eq('user_id', user.id)
      .select('user_id')

    if (safetyError || !written || written.length === 0) {
      safetyWarning = MIGRATION_MISSING_WARNING
    } else {
      const changedFields: Record<string, { before: unknown; after: unknown }> = {}
      if (risk_limits !== undefined) changedFields.risk_limits = { before: before.limits, after: risk_limits }
      if (dry_run !== undefined) changedFields.dry_run = { before: before.dry_run, after: dry_run }
      await logAudit({ performedBy: user.id, action: 'risk_limits_updated', tripId: null, changedFields })
    }
  }

  const { data, error } = await supabase
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return NextResponse.json({ settings: data, safety_settings_warning: safetyWarning })
}
