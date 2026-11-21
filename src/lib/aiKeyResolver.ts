import { z } from 'zod'

/**
 * Pure rules for which Anthropic API key an analysis run uses (specs/026-friend-onboarding-byo-ai-key).
 * Each Portfolio user brings their own key; the app's key is only for the owner(s) listed by email.
 */

export const AI_KEY_PREFIX = 'sk-ant-'

export const AnthropicApiKeySchema = z
  .string()
  .trim()
  .min(20, 'The key is too short')
  .max(300, 'The key is too long')
  .refine(v => v.startsWith(AI_KEY_PREFIX), { message: `Anthropic API keys start with "${AI_KEY_PREFIX}"` })
  .refine(v => !/\s/.test(v), { message: 'The key must not contain spaces' })

export function isValidAnthropicKeyFormat(key: unknown): boolean {
  return AnthropicApiKeySchema.safeParse(key).success
}

export function keyLast4(key: string): string {
  return key.trim().slice(-4)
}

export const NO_AI_KEY_MESSAGE = 'Add your Anthropic API key in Portfolio → Settings'
export const AI_KEY_REJECTED_MESSAGE = 'Your Anthropic API key was rejected — update it in Settings'

/** `ANTHROPIC_KEY_OWNER_EMAILS` → lower-cased, trimmed, de-duplicated emails (empty entries dropped). */
export function parseOwnerEmails(raw: string | null | undefined): string[] {
  if (!raw) return []
  return Array.from(new Set(raw.split(',').map(e => e.trim().toLowerCase()).filter(e => e.includes('@'))))
}

export function isOwnerEmail(email: string | null | undefined, ownerEmailsRaw: string | null | undefined): boolean {
  const e = (email ?? '').trim().toLowerCase()
  if (!e) return false
  return parseOwnerEmails(ownerEmailsRaw).includes(e)
}

export type AiKeyResolution =
  | { ok: true; source: 'user' | 'app_owner'; apiKey: string }
  | { ok: false; reason: 'no_ai_key' }

/**
 * The user's own key if present; else the app key ONLY when the user's email is in the owner list (and an app key is
 * configured); else no key (the run must be refused before it starts).
 */
export function resolveAiKey(params: {
  userKey: string | null | undefined
  userEmail: string | null | undefined
  ownerEmailsRaw: string | null | undefined
  appKey: string | null | undefined
}): AiKeyResolution {
  const userKey = params.userKey?.trim()
  if (userKey) return { ok: true, source: 'user', apiKey: userKey }
  const appKey = params.appKey?.trim()
  if (appKey && isOwnerEmail(params.userEmail, params.ownerEmailsRaw)) {
    return { ok: true, source: 'app_owner', apiKey: appKey }
  }
  return { ok: false, reason: 'no_ai_key' }
}

export type KeyVerification = 'valid' | 'invalid' | 'unverifiable'

/** GET /v1/models status → verdict. Only 401 means the key itself is wrong; anything else is "could not verify". */
export function classifyKeyVerification(status: number | null): KeyVerification {
  if (status === 200) return 'valid'
  if (status === 401) return 'invalid'
  return 'unverifiable'
}

/** True for an Anthropic API error that means the key was rejected (revoked / no permission). */
export function isKeyRejectedStatus(status: unknown): boolean {
  return status === 401 || status === 403
}

/** Replaces every occurrence of each secret (ignoring empty / very short values) with [REDACTED]. */
export function redactSecrets(message: string, secrets: Array<string | null | undefined>): string {
  return secrets
    .filter((s): s is string => typeof s === 'string' && s.trim().length >= 8)
    .reduce((msg, s) => msg.split(s.trim()).join('[REDACTED]'), message)
}
