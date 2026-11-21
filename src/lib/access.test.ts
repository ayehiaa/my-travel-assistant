import { GMAIL_IMPORT_ENABLED } from '@/lib/features'
import { describe, it, expect } from 'vitest'
import {
  accessBadge,
  accessColumns,
  canInviteAssistants,
  canInviteCustomers,
  deriveAccess,
  fieldsFromLegacyRole,
  hasFeature,
  isAdminEmail,
  isAtLimit,
  isPlus,
  isRepresentableAsLegacyRole,
  legacyRoleFor,
  limitsFor,
  normalizeFeatures,
  parseAdminEmails,
  readAccessFields,
} from './access'

const ADMINS = 'Owner@Example.com, second@example.com ,,'

describe('deriveAccess — legacy roles (migration not applied)', () => {
  it('main → member / free / no add-ons', () => {
    const a = deriveAccess({ role: 'main' })
    expect(a).toMatchObject({ accountType: 'member', plan: 'free', features: [], effectivePlan: 'free', source: 'legacy_role' })
    expect(hasFeature(a, 'portfolio')).toBe(false)
    expect(isPlus(a)).toBe(false)
  })
  it('premium → member / plus / no add-ons', () => {
    const a = deriveAccess({ role: 'premium' })
    expect(a).toMatchObject({ accountType: 'member', plan: 'plus', features: [] })
    expect(isPlus(a)).toBe(true)
    expect(hasFeature(a, 'portfolio')).toBe(false)
  })
  it('premium_plus → member / plus / portfolio', () => {
    const a = deriveAccess({ role: 'premium_plus' })
    expect(a).toMatchObject({ accountType: 'member', plan: 'plus', features: ['portfolio'] })
    expect(hasFeature(a, 'portfolio')).toBe(true)
  })
  it('assistant → assistant / free / none', () => {
    const a = deriveAccess({ role: 'assistant' })
    expect(a).toMatchObject({ accountType: 'assistant', plan: 'free', features: [], effectivePlan: 'free', effectiveFeatures: [] })
  })
  it('unknown / missing role and junk rows → most restricted member', () => {
    expect(deriveAccess({ role: 'owner' })).toMatchObject({ accountType: 'member', plan: 'free', features: [] })
    expect(deriveAccess({})).toMatchObject({ accountType: 'member', plan: 'free', features: [] })
    expect(deriveAccess(null)).toMatchObject({ accountType: 'member', plan: 'free', features: [] })
    expect(deriveAccess([1, 2])).toMatchObject({ accountType: 'member', plan: 'free', features: [] })
  })
})

describe('deriveAccess — new columns', () => {
  it('reads the columns and ignores the legacy role', () => {
    const a = deriveAccess({ role: 'premium_plus', account_type: 'member', plan: 'free', features: [] })
    expect(a).toMatchObject({ plan: 'free', features: [], source: 'columns' })
    expect(hasFeature(a, 'portfolio')).toBe(false)
  })
  it('supports Free + Portfolio (not expressible with the legacy role)', () => {
    const a = deriveAccess({ role: 'main', account_type: 'member', plan: 'free', features: ['portfolio'] })
    expect(hasFeature(a, 'portfolio')).toBe(true)
    expect(isPlus(a)).toBe(false)
  })
  it('sanitises plan and features', () => {
    const a = deriveAccess({ account_type: 'member', plan: 'gold', features: ['admin', 'portfolio', 'portfolio'] })
    expect(a.plan).toBe('free')
    expect(a.features).toEqual(['portfolio'])
    expect(deriveAccess({ account_type: 'member', plan: 'plus', features: 'portfolio' }).features).toEqual([])
  })
  it('legacy role assistant always wins (safety net) and assistants carry no own plan/add-ons', () => {
    expect(deriveAccess({ role: 'assistant', account_type: 'member', plan: 'plus', features: ['portfolio'] }))
      .toMatchObject({ accountType: 'assistant', plan: 'free', features: [] })
    expect(deriveAccess({ role: 'main', account_type: 'assistant', plan: 'plus', features: ['portfolio'] }))
      .toMatchObject({ accountType: 'assistant', plan: 'free', features: [] })
  })
})

