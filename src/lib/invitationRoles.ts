import { z } from 'zod'

/**
 * Pure rules for the role a customer invitation grants (specs/026-friend-onboarding-byo-ai-key).
 * An inviter can only grant roles up to their own: premium → main|premium; premium_plus → main|premium|premium_plus.
 */

export const INVITABLE_ROLES = ['main', 'premium', 'premium_plus'] as const
export type InvitableRole = (typeof INVITABLE_ROLES)[number]

export const InvitableRoleSchema = z.enum(INVITABLE_ROLES)

export const INVITABLE_ROLE_INFO: Record<InvitableRole, { label: string; description: string }> = {
  main:         { label: 'Main',     description: 'Travel only — trips, days outside the UK and expenses.' },
  premium:      { label: 'Premium',  description: 'Travel, plus they can invite their own customers.' },
  premium_plus: { label: 'Premium+', description: 'Travel, plus Portfolio & trading (needs their own Alpaca account and Anthropic API key).' },
}

/** Roles an inviter with `inviterRole` may grant ([] when they cannot invite at all). */
export function allowedInviteRoles(inviterRole: unknown): InvitableRole[] {
  if (inviterRole === 'premium_plus') return ['main', 'premium', 'premium_plus']
  if (inviterRole === 'premium') return ['main', 'premium']
  return []
}

export function canGrantRole(inviterRole: unknown, role: InvitableRole): boolean {
  return allowedInviteRoles(inviterRole).includes(role)
}

/** The role stored on an invitation row; missing column / unexpected value → 'main'. */
export function readInvitationRole(row: unknown): InvitableRole {
  const value = row && typeof row === 'object' ? (row as Record<string, unknown>).role : undefined
  const parsed = InvitableRoleSchema.safeParse(value)
  return parsed.success ? parsed.data : 'main'
}

const RANK: Record<InvitableRole, number> = { main: 0, premium: 1, premium_plus: 2 }

/**
 * Role inserted into user_roles at signup: the invitation's role (validated, unknown → 'main'), capped at the
 * highest role the inviter can STILL grant (an inviter who was downgraded cannot hand out more than they now have).
 */
export function resolveSignupRole(invitationRole: unknown, inviterRole: unknown): InvitableRole {
  const parsed = InvitableRoleSchema.safeParse(invitationRole)
  const requested: InvitableRole = parsed.success ? parsed.data : 'main'
  const allowed = allowedInviteRoles(inviterRole)
  if (allowed.includes(requested)) return requested
  const capped = allowed.filter(r => RANK[r] <= RANK[requested]).sort((a, b) => RANK[b] - RANK[a])[0]
  return capped ?? 'main'
}

/** Bullet points for the invitation email: what the new account includes. */
export function invitationRoleFeatures(role: InvitableRole): string[] {
  const travel = 'Travel planning: trips, days outside the UK and expenses'
  if (role === 'main') return [travel]
  if (role === 'premium') return [travel, 'Invite your own customers to Sojourn']
  return [
    travel,
    'Invite your own customers to Sojourn',
    'Portfolio & trading (for testing): AI analysis of a US stock portfolio. It needs your OWN Alpaca account ' +
      '(a free paper-trading account is fine) and your OWN Anthropic API key — you pay Anthropic directly for the AI ' +
      'usage (roughly $0.15–0.30 per analysis).',
  ]
}

/**
 * True when a Supabase/PostgREST error means a column or table does not exist (migration not applied):
 * 42703 undefined column, 42P01 undefined table, PGRST204 column not in schema cache, PGRST205 table not in cache.
 */
export function isMissingSchemaError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  if (error.code && ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code)) return true
  return /does not exist|schema cache/i.test(error.message ?? '')
}
