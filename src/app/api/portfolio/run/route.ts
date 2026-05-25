import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/auditLogger'
import { inngest } from '@/inngest/client'

const AGENT_NAMES = [
  'macroeconomics',
  'fed_rates',
  'geopolitics',
  'sentiment',
  'fundamentals',
  'technical_analysis',
  'sector_analysis',
] as const

export async function POST() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = await createClient()

  // Check holdings exist
  const { count, error: holdingsError } = await supabase
    .from('portfolio_holdings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (holdingsError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  if (!count || count === 0) return NextResponse.json({ error: 'No holdings defined' }, { status: 400 })

  // Check cooldown
  const { data: settingsRow, error: settingsError } = await supabase
    .from('portfolio_settings')
    .select('last_run_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (settingsError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  if (settingsRow?.last_run_at) {
    const lastRun = new Date(settingsRow.last_run_at)
    const secondsElapsed = (Date.now() - lastRun.getTime()) / 1000
    const COOLDOWN_SECONDS = 24 * 60 * 60

    if (secondsElapsed < COOLDOWN_SECONDS) {
      const retry_after_seconds = Math.ceil(COOLDOWN_SECONDS - secondsElapsed)
      return NextResponse.json({ error: 'Cooldown active', retry_after_seconds }, { status: 429 })
    }
  }

  const admin = createAdminClient()

  // Insert recommendations row
  const { data: recRow, error: recError } = await admin
    .from('recommendations')
    .insert({ user_id: user.id, status: 'running' })
    .select('id')
    .single()

  if (recError || !recRow) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const run_id: string = recRow.id

  // Bulk-insert run_progress rows
  const progressRows = AGENT_NAMES.map(name => ({
    run_id,
    agent_name: name,
    status:     'pending',
  }))

  const { error: progressError } = await admin
    .from('run_progress')
    .insert(progressRows)

  if (progressError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Update last_run_at
  const { error: updateError } = await admin
    .from('portfolio_settings')
    .update({ last_run_at: new Date().toISOString() })
    .eq('user_id', user.id)

  if (updateError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Fire Inngest event
  await inngest.send({ name: 'portfolio/analysis.requested', data: { run_id, user_id: user.id } })

  // Audit log
  await logAudit({ performedBy: user.id, action: 'run_triggered', tripId: null })

  return NextResponse.json({ run_id }, { status: 202 })
}
