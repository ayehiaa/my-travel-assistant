import { describe, it, expect } from 'vitest'
import {
  CustomerInviteSchema,
  invitationAccessLabel,
  invitationFeatureBullets,
  isMissingSchemaError,
  isRepresentableInvitation,
  legacyInvitationRole,
  readInvitationAccess,
  resolveSignupAccess,
  isCheckViolation,
} from './invitationRoles'

describe('CustomerInviteSchema (invite validation)', () => {
  it('defaults to Free without add-ons', () => {
    const parsed = CustomerInviteSchema.parse({ email: 'a@b.com', invitedName: 'Ann' })
    expect(parsed).toEqual({ email: 'a@b.com', invitedName: 'Ann', plan: 'free', features: [] })
  })
  it('accepts plus + portfolio', () => {
    const parsed = CustomerInviteSchema.parse({ email: 'a@b.com', invitedName: 'Ann', plan: 'plus', features: ['portfolio'] })
    expect(parsed.plan).toBe('plus')
    expect(parsed.features).toEqual(['portfolio'])
  })
  it('rejects unknown plans, unknown add-ons, legacy role field and bad input', () => {
    expect(CustomerInviteSchema.safeParse({ email: 'a@b.com', invitedName: 'Ann', plan: 'premium' }).success).toBe(false)
    expect(CustomerInviteSchema.safeParse({ email: 'a@b.com', invitedName: 'Ann', features: ['admin'] }).success).toBe(false)
    expect(CustomerInviteSchema.safeParse({ email: 'a@b.com', invitedName: 'Ann', role: 'premium_plus' }).success).toBe(false)
    expect(CustomerInviteSchema.safeParse({ email: 'nope', invitedName: 'Ann' }).success).toBe(false)
    expect(CustomerInviteSchema.safeParse({ email: 'a@b.com', invitedName: '' }).success).toBe(false)
    expect(CustomerInviteSchema.safeParse({ email: 'a@b.com', invitedName: 'x'.repeat(101) }).success).toBe(false)
  })
})

describe('readInvitationAccess', () => {
  it('reads the plan/features columns when present', () => {
    expect(readInvitationAccess({ plan: 'free', features: ['portfolio'], role: 'main' })).toEqual({ plan: 'free', features: ['portfolio'] })
    expect(readInvitationAccess({ plan: 'plus', features: ['junk', 'portfolio', 'portfolio'] })).toEqual({ plan: 'plus', features: ['portfolio'] })
    expect(readInvitationAccess({ plan: 'gold', features: null })).toEqual({ plan: 'free', features: [] })
  })
  it('derives from the 026 role column before migration 20261121b', () => {
    expect(readInvitationAccess({ role: 'main' })).toEqual({ plan: 'free', features: [] })
    expect(readInvitationAccess({ role: 'premium' })).toEqual({ plan: 'plus', features: [] })
    expect(readInvitationAccess({ role: 'premium_plus' })).toEqual({ plan: 'plus', features: ['portfolio'] })
    expect(readInvitationAccess({ role: 'assistant' })).toEqual({ plan: 'free', features: [] })
  })
  it('missing / junk rows → Free', () => {
    expect(readInvitationAccess({})).toEqual({ plan: 'free', features: [] })
    expect(readInvitationAccess(null)).toEqual({ plan: 'free', features: [] })
    expect(readInvitationAccess('x')).toEqual({ plan: 'free', features: [] })
  })
})

describe('legacyInvitationRole / isRepresentableInvitation', () => {
  it('keeps the 026 role column in sync', () => {
    expect(legacyInvitationRole({ plan: 'free', features: [] })).toBe('main')
    expect(legacyInvitationRole({ plan: 'plus', features: [] })).toBe('premium')
    expect(legacyInvitationRole({ plan: 'plus', features: ['portfolio'] })).toBe('premium_plus')
    expect(legacyInvitationRole({ plan: 'free', features: ['portfolio'] })).toBe('main')
  })
  it('Free + Portfolio cannot be stored in the role column alone', () => {
    expect(isRepresentableInvitation({ plan: 'free', features: ['portfolio'] })).toBe(false)
    expect(isRepresentableInvitation({ plan: 'free', features: [] })).toBe(true)
    expect(isRepresentableInvitation({ plan: 'plus', features: [] })).toBe(true)
    expect(isRepresentableInvitation({ plan: 'plus', features: ['portfolio'] })).toBe(true)
  })
})

describe('resolveSignupAccess', () => {
  it('grants the invitation only when the inviter is an admin', () => {
    const inv = { plan: 'plus', features: ['portfolio'] }
    expect(resolveSignupAccess(inv, true)).toEqual({ plan: 'plus', features: ['portfolio'] })
    expect(resolveSignupAccess(inv, false)).toEqual({ plan: 'free', features: [] })
    expect(resolveSignupAccess({ role: 'premium_plus' }, false)).toEqual({ plan: 'free', features: [] })
    expect(resolveSignupAccess({ role: 'premium_plus' }, true)).toEqual({ plan: 'plus', features: ['portfolio'] })
  })
})

describe('invitation copy', () => {
  it('labels plan + add-ons', () => {
    expect(invitationAccessLabel({ plan: 'free', features: [] })).toBe('Free (beta limits)')
    expect(invitationAccessLabel({ plan: 'plus', features: ['portfolio'] })).toBe('Plus + Portfolio (beta)')
  })
  it('lists the Portfolio requirements (own Alpaca + own Anthropic key)', () => {
    const free = invitationFeatureBullets({ plan: 'free', features: [] })
    expect(free).toHaveLength(1)
    expect(free[0]).toMatch(/10 trips/)
    const withPortfolio = invitationFeatureBullets({ plan: 'plus', features: ['portfolio'] })
    expect(withPortfolio).toHaveLength(2)
    expect(withPortfolio[0]).toMatch(/unlimited/)
    expect(withPortfolio[1]).toMatch(/OWN Alpaca/)
    expect(withPortfolio[1]).toMatch(/OWN Anthropic API key/)
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

describe('health add-on (specs/029)', () => {
  it('invitation bullets and CHECK violations', () => {
    const b = invitationFeatureBullets({ plan: 'free', features: ['health'] })
    expect(b).toHaveLength(2)
    expect(b[1]).toMatch(/Health \(beta\)/)
    expect(isCheckViolation({ code: '23514' })).toBe(true)
    expect(isCheckViolation({ code: '23505' })).toBe(false)
    expect(isCheckViolation(null)).toBe(false)
  })
})
