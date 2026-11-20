import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { logAudit } from '@/lib/auditLogger'
import { startAnalysisRun } from '@/lib/startAnalysisRun'

export async function POST() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Shared with the scheduler (src/inngest/scheduledRuns.ts): credentials, live value, cooldown, rows, event.
  const result = await startAnalysisRun({ userId: user.id, trigger: 'manual' })

  if (!result.ok) {
    switch (result.reason) {
      case 'no_credentials':
        return NextResponse.json({ error: 'Connect your Alpaca account first' }, { status: 400 })
      case 'alpaca_unreachable':
        return NextResponse.json({ error: 'Could not reach Alpaca — try again shortly' }, { status: 502 })
      case 'no_funds':
        return NextResponse.json({ error: 'Your Alpaca account has no funds or positions' }, { status: 400 })
      case 'cooldown':
        return NextResponse.json({ error: 'Cooldown active', retry_after_seconds: result.retryAfterSeconds }, { status: 429 })
      case 'event_failed':
        return NextResponse.json({ error: 'Could not start the analysis — try again shortly' }, { status: 502 })
      default:
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }

  await logAudit({ performedBy: user.id, action: 'run_triggered', tripId: null })

  return NextResponse.json({ run_id: result.runId }, { status: 202 })
}
