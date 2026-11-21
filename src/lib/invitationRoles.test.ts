import { describe, it, expect } from 'vitest'
import {
  allowedInviteRoles,
  canGrantRole,
  readInvitationRole,
  resolveSignupRole,
  invitationRoleFeatures,
  isMissingSchemaError,
  InvitableRoleSchema,
} from './invitationRoles'

describe('allowedInviteRoles / canGrantRole', () => {
  it('premium_plus can grant every invitable role', () => {
    expect(allowedInviteRoles('premium_plus')).toEqual(['main', 'premium', 'premium_plus'])
  })
  it('premium can grant main and premium only', () => {
    expect(allowedInviteRoles('premium')).toEqual(['main', 'premium'])
    expect(canGrantRole('premium', 'premium_plus')).toBe(false)
    expect(canGrantRole('premium', 'premium')).toBe(true)
  })
  it('main, assistant and unknown roles cannot invite', () => {
    for (const r of ['main', 'assistant', undefined, null, 'admin']) {
      expect(allowedInviteRoles(r)).toEqual([])
      expect(canGrantRole(r, 'main')).toBe(false)
    }
  })
})

describe('InvitableRoleSchema', () => {
  it('rejects assistant and arbitrary strings', () => {
    expect(InvitableRoleSchema.safeParse('assistant').success).toBe(false)
    expect(InvitableRoleSchema.safeParse('owner').success).toBe(false)
    expect(InvitableRoleSchema.safeParse('premium_plus').success).toBe(true)
  })
})

describe('readInvitationRole', () => {
  it('reads a valid role', () => {
    expect(readInvitationRole({ role: 'premium_plus' })).toBe('premium_plus')
  })
  it('defaults to main when the column is missing or the value is unexpected', () => {
    expect(readInvitationRole({})).toBe('main')
    expect(readInvitationRole({ role: 'assistant' })).toBe('main')
    expect(readInvitationRole({ role: 42 })).toBe('main')
    expect(readInvitationRole(null)).toBe('main')
  })
})

describe('resolveSignupRole', () => {
  it('keeps the invitation role when the inviter can still grant it', () => {
    expect(resolveSignupRole('premium_plus', 'premium_plus')).toBe('premium_plus')
    expect(resolveSignupRole('premium', 'premium')).toBe('premium')
  })
  it('caps at the highest role a downgraded inviter can still grant', () => {
    expect(resolveSignupRole('premium_plus', 'premium')).toBe('premium')
  })
  it('falls back to main when the inviter can no longer invite', () => {
    expect(resolveSignupRole('premium_plus', 'main')).toBe('main')
    expect(resolveSignupRole('premium', null)).toBe('main')
  })
  it('unexpected invitation values become main', () => {
    expect(resolveSignupRole('assistant', 'premium_plus')).toBe('main')
    expect(resolveSignupRole(undefined, 'premium_plus')).toBe('main')
    expect(resolveSignupRole('PREMIUM_PLUS', 'premium_plus')).toBe('main')
  })
})

describe('invitationRoleFeatures', () => {
  it('premium_plus mentions own Alpaca account and own Anthropic API key', () => {
    const text = invitationRoleFeatures('premium_plus').join(' ')
    expect(text).toMatch(/own Alpaca account/i)
    expect(text).toMatch(/own Anthropic API key/i)
  })
  it('main is travel only', () => {
    expect(invitationRoleFeatures('main')).toHaveLength(1)
  })
})

describe('isMissingSchemaError', () => {
  it('detects missing column / table codes and messages', () => {
    expect(isMissingSchemaError({ code: '42703', message: 'column customer_invitations.role does not exist' })).toBe(true)
    expect(isMissingSchemaError({ code: 'PGRST204' })).toBe(true)
    expect(isMissingSchemaError({ code: 'PGRST205' })).toBe(true)
    expect(isMissingSchemaError({ code: '42P01' })).toBe(true)
    expect(isMissingSchemaError({ message: "Could not find the table 'public.user_ai_credentials' in the schema cache" })).toBe(true)
  })
  it('ignores other errors and null', () => {
    expect(isMissingSchemaError(null)).toBe(false)
    expect(isMissingSchemaError({ code: '23505', message: 'duplicate key value' })).toBe(false)
  })
})
