import { z } from 'zod'

/**
 * Account access model (specs/027-plans-addons-admin). Pure — no I/O, safe in client and server code.
 *
 * Four independent dimensions replace the overloaded legacy `user_roles.role`:
 *   • account type  member | assistant   (assistant = acts on a linked member account)
 *   • plan          free | plus          (free = beta limits; plus = unlimited + Gmail import)
 *   • add-ons       feature keys         (only 'portfolio' for now — Portfolio (beta))
 *   • admin         derived from env APP_ADMIN_EMAILS — never stored in the database
 *
 * `role` is LEGACY: it is still written (see legacyRoleFor) so old code paths and manual SQL keep working, but the app
 * reads the new columns whenever they exist and only falls back to `role` before migration 20261121b is applied.
 */

export const ACCOUNT_TYPES = ['member', 'assistant'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const PLANS = ['free', 'plus'] as const
export type Plan = (typeof PLANS)[number]
export const PlanSchema = z.enum(PLANS)

export const FEATURE_KEYS = ['portfolio'] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]
export const FeatureKeySchema = z.enum(FEATURE_KEYS)

/** Legacy user_roles.role values (CHECK constraint from migration 013). */
export type LegacyRole = 'main' | 'assistant' | 'premium' | 'premium_plus'

export interface AccessFields {
  accountType: AccountType
  plan: Plan
  features: FeatureKey[]
}

export interface Access extends AccessFields {
  /** From APP_ADMIN_EMAILS (member accounts only). */
  isAdmin: boolean
  /** Plan that applies to what the user does: own plan for members, the active linked member's plan for assistants. */
  effectivePlan: Plan
  /** Add-ons that apply: own add-ons for members; the linked member's add-ons for assistants (display only). */
  effectiveFeatures: FeatureKey[]
  /** Where the fields came from: the new columns, or derived from the legacy role (migration not applied). */
  source: 'columns' | 'legacy_role'
}

export const PLAN_INFO: Record<Plan, { label: string; description: string }> = {
  free: { label: 'Free (beta limits)', description: 'Up to 10 trips, 10 expenses and 1 assistant.' },
  plus: { label: 'Plus', description: 'Unlimited trips, expenses and assistants, plus Gmail trip import.' },
}

export const FEATURE_INFO: Record<FeatureKey, { label: string; description: string }> = {
  portfolio: {
    label: 'Portfolio (beta)',
    description: 'AI portfolio analysis and trading — needs their own Alpaca account and own Anthropic API key.',
  },
}

