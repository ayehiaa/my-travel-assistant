import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/auditLogger'
import { isRepresentableAsLegacyRole, legacyRoleFor } from '@/lib/access'
import { AdminUserPatchSchema, PORTFOLIO_REMOVED_REASON, planUserPatch } from '@/lib/adminUsers'
import { cancelInFlightExecutions, setTradingPause } from '@/lib/tradingSafety'

const ParamsSchema = z.object({ id: z.string().uuid() })

const MIGRATION_NEEDED_MESSAGE =
  'Free + Portfolio needs a database update — apply supabase/apply_plans_addons_admin.sql first'

// ── PATCH ─────────────────────────────────────────────────────────────────────
// Change a member's plan and/or add-ons (admins only). Admin status itself is env-based and cannot be changed here.
// Removing Portfolio pauses the user's trading, cancels in-flight executions and turns autopilot off.

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.access.isAdmin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  const parsedParams = ParamsSchema.safeParse(await params)
  if (!parsedParams.success) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 })
  const targetId = parsedParams.data.id

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }

  const parsed = AdminUserPatchSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const admin = createAdminClient()
  const { data: row, error: readError } = await admin
    .from('user_roles')
    .select('*')
    .eq('user_id', targetId)
    .maybeSingle()
  if (readError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const plan = planUserPatch(row, parsed.data)
  if (!plan.ok) {
    return NextResponse.json(
      { error: 'Assistants inherit the plan of the account they are linked to — change that account instead' },
      { status: 400 },
    )
  }

  const { before, next, planChanged, featuresChanged, portfolioRemoved } = plan
  if (!planChanged && !featuresChanged) {
    return NextResponse.json({ plan: next.plan, features: next.features, changed: false })
  }

  // New columns when present (migration 20261121b); the legacy role is always kept in sync.
  const columnsExist = typeof (row as Record<string, unknown>).account_type === 'string'
  if (!columnsExist && !isRepresentableAsLegacyRole(next)) {
    return NextResponse.json({ error: MIGRATION_NEEDED_MESSAGE }, { status: 409 })
  }
  const update: Record<string, unknown> = { role: legacyRoleFor(next) }
  if (columnsExist) {
    update.plan = next.plan
    update.features = next.features
  }

  const { error: writeError } = await admin.from('user_roles').update(update).eq('user_id', targetId)
  if (writeError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Portfolio removed → nothing may keep trading: pause (kill-switch flag), cancel in-flight executions, autopilot off.
  let tradingPaused: boolean | null = null
  let executionsCancelled = 0
  let autopilotOff: boolean | null = null
  if (portfolioRemoved) {
    tradingPaused = await setTradingPause(targetId, true, PORTFOLIO_REMOVED_REASON)
    executionsCancelled = await cancelInFlightExecutions(targetId, PORTFOLIO_REMOVED_REASON)
    const { data: offRows, error: offError } = await admin
      .from('portfolio_settings')
      .update({ autopilot_mode: 'off', updated_at: new Date().toISOString() })
      .eq('user_id', targetId)
      .select('user_id')
    autopilotOff = !offError && Array.isArray(offRows) && offRows.length > 0
  }

  const target = { before: null, after: { id: targetId, name: row.display_name as string } }
  if (planChanged) {
    await logAudit({
      performedBy:   user.id,
      action:        'user_plan_changed',
      tripId:        null,
      changedFields: { user: target, plan: { before: before.plan, after: next.plan } },
    })
  }
  if (featuresChanged) {
    const changedFields: Record<string, { before: unknown; after: unknown }> = {
      user:     target,
      features: { before: before.features, after: next.features },
    }
    if (portfolioRemoved) {
      changedFields.trading_paused = { before: null, after: tradingPaused }
      changedFields.executions_cancelled = { before: null, after: executionsCancelled }
      changedFields.autopilot_mode = { before: null, after: autopilotOff ? 'off' : 'unchanged (no settings row)' }
    }
    await logAudit({ performedBy: user.id, action: 'user_features_changed', tripId: null, changedFields })
  }

  const warnings: string[] = []
  if (portfolioRemoved && tradingPaused === false) {
    warnings.push('Trading pause could not be saved (risk-limits migration missing or no settings row) — Portfolio access is removed, so no new runs or executions can start.')
  }

  return NextResponse.json({
    plan:                 next.plan,
    features:             next.features,
    changed:              true,
    trading_paused:       tradingPaused,
    executions_cancelled: executionsCancelled,
    autopilot_off:        autopilotOff,
    warning:              warnings.length > 0 ? warnings.join(' ') : null,
  })
}
