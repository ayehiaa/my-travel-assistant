# Tasks: 027 Plans, add-ons and admin

## Pure logic (tested)
- [x] T1 `src/lib/access.ts` + `access.test.ts` (legacy roles, columns, assistants inheriting, missing columns, admin emails, limits)
- [x] T2 `src/lib/invitationRoles.ts` rewritten for plan/add-ons + tests (invite validation, signup resolution)
- [x] T3 `src/lib/adminUsers.ts` + tests (PATCH validation, patch planning, rows)

## Database
- [x] T4 `supabase/migrations/20261121b_plans_addons_admin.sql` (columns, backfill, RLS hardening, invitations, delete_user revoke, audit FULL list)
- [x] T5 `supabase/apply_plans_addons_admin.sql` (single transaction, pre-checks incl. 20261121, verify queries)
- [x] T6 `types/database.ts`: new optional columns, `AuditAction` += 4

## Access plumbing
- [x] T7 `getAuthUser` → `access`; `UserContext`; `activeAccount` resolution for assistants
- [x] T8 `accessServer.ts`; Inngest scheduler / autopilot / weekly summary use the Portfolio add-on
- [x] T9 All `/api/portfolio/**` routes, portfolio pages, approval routes → `hasFeature('portfolio')`
- [x] T10 Trips / expenses limits, Gmail import, assistants invite/resend, account links, reference date

## Invitations
- [x] T11 Customer invitation routes admin-only with plan/features; revoke route; email copy
- [x] T12 Signup applies plan/features from admin invitations (best-effort new columns)

## Admin + UI
- [x] T13 `GET /api/admin/users`, `PATCH /api/admin/users/[id]` (Portfolio removal → pause + cancel + autopilot off)
- [x] T14 `/admin` page, users table, invite manager; Nav link + badge; Settings plan/add-ons; audit pills

## Gate
- [x] T15 `npm run build`, `npm test`, `npm run lint`; spec decisions + CLAUDE.md pointer