describe('deriveAccess — assistants inherit from the linked member', () => {
  it('inherits plan and (display-only) add-ons from the linked main account', () => {
    const a = deriveAccess({ role: 'assistant' }, { linkedMain: { role: 'premium_plus' } })
    expect(a.effectivePlan).toBe('plus')
    expect(a.effectiveFeatures).toEqual(['portfolio'])
    expect(isPlus(a)).toBe(true)
    expect(limitsFor(a).maxTrips).toBeNull()
  })
  it('never gets Portfolio, even when the linked member has it', () => {
    const a = deriveAccess({ account_type: 'assistant', role: 'assistant' }, { linkedMain: { account_type: 'member', plan: 'plus', features: ['portfolio'] } })
    expect(hasFeature(a, 'portfolio')).toBe(false)
  })
  it('falls back to Free without a linked member, or when the "main" is itself an assistant', () => {
    expect(deriveAccess({ role: 'assistant' }).effectivePlan).toBe('free')
    expect(deriveAccess({ role: 'assistant' }, { linkedMain: null }).effectivePlan).toBe('free')
    expect(deriveAccess({ role: 'assistant' }, { linkedMain: { role: 'assistant' } }).effectivePlan).toBe('free')
    expect(deriveAccess({ role: 'assistant' }, { linkedMain: { role: 'main' } }).effectivePlan).toBe('free')
  })
  it('assistants are never admins, even with an admin email', () => {
    expect(deriveAccess({ role: 'assistant' }, { email: 'owner@example.com', adminEmails: ADMINS }).isAdmin).toBe(false)
  })
  it('members ignore linkedMain', () => {
    expect(deriveAccess({ role: 'main' }, { linkedMain: { role: 'premium' } }).effectivePlan).toBe('free')
  })
})

describe('isAdminEmail / parseAdminEmails', () => {
  it('parses a comma-separated, case-insensitive list', () => {
    expect(parseAdminEmails(ADMINS)).toEqual(['owner@example.com', 'second@example.com'])
    expect(parseAdminEmails(undefined)).toEqual([])
    expect(parseAdminEmails('')).toEqual([])
  })
  it('matches case-insensitively and trims', () => {
    expect(isAdminEmail('OWNER@example.COM', ADMINS)).toBe(true)
    expect(isAdminEmail('  second@example.com ', ADMINS)).toBe(true)
    expect(isAdminEmail('other@example.com', ADMINS)).toBe(false)
  })
  it('is false for empty email or unset env (nobody is admin by default)', () => {
    expect(isAdminEmail('', ADMINS)).toBe(false)
    expect(isAdminEmail(null, ADMINS)).toBe(false)
    expect(isAdminEmail('owner@example.com', undefined)).toBe(false)
    expect(isAdminEmail('owner@example.com', ' , ')).toBe(false)
  })
  it('does not partially match', () => {
    expect(isAdminEmail('owner@example.co', ADMINS)).toBe(false)
    expect(isAdminEmail('xowner@example.com', ADMINS)).toBe(false)
  })
  it('deriveAccess sets isAdmin for member accounts with an admin email', () => {
    expect(deriveAccess({ role: 'main' }, { email: 'Owner@example.com', adminEmails: ADMINS }).isAdmin).toBe(true)
    expect(deriveAccess({ role: 'premium_plus' }, { email: 'x@example.com', adminEmails: ADMINS }).isAdmin).toBe(false)
  })
})

