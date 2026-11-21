import { z } from 'zod'
import {
  FeatureKeySchema,
  PlanSchema,
  normalizeFeatures,
  readAccessFields,
  type AccessFields,
  type AccountType,
  type FeatureKey,
  type Plan,
} from '@/lib/access'

/** Pure helpers for the admin page (specs/027-plans-addons-admin). */

export const PORTFOLIO_REMOVED_REASON = 'Portfolio access removed by admin'

/** PATCH /api/admin/users/[id] body: plan and/or the full add-on list. */
export const AdminUserPatchSchema = z.object({
  plan:     PlanSchema.optional(),
  features: z.array(FeatureKeySchema).max(10).optional(),
}).strict().refine(v => v.plan !== undefined || v.features !== undefined, {
  message: 'Nothing to update',
})

export type AdminUserPatch = z.infer<typeof AdminUserPatchSchema>

export type PatchPlan =
  | { ok: false; reason: 'assistant' }
  | {
      ok: true
      before: AccessFields
      next: AccessFields
      planChanged: boolean
      featuresChanged: boolean
      /** Portfolio was on and is now off → pause trading + autopilot off. */
      portfolioRemoved: boolean
    }

/** What a PATCH changes for a user_roles row. Assistants inherit from their linked member and cannot be edited. */
export function planUserPatch(row: unknown, patch: AdminUserPatch): PatchPlan {
  const current = readAccessFields(row)
  if (current.accountType === 'assistant') return { ok: false, reason: 'assistant' }
  const before: AccessFields = { accountType: 'member', plan: current.plan, features: current.features }
  const next: AccessFields = {
    accountType: 'member',
    plan:        patch.plan ?? before.plan,
    features:    patch.features !== undefined ? normalizeFeatures(patch.features) : [...before.features],
  }
  const planChanged = next.plan !== before.plan
  const featuresChanged = next.features.join(',') !== before.features.join(',')
  const portfolioRemoved = before.features.includes('portfolio') && !next.features.includes('portfolio')
  return { ok: true, before, next, planChanged, featuresChanged, portfolioRemoved }
}

export interface PortfolioStatus {
  termsAcceptedAt: string | null
  /** null = not connected */
  alpaca: 'paper' | 'live' | null
  /** null = unknown (table missing before migration 20261121) */
  aiKeyAdded: boolean | null
  lastRun: { at: string; status: string } | null
  autopilotMode: string
  dryRun: boolean
  tradingPaused: boolean
}

export interface AdminUserRow {
  id: string
  displayName: string
  email: string
  accountType: AccountType
  plan: Plan
  features: FeatureKey[]
  createdAt: string | null
  status: 'active' | 'deactivated'
  isAdmin: boolean
  /** Assistants: the member accounts they are actively linked to. */
  linkedMainAccounts: { id: string; displayName: string }[]
  portfolio: PortfolioStatus
  /** 'legacy_role' until migration 20261121b is applied. */
  source: 'columns' | 'legacy_role'
}

export interface AdminUserInputs {
  roleRow: Record<string, unknown>
  email: string
  isAdmin: boolean
  linkedMainAccounts: { id: string; displayName: string }[]
  termsAcceptedAt: string | null
  alpacaIsPaper: boolean | null
  aiKeyAdded: boolean | null
  lastRun: { at: string; status: string } | null
  settingsRow: Record<string, unknown> | null
}

/** One table row. Settings defaults mirror readSafetySettings / readAutopilotSettings (dry run ON, autopilot off). */
export function buildAdminUserRow(input: AdminUserInputs): AdminUserRow {
  const fields = readAccessFields(input.roleRow)
  const s = input.settingsRow ?? {}
  const mode = typeof s.autopilot_mode === 'string' ? s.autopilot_mode : 'off'
  return {
    id:                 String(input.roleRow.user_id ?? ''),
    displayName:        typeof input.roleRow.display_name === 'string' ? input.roleRow.display_name : 'Unknown',
    email:              input.email,
    accountType:        fields.accountType,
    plan:               fields.plan,
    features:           fields.features,
    createdAt:          typeof input.roleRow.created_at === 'string' ? input.roleRow.created_at : null,
    status:             input.roleRow.status === 'deactivated' ? 'deactivated' : 'active',
    isAdmin:            fields.accountType === 'member' && input.isAdmin,
    linkedMainAccounts: fields.accountType === 'assistant' ? input.linkedMainAccounts : [],
    portfolio: {
      termsAcceptedAt: input.termsAcceptedAt,
      alpaca:          input.alpacaIsPaper === null ? null : input.alpacaIsPaper ? 'paper' : 'live',
      aiKeyAdded:      input.aiKeyAdded,
      lastRun:         input.lastRun,
      autopilotMode:   ['off', 'approval', 'auto'].includes(mode) ? mode : 'off',
      dryRun:          s.dry_run === false ? false : true,
      tradingPaused:   s.trading_paused === true,
    },
    source: fields.source,
  }
}

/** Latest run per user from rows sorted newest first. */
export function latestRunByUser(rows: { user_id: string; run_at: string; status: string }[]): Map<string, { at: string; status: string }> {
  const map = new Map<string, { at: string; status: string }>()
  for (const row of rows) {
    if (!map.has(row.user_id)) map.set(row.user_id, { at: row.run_at, status: row.status })
  }
  return map
}

/** Sort: admins first, then members before assistants, then by name. */
export function sortAdminUserRows(rows: AdminUserRow[]): AdminUserRow[] {
  return [...rows].sort((a, b) => {
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1
    if (a.accountType !== b.accountType) return a.accountType === 'member' ? -1 : 1
    return a.displayName.localeCompare(b.displayName)
  })
}
