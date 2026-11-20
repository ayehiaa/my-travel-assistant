import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredential } from '@/lib/alpacaCrypto'
import { applyAccountSafeguards } from '@/lib/alpacaClient'
import { logAudit } from '@/lib/auditLogger'

// The client must send exactly the safe configuration; nothing else can be changed through this route.
const SafeguardSchema = z.object({
  no_shorting:           z.literal(true),
  max_margin_multiplier: z.literal('1'),
}).strict()

// ── POST — disable margin & shorting on the connected Alpaca account ─────────

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

  const parsed = SafeguardSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: cred } = await admin
    .from('alpaca_credentials')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!cred) {
    return NextResponse.json({ error: 'No Alpaca credentials connected' }, { status: 404 })
  }

  const keyId = decryptCredential(cred.encrypted_key_id, cred.key_id_iv)
  const secret = decryptCredential(cred.encrypted_secret, cred.secret_iv)

  let result
  try {
    result = await applyAccountSafeguards(keyId, secret, cred.is_paper)
  } catch {
    return NextResponse.json({ error: 'Alpaca rejected the account configuration update' }, { status: 502 })
  }

  await logAudit({
    performedBy:   user.id,
    action:        'alpaca_safeguards_applied',
    tripId:        null,
    changedFields: {
      no_shorting:           { before: null, after: result.no_shorting },
      max_margin_multiplier: { before: null, after: result.max_margin_multiplier },
    },
  })

  return NextResponse.json({ ...result, is_paper: cred.is_paper })
}
