import { NonRetriableError } from 'inngest'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptCredential, decryptCredential } from '@/lib/credentialCrypto'
import { isMissingSchemaError } from '@/lib/invitationRoles'
import {
  NO_AI_KEY_MESSAGE,
  classifyKeyVerification,
  isOwnerEmail,
  keyLast4,
  resolveAiKey,
  type AiKeyResolution,
  type KeyVerification,
} from '@/lib/aiKeyResolver'

/**
 * Server only. Each Portfolio user's own Anthropic API key (table user_ai_credentials, migration 20261121).
 * All access goes through the service role (the table has RLS on and no client policies). Decrypted keys never
 * leave the server, are never logged and are never returned from an Inngest step or put in an event payload.
 */

const TABLE = 'user_ai_credentials'

export interface AiKeyStatus {
  /** False when the user_ai_credentials table does not exist yet. */
  migrationApplied: boolean
  connected: boolean
  provider: string | null
  last4: string | null
  createdAt: string | null
  /** The user has no own key but runs work with the app key (owner email allow-list). */
  usingOwnerFallback: boolean
}

function ownerFallbackAvailable(email: string | null | undefined): boolean {
  return !!process.env.ANTHROPIC_API_KEY && isOwnerEmail(email, process.env.ANTHROPIC_KEY_OWNER_EMAILS)
}

/** Never throws (the Overview and Settings tabs must always render): a failed lookup reads as "not connected". */
export async function getAiKeyStatus(userId: string, email: string | null | undefined): Promise<AiKeyStatus> {
  let data: Record<string, unknown> | null = null
  let error: { code?: string; message?: string } | null = null
  try {
    const res = await createAdminClient()
      .from(TABLE)
      .select('provider, key_last4, created_at')
      .eq('user_id', userId)
      .maybeSingle()
    data = res.data as Record<string, unknown> | null
    error = res.error
  } catch {
    error = { message: 'lookup failed' }
  }
  const migrationApplied = !isMissingSchemaError(error)
  const connected = !error && !!data
  return {
    migrationApplied,
    connected,
    provider:  connected ? (data?.provider as string) : null,
    last4:     connected ? (data?.key_last4 as string) : null,
    createdAt: connected ? (data?.created_at as string) : null,
    usingOwnerFallback: !connected && ownerFallbackAvailable(email),
  }
}

export type SaveAiKeyResult =
  | { ok: true; last4: string; provider: string; createdAt: string }
  | { ok: false; reason: 'migration_missing' | 'db_error' }

export async function saveUserAiKey(userId: string, apiKey: string): Promise<SaveAiKeyResult> {
  const enc = encryptCredential(apiKey)
  const now = new Date().toISOString()
  const last4 = keyLast4(apiKey)
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .upsert({
      user_id:           userId,
      encrypted_api_key: enc.ciphertext,
      key_iv:            enc.iv,
      key_last4:         last4,
      provider:          'anthropic',
      updated_at:        now,
    }, { onConflict: 'user_id' })
    .select('provider, created_at')
    .single()
  if (error) return { ok: false, reason: isMissingSchemaError(error) ? 'migration_missing' : 'db_error' }
  return { ok: true, last4, provider: (data?.provider as string) ?? 'anthropic', createdAt: (data?.created_at as string) ?? now }
}

export async function deleteUserAiKey(userId: string): Promise<{ ok: true } | { ok: false; reason: 'migration_missing' | 'db_error' }> {
  const { error } = await createAdminClient().from(TABLE).delete().eq('user_id', userId)
  if (error) return { ok: false, reason: isMissingSchemaError(error) ? 'migration_missing' : 'db_error' }
  return { ok: true }
}

/**
 * The user's decrypted key, or null (none stored, table missing, or the stored value cannot be decrypted).
 * Any other DB error throws (retriable) so a transient failure never reads as "no key".
 */
async function loadUserAiKey(userId: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .select('encrypted_api_key, key_iv')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    if (isMissingSchemaError(error)) return null
    throw new Error('Could not load the Anthropic API key')
  }
  if (!data) return null
  try {
    return decryptCredential(data.encrypted_api_key as string, data.key_iv as string)
  } catch {
    return null
  }
}

async function loadUserEmail(userId: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(userId)
    return data.user?.email ?? null
  } catch {
    return null
  }
}

/** Which key a run for this user uses (own key → owner app key → none). */
export async function resolveAiKeyForUser(userId: string): Promise<AiKeyResolution> {
  const [userKey, userEmail] = await Promise.all([loadUserAiKey(userId), loadUserEmail(userId)])
  return resolveAiKey({
    userKey,
    userEmail,
    ownerEmailsRaw: process.env.ANTHROPIC_KEY_OWNER_EMAILS,
    appKey:         process.env.ANTHROPIC_API_KEY,
  })
}

/**
 * For use INSIDE an Inngest step only: the run owner's key, or a NonRetriableError when none resolves (e.g. the key
 * was removed after the run started). Never return the result from the step.
 */
export async function requireRunApiKey(userId: string): Promise<string> {
  const resolution = await resolveAiKeyForUser(userId)
  if (!resolution.ok) throw new NonRetriableError(NO_AI_KEY_MESSAGE)
  return resolution.apiKey
}

/** Zero-cost key check: GET /v1/models. Network errors / timeouts → 'unverifiable'. */
export async function verifyAnthropicKey(apiKey: string): Promise<KeyVerification> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    return classifyKeyVerification(res.status)
  } catch {
    return classifyKeyVerification(null)
  }
}
