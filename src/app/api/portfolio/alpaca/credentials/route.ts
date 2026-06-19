import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptCredential } from '@/lib/alpacaCrypto'
import { logAudit } from '@/lib/auditLogger'

const CredentialsSchema = z.object({
  key_id:     z.string().min(1).max(100),
  secret_key: z.string().min(1).max(200),
  is_paper:   z.boolean().default(true),
})

// ── POST ──────────────────────────────────────────────────────────────────────

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

  const parsed = CredentialsSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const encKeyId = encryptCredential(parsed.data.key_id)
  const encSecret = encryptCredential(parsed.data.secret_key)

  const admin = createAdminClient()
  const { error } = await admin
    .from('alpaca_credentials')
    .upsert({
      user_id:          user.id,
      encrypted_key_id: encKeyId.ciphertext,
      key_id_iv:        encKeyId.iv,
      encrypted_secret: encSecret.ciphertext,
      secret_iv:        encSecret.iv,
      is_paper:         parsed.data.is_paper,
      updated_at:       new Date().toISOString(),
    })

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  await logAudit({ performedBy: user.id, action: 'alpaca_credentials_connected', tripId: null })

  return NextResponse.json({ connected: true, is_paper: parsed.data.is_paper })
}

// ── DELETE ─────────────────────────────────────────────────────────────────────

export async function DELETE() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('alpaca_credentials')
    .delete()
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  await logAudit({ performedBy: user.id, action: 'alpaca_credentials_disconnected', tripId: null })

  return new NextResponse(null, { status: 204 })
}
