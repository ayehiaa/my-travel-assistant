# Implementation Plan: 027 Plans, add-ons and admin

**Spec**: `spec.md` · **Branch**: `claude/awesome-brahmagupta-pbgvsg` (no feature branch, per brief)

## Constitution check
- Auth first in every API route (`getAuthUser` → 401, admin/feature → 403); Zod at the boundary (strict schemas);
  `logAudit` on writes (`user_plan_changed`, `user_features_changed`, `customer_invited`, `customer_invitation_revoked`).
- Pure logic in `src/lib/*` with Vitest tests next to the files; no Supabase/Next mocks.
- Trading safety: never weakened. Portfolio checks became `hasFeature` everywhere they were `premium_plus`; removing
  the add-on pauses trading via the existing `tradingSafety` helpers; nothing resumes trading or turns dry run off.
- Migration-optional: `select('*')` + `deriveAccess` fallback to `role`; new columns written best-effort.

## Modules
### Pure (tested)
| File | Purpose |
|---|---|
| `src/lib/access.ts` | types, `deriveAccess`, `readAccessFields`, `isAdminEmail`, `hasFeature`, `isPlus`, `limitsFor`, `isAtLimit`, `legacyRoleFor`, `accessColumns`, labels, `accessBadge` |
| `src/lib/invitationRoles.ts` | `CustomerInviteSchema`, `readInvitationAccess`, `legacyInvitationRole`, `resolveSignupAccess`, email bullets, `isMissingSchemaError` |
| `src/lib/adminUsers.ts` | `AdminUserPatchSchema`, `planUserPatch`, `buildAdminUserRow`, `latestRunByUser`, `sortAdminUserRows` |

### Server
| File | Change |
|---|---|
| `src/lib/auth.ts` | `getAuthUser` returns `access` (assistants: active linked member's plan) |
| `src/lib/activeAccount.ts` | `resolveActiveMainAccountId(userId, accountType)` |
| `src/lib/accessServer.ts` | `loadAccessById`, `userHasPortfolio`, `filterPortfolioUsers` (service role, fail closed) |
| `src/lib/adminUsersServer.ts` | `loadAdminUsers` (best-effort joins) |
| `src/app/api/admin/users/route.ts`, `[id]/route.ts` | GET list, PATCH plan/features (+ pause on Portfolio removal) |
| `src/app/api/customer-invitations/**` | admin-only; plan/features; revoke route |
| `src/app/api/auth/signup/route.ts` | plan/features from admin invitations |
| portfolio routes/pages, `approvalDecisionRoute`, Inngest `scheduledRuns`, `autopilotExecute`, `notifications` | `hasFeature` |
| trips / expenses / gmail / invitations / account-links / reference-date | `limitsFor`, `isPlus`, `isMember`, `isAssistant` |

### UI
`/admin` page, `components/admin/AdminUsersTable.tsx`, `components/admin/CustomerInviteManager.tsx` (moved from
settings), Nav (Admin link + badge), Settings (plan + add-ons), dashboard/expenses props (`isAssistant`,
`canImportGmail`, `expenseLimit`), audit pills.

### Database
`supabase/migrations/20261121b_plans_addons_admin.sql` + `supabase/apply_plans_addons_admin.sql`.

## Env
`APP_ADMIN_EMAILS` — comma-separated admin emails (unset → nobody is admin; customer invites and /admin disabled).