const LEGACY_FIELDS: Record<LegacyRole, AccessFields> = {
  main:         { accountType: 'member',    plan: 'free', features: [] },
  premium:      { accountType: 'member',    plan: 'plus', features: [] },
  premium_plus: { accountType: 'member',    plan: 'plus', features: ['portfolio'] },
  assistant:    { accountType: 'assistant', plan: 'free', features: [] },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Known feature keys only, de-duplicated, in FEATURE_KEYS order. Junk → []. */
export function normalizeFeatures(value: unknown): FeatureKey[] {
  if (!Array.isArray(value)) return []
  return FEATURE_KEYS.filter(key => value.includes(key))
}

/** The access fields a legacy role maps to (unknown → member/free/[] — the most restricted member). */
export function fieldsFromLegacyRole(role: unknown): AccessFields {
  const fields = typeof role === 'string' && role in LEGACY_FIELDS ? LEGACY_FIELDS[role as LegacyRole] : LEGACY_FIELDS.main
  return { ...fields, features: [...fields.features] }
}

/**
 * Access fields of one user_roles row. Uses account_type/plan/features when the columns exist (migration applied),
 * otherwise derives them from `role`. A row whose legacy role is 'assistant' is ALWAYS an assistant (safety net for a
 * write path that only set `role`), and assistants never carry a plan or add-ons of their own.
 */
export function readAccessFields(row: unknown): AccessFields & { source: Access['source'] } {
  const r = isRecord(row) ? row : {}
  const hasColumns = typeof r.account_type === 'string'
  if (!hasColumns) return { ...fieldsFromLegacyRole(r.role), source: 'legacy_role' }

  const accountType: AccountType =
    r.account_type === 'assistant' || r.role === 'assistant' ? 'assistant' : 'member'
  if (accountType === 'assistant') return { accountType, plan: 'free', features: [], source: 'columns' }
  const plan: Plan = r.plan === 'plus' ? 'plus' : 'free'
  return { accountType, plan, features: normalizeFeatures(r.features), source: 'columns' }
}

/** Parse APP_ADMIN_EMAILS (comma-separated, case-insensitive, whitespace ignored). */
export function parseAdminEmails(env: string | null | undefined): string[] {
  return (env ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0)
}

export function isAdminEmail(email: string | null | undefined, env: string | null | undefined): boolean {
  const normalized = (email ?? '').trim().toLowerCase()
  if (!normalized) return false
  return parseAdminEmails(env).includes(normalized)
}

export interface DeriveAccessOptions {
  /** The user's auth email (for the admin check). */
  email?: string | null
  /** Value of APP_ADMIN_EMAILS. */
  adminEmails?: string | null
  /** For assistants: the user_roles row of the ACTIVE linked member account (null when none is linked). */
  linkedMain?: unknown
}

/** Full access for one user_roles row. Pure; the single source of truth for every access decision. */
export function deriveAccess(row: unknown, opts: DeriveAccessOptions = {}): Access {
  const own = readAccessFields(row)
  const base: AccessFields = { accountType: own.accountType, plan: own.plan, features: own.features }

  if (own.accountType === 'assistant') {
    const linked = opts.linkedMain ? readAccessFields(opts.linkedMain) : null
    const inherits = linked !== null && linked.accountType === 'member'
    return {
      ...base,
      isAdmin:           false,
      effectivePlan:     inherits ? linked.plan : 'free',
      effectiveFeatures: inherits ? [...linked.features] : [],
      source:            own.source,
    }
  }

  return {
    ...base,
    isAdmin:           isAdminEmail(opts.email, opts.adminEmails),
    effectivePlan:     own.plan,
    effectiveFeatures: [...own.features],
    source:            own.source,
  }
}

type AccessLike = Pick<Access, 'accountType' | 'effectivePlan' | 'effectiveFeatures'>

export function isAssistant(access: Pick<Access, 'accountType'>): boolean {
  return access.accountType === 'assistant'
}

export function isMember(access: Pick<Access, 'accountType'>): boolean {
  return access.accountType === 'member'
}

/** Add-on check. Add-ons are personal: assistants never get them (no Portfolio for assistants). */
export function hasFeature(access: AccessLike, key: FeatureKey): boolean {
  return access.accountType === 'member' && access.effectiveFeatures.includes(key)
}

/** Plus plan (unlimited + Gmail import). Assistants follow their active linked member account. */
export function isPlus(access: Pick<Access, 'effectivePlan'>): boolean {
  return access.effectivePlan === 'plus'
}

export interface PlanLimits {
  /** null = unlimited */
  maxTrips: number | null
  maxExpenses: number | null
  maxAssistants: number | null
  gmailImport: boolean
}

export const FREE_LIMITS: PlanLimits = { maxTrips: 10, maxExpenses: 10, maxAssistants: 1, gmailImport: false }
export const PLUS_LIMITS: PlanLimits = { maxTrips: null, maxExpenses: null, maxAssistants: null, gmailImport: true }

export function limitsFor(access: Pick<Access, 'effectivePlan'>): PlanLimits {
  return isPlus(access) ? { ...PLUS_LIMITS } : { ...FREE_LIMITS }
}

/** True when `count` items already reach the limit (null limit → never). */
export function isAtLimit(limit: number | null, count: number): boolean {
  return limit !== null && count >= limit
}

/** Inviting assistants: any member account (plan decides how many). */
export function canInviteAssistants(access: Pick<Access, 'accountType'>): boolean {
  return access.accountType === 'member'
}

/** Inviting customers and managing users: admins only. */
export function canInviteCustomers(access: Pick<Access, 'isAdmin'>): boolean {
  return access.isAdmin
}

/**
 * Legacy `role` written alongside the new columns. Free + Portfolio has no legacy equivalent, so it is written as
 * 'main' and only the new columns carry the add-on.
 */
export function legacyRoleFor(fields: AccessFields): LegacyRole {
  if (fields.accountType === 'assistant') return 'assistant'
  if (fields.plan === 'plus') return fields.features.includes('portfolio') ? 'premium_plus' : 'premium'
  return 'main'
}

/** True when the legacy role alone can represent these fields (needed while the migration is not applied). */
export function isRepresentableAsLegacyRole(fields: AccessFields): boolean {
  const back = fieldsFromLegacyRole(legacyRoleFor(fields))
  return back.accountType === fields.accountType && back.plan === fields.plan &&
    back.features.join(',') === normalizeFeatures(fields.features).join(',')
}

/** New-column values for a user_roles write. */
export function accessColumns(fields: AccessFields): { account_type: AccountType; plan: Plan; features: FeatureKey[] } {
  return { account_type: fields.accountType, plan: fields.plan, features: normalizeFeatures(fields.features) }
}

export function planLabel(plan: Plan): string {
  return PLAN_INFO[plan].label
}

/** Short badge text, e.g. "Plus · Portfolio", "Free", "Assistant". */
export function accessBadge(access: Pick<Access, 'accountType' | 'plan' | 'features'>): string {
  if (access.accountType === 'assistant') return 'Assistant'
  const plan = access.plan === 'plus' ? 'Plus' : 'Free'
  return access.features.includes('portfolio') ? `${plan} · Portfolio` : plan
}
