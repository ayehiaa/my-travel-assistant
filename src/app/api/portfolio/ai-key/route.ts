import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { hasFeature } from '@/lib/access'
import { logAudit } from '@/lib/auditLogger'
import { AnthropicApiKeySchema } from '@/lib/aiKeyResolver'
import { deleteUserAiKey, saveUserAiKey, verifyAnthropicKey } from '@/lib/aiKeyStore'

/** Bring-your-own Anthropic API key (specs/026; also used by the Health add-on, specs/029). The key is never returned or logged — only its last 4 characters. */

const BodySchema = z.object({ api_key: AnthropicApiKeySchema })

const MIGRATION_MESSAGE = 'Database update needed — the owner must apply supabase/apply_friend_onboarding_2026-11-21.sql'

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasFeature(user.access, 'portfolio') && !hasFeature(user.access, 'health')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    // Only the validation message — never echo the submitted value
    const message = parsed.error.issues[0]?.message ?? 'Invalid API key'
    return NextResponse.json({ error: message }, { status: 400 })
  }
  const apiKey = parsed.data.api_key

  const verdict = await verifyAnthropicKey(apiKey)
  if (verdict === 'invalid') {
    return NextResponse.json({ error: 'Anthropic rejected this API key — check you copied the whole key' }, { status: 400 })
  }
  if (verdict === 'unverifiable') {
    return NextResponse.json({ error: 'Could not verify the key with Anthropic — try again shortly' }, { status: 502 })
  }

  const saved = await saveUserAiKey(user.id, apiKey)
  if (!saved.ok) {
    return saved.reason === 'migration_missing'
      ? NextResponse.json({ error: MIGRATION_MESSAGE }, { status: 503 })
      : NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  try {
    await logAudit({ performedBy: user.id, action: 'ai_key_connected', tripId: null })
  } catch {
    // Best-effort: the audit constraint migration may not be applied yet
  }

  return NextResponse.json({ connected: true, provider: saved.provider, last4: saved.last4, created_at: saved.createdAt })
}

export async function DELETE() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasFeature(user.access, 'portfolio') && !hasFeature(user.access, 'health')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = await deleteUserAiKey(user.id)
  if (!result.ok) {
    return result.reason === 'migration_missing'
      ? NextResponse.json({ error: MIGRATION_MESSAGE }, { status: 503 })
      : NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  try {
    await logAudit({ performedBy: user.id, action: 'ai_key_disconnected', tripId: null })
  } catch {
    // Best-effort
  }

  return new NextResponse(null, { status: 204 })
}
