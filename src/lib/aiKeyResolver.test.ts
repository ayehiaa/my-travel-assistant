import { describe, it, expect } from 'vitest'
import {
  AnthropicApiKeySchema,
  isValidAnthropicKeyFormat,
  keyLast4,
  parseOwnerEmails,
  isOwnerEmail,
  resolveAiKey,
  classifyKeyVerification,
  isKeyRejectedStatus,
  redactSecrets,
} from './aiKeyResolver'

const USER_KEY = 'sk-ant-api03-userkey-0000000000000000abcd'
const APP_KEY = 'sk-ant-api03-appkey-11111111111111111wxyz'

describe('key format validation', () => {
  it('accepts a well-formed key (trimmed)', () => {
    expect(isValidAnthropicKeyFormat(USER_KEY)).toBe(true)
    expect(AnthropicApiKeySchema.parse(`  ${USER_KEY}\n`)).toBe(USER_KEY)
  })
  it('rejects wrong prefix, too short, too long, inner spaces and non-strings', () => {
    expect(isValidAnthropicKeyFormat('sk-proj-abcdefghijklmnopqrstuvwxyz')).toBe(false)
    expect(isValidAnthropicKeyFormat('sk-ant-short')).toBe(false)
    expect(isValidAnthropicKeyFormat(`sk-ant-${'a'.repeat(300)}`)).toBe(false)
    expect(isValidAnthropicKeyFormat('sk-ant-api03 with spaces inside')).toBe(false)
    expect(isValidAnthropicKeyFormat(undefined)).toBe(false)
    expect(isValidAnthropicKeyFormat(123)).toBe(false)
  })
  it('keyLast4 returns the last four characters', () => {
    expect(keyLast4(USER_KEY)).toBe('abcd')
  })
})

describe('owner email parsing', () => {
  it('splits, trims, lower-cases and de-duplicates', () => {
    expect(parseOwnerEmails(' Owner@Example.com, other@x.io ,owner@example.com,, ')).toEqual(['owner@example.com', 'other@x.io'])
  })
  it('empty / unset → nobody', () => {
    expect(parseOwnerEmails(undefined)).toEqual([])
    expect(parseOwnerEmails('')).toEqual([])
    expect(parseOwnerEmails('not-an-email')).toEqual([])
  })
  it('matches case-insensitively and never matches an empty email', () => {
    expect(isOwnerEmail('OWNER@example.COM', 'owner@example.com')).toBe(true)
    expect(isOwnerEmail('friend@example.com', 'owner@example.com')).toBe(false)
    expect(isOwnerEmail('', 'owner@example.com')).toBe(false)
    expect(isOwnerEmail(null, '')).toBe(false)
  })
})

describe('resolveAiKey', () => {
  const owners = 'owner@example.com'
  it("uses the user's own key first (even for the owner)", () => {
    expect(resolveAiKey({ userKey: USER_KEY, userEmail: 'owner@example.com', ownerEmailsRaw: owners, appKey: APP_KEY }))
      .toEqual({ ok: true, source: 'user', apiKey: USER_KEY })
  })
  it('uses the app key only for a listed owner email', () => {
    expect(resolveAiKey({ userKey: null, userEmail: 'Owner@Example.com', ownerEmailsRaw: owners, appKey: APP_KEY }))
      .toEqual({ ok: true, source: 'app_owner', apiKey: APP_KEY })
  })
  it('refuses a friend without a key', () => {
    expect(resolveAiKey({ userKey: null, userEmail: 'friend@example.com', ownerEmailsRaw: owners, appKey: APP_KEY }))
      .toEqual({ ok: false, reason: 'no_ai_key' })
  })
  it('refuses the owner when no app key is configured or the list is empty', () => {
    expect(resolveAiKey({ userKey: '', userEmail: 'owner@example.com', ownerEmailsRaw: owners, appKey: undefined }).ok).toBe(false)
    expect(resolveAiKey({ userKey: null, userEmail: 'owner@example.com', ownerEmailsRaw: undefined, appKey: APP_KEY }).ok).toBe(false)
  })
})

describe('classifyKeyVerification / isKeyRejectedStatus', () => {
  it('200 valid, 401 invalid, everything else unverifiable', () => {
    expect(classifyKeyVerification(200)).toBe('valid')
    expect(classifyKeyVerification(401)).toBe('invalid')
    for (const s of [403, 429, 500, 529, null]) expect(classifyKeyVerification(s)).toBe('unverifiable')
  })
  it('401 and 403 mean the key was rejected mid-run', () => {
    expect(isKeyRejectedStatus(401)).toBe(true)
    expect(isKeyRejectedStatus(403)).toBe(true)
    expect(isKeyRejectedStatus(429)).toBe(false)
    expect(isKeyRejectedStatus(undefined)).toBe(false)
  })
})

describe('redactSecrets', () => {
  it('redacts every occurrence of each key', () => {
    const msg = `failed with ${USER_KEY} then ${USER_KEY} and ${APP_KEY}`
    expect(redactSecrets(msg, [USER_KEY, APP_KEY])).toBe('failed with [REDACTED] then [REDACTED] and [REDACTED]')
  })
  it('ignores empty and very short secrets (would mangle the message)', () => {
    expect(redactSecrets('a b c', ['', undefined, null, 'a'])).toBe('a b c')
  })
})