describe('limitsFor / isAtLimit', () => {
  it('free has the beta limits', () => {
    expect(limitsFor(deriveAccess({ role: 'main' }))).toEqual({ maxTrips: 10, maxExpenses: 10, maxAssistants: 1, gmailImport: false })
  })
  it('plus is unlimited; Gmail import follows the app-wide switch (hidden for now)', () => {
    expect(limitsFor(deriveAccess({ role: 'premium' }))).toEqual({ maxTrips: null, maxExpenses: null, maxAssistants: null, gmailImport: GMAIL_IMPORT_ENABLED })
    expect(GMAIL_IMPORT_ENABLED).toBe(false)
  })
  it('returns a copy (callers cannot mutate the constants)', () => {
    const l = limitsFor({ effectivePlan: 'free' })
    l.maxTrips = 99
    expect(limitsFor({ effectivePlan: 'free' }).maxTrips).toBe(10)
  })
  it('isAtLimit', () => {
    expect(isAtLimit(10, 9)).toBe(false)
    expect(isAtLimit(10, 10)).toBe(true)
    expect(isAtLimit(null, 10_000)).toBe(false)
  })
})

describe('permissions', () => {
  it('members invite assistants; assistants do not', () => {
    expect(canInviteAssistants(deriveAccess({ role: 'main' }))).toBe(true)
    expect(canInviteAssistants(deriveAccess({ role: 'assistant' }))).toBe(false)
  })
  it('only admins invite customers — Plus alone is not enough', () => {
    expect(canInviteCustomers(deriveAccess({ role: 'premium_plus' }))).toBe(false)
    expect(canInviteCustomers(deriveAccess({ role: 'main' }, { email: 'owner@example.com', adminEmails: ADMINS }))).toBe(true)
  })
})

describe('legacy role mapping', () => {
  it('legacyRoleFor', () => {
    expect(legacyRoleFor({ accountType: 'assistant', plan: 'plus', features: ['portfolio'] })).toBe('assistant')
    expect(legacyRoleFor({ accountType: 'member', plan: 'plus', features: ['portfolio'] })).toBe('premium_plus')
    expect(legacyRoleFor({ accountType: 'member', plan: 'plus', features: [] })).toBe('premium')
    expect(legacyRoleFor({ accountType: 'member', plan: 'free', features: [] })).toBe('main')
    expect(legacyRoleFor({ accountType: 'member', plan: 'free', features: ['portfolio'] })).toBe('main')
  })
  it('round-trips every legacy role', () => {
    for (const role of ['main', 'premium', 'premium_plus', 'assistant'] as const) {
      expect(legacyRoleFor(fieldsFromLegacyRole(role))).toBe(role)
    }
  })
  it('isRepresentableAsLegacyRole', () => {
    expect(isRepresentableAsLegacyRole({ accountType: 'member', plan: 'free', features: ['portfolio'] })).toBe(false)
    expect(isRepresentableAsLegacyRole({ accountType: 'member', plan: 'plus', features: ['portfolio'] })).toBe(true)
    expect(isRepresentableAsLegacyRole({ accountType: 'member', plan: 'free', features: [] })).toBe(true)
  })
  it('accessColumns', () => {
    expect(accessColumns({ accountType: 'member', plan: 'plus', features: ['portfolio'] }))
      .toEqual({ account_type: 'member', plan: 'plus', features: ['portfolio'] })
  })
})

describe('helpers', () => {
  it('normalizeFeatures', () => {
    expect(normalizeFeatures(['portfolio', 'x', 'portfolio'])).toEqual(['portfolio'])
    expect(normalizeFeatures(undefined)).toEqual([])
  })
  it('readAccessFields reports the source', () => {
    expect(readAccessFields({ role: 'main' }).source).toBe('legacy_role')
    expect(readAccessFields({ account_type: 'member' }).source).toBe('columns')
  })
  it('accessBadge', () => {
    expect(accessBadge(deriveAccess({ role: 'main' }))).toBe('Free')
    expect(accessBadge(deriveAccess({ role: 'premium' }))).toBe('Plus')
    expect(accessBadge(deriveAccess({ role: 'premium_plus' }))).toBe('Plus · Portfolio')
    expect(accessBadge(deriveAccess({ account_type: 'member', plan: 'free', features: ['portfolio'] }))).toBe('Free · Portfolio')
    expect(accessBadge(deriveAccess({ role: 'assistant' }))).toBe('Assistant')
  })
})
