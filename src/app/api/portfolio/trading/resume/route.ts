import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { logAudit } from '@/lib/auditLogger'
import { MIGRATION_MISSING_WARNING, loadSafetySettings, setTradingPause } from '@/lib/tradingSafety'
import { RESUME_CONFIRM_TEXT } from '@/lib/riskLimits'

const ResumeSchema = z.object({
  confirm_text: z.literal(RESUME_CONFIRM_TEXT),
})

// ── POST ──────────────────────────────────────────────────────────────────────
// Lift the trading pause. Requires the explicit confirmation { confirm_text: "RESUME" }.

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

  const parsed = ResumeSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: `Type ${RESUME_CONFIRM_TEXT} to confirm resuming trading` }, { status: 400 })
  }

  const before = await loadSafetySettings(user.id)
  if (!before.migration_applied) {
    return NextResponse.json({ paused: false, warning: MIGRATION_MISSING_WARNING })
  }

  const ok = await setTradingPause(user.id, false, null)
  if (!ok) return NextResponse.json({ error: 'Failed to resume trading' }, { status: 500 })

  await logAudit({
    performedBy:   user.id,
    action:        'trading_resumed',
    tripId:        null,
    changedFields: {
      trading_paused: { before: before.trading_paused, after: false },
      paused_reason:  { before: before.paused_reason, after: null },
    },
  })

  return NextResponse.json({ paused: false, warning: null })
}
