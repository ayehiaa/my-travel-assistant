import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential } from '@/lib/alpacaCrypto'
import { syncAlpacaPositions } from '@/lib/alpacaPortfolioSync'
import { logAudit } from '@/lib/auditLogger'
import type { PortfolioHolding } from '@/types/database'

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(_request: NextRequest): Promise<NextResponse> {
  // Step 1: Authenticate
  const authUser = await getAuthUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Step 2: Require premium_plus role
  if (authUser.role !== 'premium_plus') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Step 3: Load credentials via admin client
  const admin = createAdminClient()
  const { data: cred } = await admin
    .from('alpaca_credentials')
    .select('encrypted_key_id, key_id_iv, encrypted_secret, secret_iv, is_paper')
    .eq('user_id', authUser.id)
    .maybeSingle()

  if (!cred) {
    return NextResponse.json({ error: 'No Alpaca account connected' }, { status: 400 })
  }

  // Step 4: Decrypt credentials
  const keyId = decryptCredential(cred.encrypted_key_id as string, cred.key_id_iv as string)
  const secret = decryptCredential(cred.encrypted_secret as string, cred.secret_iv as string)

  // Step 5: Run sync
  const result = await syncAlpacaPositions(authUser.id, keyId, secret, cred.is_paper as boolean)

  // Step 6: Return 502 if sync failed
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  // Step 7: Re-query portfolio_holdings for fresh data
  const supabase = await createClient()
  const { data: freshHoldings } = await supabase
    .from('portfolio_holdings')
    .select('id, ticker, company_name, total_value_usd, qty, updated_at')
    .eq('user_id', authUser.id)
    .order('total_value_usd', { ascending: false })

  const holdings = (freshHoldings ?? []) as PortfolioHolding[]

  // Step 8: Audit log
  await logAudit({ performedBy: authUser.id, action: 'alpaca_synced', tripId: null })

  // Step 9: Return success with fresh holdings and sync timestamp
  return NextResponse.json({ holdings, last_synced_at: result.lastSyncedAt })
}
