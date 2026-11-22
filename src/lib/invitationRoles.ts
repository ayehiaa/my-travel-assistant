import { GMAIL_IMPORT_ENABLED } from '@/lib/features'
import { z } from 'zod'
import {
  FEATURE_INFO,
  FeatureKeySchema,
  PLAN_INFO,
  PlanSchema,
  fieldsFromLegacyRole,
  legacyRoleFor,
  normalizeFeatures,
  type FeatureKey,
  type Plan,
} from '@/lib/access'

/**
 * Pure rules for what a customer invitation grants (specs/027-plans-addons-admin; replaces the 026 role picker).
 * Only admins (APP_ADMIN_EMAILS) can invite customers. An invitation grants a plan (free | plus) and add-ons
 * (['portfolio'] or []). The 026 `role` column is still written (legacyInvitationRole) for compatibility.
 */

export interface InvitationAccess {
  plan: Plan
  features: FeatureKey[]
}

/** Legacy invitation roles (CHECK constraint from migration 20261121). */
export type InvitableRole = 'main' | 'premium' | 'premium_plus'

/** POST /api/customer-invitations body. */
export const CustomerInviteSchema = z.object({
  email:       z.string().trim().email().max(254),
  invitedName: z.string().trim().min(1).max(100),
  plan:        PlanSchema.default('free'),
  features:    z.array(FeatureKeySchema).max(10).default([]),
}).strict()

export type CustomerInviteInput = z.infer<typeof CustomerInviteSchema>

const NO_ACCESS: InvitationAccess = { plan: 'free', features: [] }

/**
 * Plan + add-ons stored on an invitation row. Uses the plan/features columns when present (migration 20261121b),
 * otherwise derives them from the 026 role column (main → free, premium → plus, premium_plus → plus + portfolio);
 * missing / unexpected → Free without add-ons.
 */
export function readInvitationAccess(row: unknown): InvitationAccess {
  if (!row || typeof row !== 'object') return { ...NO_ACCESS, features: [] }
  const r = row as Record<string, unknown>
  if (typeof r.plan === 'string') {
    const plan = PlanSchema.safeParse(r.plan)
    return { plan: plan.success ? plan.data : 'free', features: normalizeFeatures(r.features) }
  }
  const role = r.role === 'premium' || r.role === 'premium_plus' ? r.role : 'main'
  const fields = fieldsFromLegacyRole(role)
  return { plan: fields.plan, features: fields.features }
}

/** The 026 role column value kept in sync with plan + add-ons (Free + Portfolio → 'main'; the columns carry it). */
export function legacyInvitationRole(access: InvitationAccess): InvitableRole {
  const role = legacyRoleFor({ accountType: 'member', plan: access.plan, features: access.features })
  return role === 'assistant' ? 'main' : role
}

/** True when the 026 role column alone can carry these values (needed before migration 20261121b). */
export function isRepresentableInvitation(access: InvitationAccess): boolean {
  const back = readInvitationAccess({ role: legacyInvitationRole(access) })
  return back.plan === access.plan && back.features.join(',') === normalizeFeatures(access.features).join(',')
}

/**
 * What signup grants: the invitation's plan + add-ons, re-validated — but ONLY when the inviter is (still) an admin.
 * Invitations created by anyone else (legacy premium invites, rows written outside the API) grant Free, no add-ons.
 */
export function resolveSignupAccess(invitationRow: unknown, inviterIsAdmin: boolean): InvitationAccess {
  if (!inviterIsAdmin) return { plan: 'free', features: [] }
  return readInvitationAccess(invitationRow)
}

/** e.g. "Plus + Portfolio (beta)", "Free (beta limits)". */
export function invitationAccessLabel(access: InvitationAccess): string {
  const parts = [PLAN_INFO[access.plan].label, ...normalizeFeatures(access.features).map(f => FEATURE_INFO[f].label)]
  return parts.join(' + ')
}

/** Bullet points for the invitation email: what the new account includes. */
export function invitationFeatureBullets(access: InvitationAccess): string[] {
  const bullets = [
    access.plan === 'plus'
      ? `Travel planning on the Plus plan: unlimited trips, expenses and assistants${GMAIL_IMPORT_ENABLED ? ', plus Gmail trip import' : ''}`
      : 'Travel planning on the Free plan (beta limits): up to 10 trips, 10 expenses and 1 assistant',
  ]
  if (normalizeFeatures(access.features).includes('health')) {
    bullets.push(
      'Health (beta): follow a programme with daily food, weight and sleep tracking. AI food estimates from text or ' +
        'photos use your OWN Anthropic API key (a few cents per logged meal). Your health data is private to you.',
    )
  }
  if (normalizeFeatures(access.features).includes('portfolio')) {
    bullets.push(
      'Portfolio (beta, for testing): AI analysis of a US stock portfolio. It needs your OWN Alpaca account ' +
        '(a free paper-trading account is fine) and your OWN Anthropic API key — you pay Anthropic directly for the AI ' +
        'usage (roughly $0.15–0.30 per analysis).',
    )
  }
  return bullets
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

/** True for a CHECK-constraint violation (23514) — e.g. the 'health' add-on before apply_health_p1a.sql. */
export function isCheckViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '23514'
}

export const HEALTH_ADDON_MIGRATION_MESSAGE =
  'The Health add-on needs a database update — apply supabase/apply_health_p1a.sql first'
