import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'
import { LIVE_TRADING_CONFIRM_TEXT, RiskLimitsSchema, readSafetySettings } from '@/lib/riskLimits'
import { MIGRATION_MISSING_WARNING } from '@/lib/tradingSafety'
import {
  AUTOPILOT_CONFIRM_TEXT,
  AUTOPILOT_MODES,
  autopilotChangeNeedsConfirm,
  computeNextRunAt,
  readAutopilotSettings,
  AUTOPILOT_MIGRATION_WARNING,
} from '@/lib/schedule'

const SettingsUpdateSchema = z.object({
  target_return_pct: z.number().positive().optional(),
  target_horizon:    z.enum(['monthly', 'annual']).optional(),
  risk_profile:      z.enum(['conservative', 'moderate', 'aggressive']).optional(),
  /** 1 (daily) needs migration 20261120d — written best-effort with a warning when it cannot be saved. */
  run_interval_days: z.union([z.literal(1), z.literal(7), z.literal(14), z.literal(30)]).optional(),
  // ── Autopilot (migration 20261120d; written best-effort) ──
  autopilot_mode:    z.enum(AUTOPILOT_MODES).optional(),
  /** Required (= AUTOPILOT_CONFIRM_TEXT) when switching autopilot_mode to 'auto'. */
  autopilot_confirm_text: z.string().max(100).optional(),
  // ── Safety settings (migration 20261120c; written best-effort) ──
  risk_limits:       RiskLimitsSchema.optional(),
  dry_run:           z.boolean().optional(),
  /** Required (= LIVE_TRADING_CONFIRM_TEXT) when dry_run is set to false. */
  confirm_text:      z.string().max(100).optional(),
}).refine(
  data => Object.keys(data).some(k => k !== 'confirm_text' && k !== 'autopilot_confirm_text'),
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

  const { autopilot_mode, autopilot_confirm_text, run_interval_days } = parsed.data

  const supabase = await createClient()

  // Autopilot: read the current values first so the 'auto' confirmation is checked before anything is written.
  const scheduleChange = autopilot_mode !== undefined || run_interval_days !== undefined
  let autopilotBefore = readAutopilotSettings(null)
  if (scheduleChange) {
    const { data: row } = await supabase
      .from('portfolio_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    autopilotBefore = readAutopilotSettings(row as Record<string, unknown> | null)
    if (
      autopilot_mode !== undefined &&
      autopilotChangeNeedsConfirm(autopilotBefore.mode, autopilot_mode) &&
      autopilot_confirm_text !== AUTOPILOT_CONFIRM_TEXT
    ) {
      return NextResponse.json(
        { error: `Type "${AUTOPILOT_CONFIRM_TEXT}" to enable automatic execution` },
        { status: 400 },
      )
    }
  }

  const base: Record<string, unknown> = {}
  for (const key of BASE_FIELDS) {
    if (parsed.data[key] !== undefined) base[key] = parsed.data[key]
  }
  // Daily (1) is rejected by the pre-migration CHECK constraint — write it in the best-effort update below instead.
  if (base.run_interval_days === 1) delete base.run_interval_days

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

  let autopilotWarning: string | null = null
  if (scheduleChange) {
    const interval = run_interval_days ?? autopilotBefore.run_interval_days
    const mode = autopilot_mode ?? autopilotBefore.mode
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (autopilot_mode !== undefined) update.autopilot_mode = autopilot_mode
    if (run_interval_days === 1) update.run_interval_days = 1
    // Re-plan the next scheduled run from the last run (null → due at the next 10:30 New York trading-day slot).
    if (mode !== 'off' && (interval !== autopilotBefore.run_interval_days || autopilotBefore.mode === 'off')) {
      update.next_run_at = autopilotBefore.last_run_at
        ? computeNextRunAt(new Date(autopilotBefore.last_run_at), interval).toISOString()
        : null
    }

    const { data: written, error: autopilotError } = await supabase
      .from('portfolio_settings')
      .update(update)
      .eq('user_id', user.id)
      .select('user_id')

    if (autopilotError || !written || written.length === 0) {
      autopilotWarning = AUTOPILOT_MIGRATION_WARNING
    } else if (autopilot_mode !== undefined && autopilot_mode !== autopilotBefore.mode) {
      await logAudit({
        performedBy:   user.id,
        action:        'autopilot_mode_changed',
        tripId:        null,
        changedFields: { autopilot_mode: { before: autopilotBefore.mode, after: autopilot_mode } },
      })
    } else if (run_interval_days === 1 && Object.keys(base).length === 0) {
      await logAudit({ performedBy: user.id, action: 'portfolio_settings_updated', tripId: null })
    }
  }

  const { data, error } = await supabase
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return NextResponse.json({
    settings:                   data,
    safety_settings_warning:    safetyWarning,
    autopilot_settings_warning: autopilotWarning,
  })
}
