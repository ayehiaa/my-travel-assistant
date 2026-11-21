# Feature Spec: 027 Plans, add-ons and admin

**Status**: Implemented · **Date**: 2026-11-21 · **Owner-approved design** (built autonomously; no clarify step)

## Summary
`user_roles.role` (main | assistant | premium | premium_plus) mixed four things: plan limits, the Portfolio feature,
the power to invite customers and the assistant relationship. It is replaced by independent dimensions:

| Dimension | Values | Meaning |
|---|---|---|
| Account type | `member` \| `assistant` | assistant = acts on a linked member account (unchanged behaviour) |
| Plan | `free` \| `plus` | free: beta limits (10 trips, 10 expenses, 1 assistant); plus: unlimited + Gmail import |
| Add-ons | `text[]` of feature keys — only `portfolio` for now | Portfolio (beta) access |
| Admin | env `APP_ADMIN_EMAILS` (comma-separated, case-insensitive) — never stored | invite customers, manage users, `/admin` |

Legacy mapping (backfill): main → member/free/[]; premium → member/plus/[]; premium_plus → member/plus/[portfolio];
assistant → assistant/free/[]. Assistants inherit plan (and, display-only, add-ons) from their ACTIVE linked member
account at runtime; they never get Portfolio and are never admins.

## User stories
1. As the owner (admin), I invite a friend with a plan (Free/Plus) and optionally Portfolio (beta).
2. As the owner, I see every user with plan, add-ons and Portfolio status, and change plan / Portfolio inline.
3. As the owner, removing Portfolio from someone stops anything from trading on their account.
4. As a user, I see my plan and add-ons in Settings and the Nav badge.
5. As a non-admin, I can no longer invite customers or escalate my own access in any way.

## Acceptance criteria
### Access model
- AC1 `src/lib/access.ts` (pure, tested): `deriveAccess(row, {email, adminEmails, linkedMain})`, `isAdminEmail`,
  `hasFeature`, `isPlus`, `limitsFor`, `legacyRoleFor`, labels. Columns are read when present; otherwise derived from
  `role`. A legacy role `assistant` always yields an assistant (safety net).
- AC2 `getAuthUser()` returns `access` (accountType, plan, features, isAdmin, effectivePlan, effectiveFeatures,
  source); the `role` field is removed from `AuthUser` and `UserContext` so every caller had to move to the helpers.
- AC3 Portfolio: every `/api/portfolio/**` route, `/portfolio` pages, approval routes, scheduler, autopilot and the
  weekly summary use `hasFeature(access, 'portfolio')`. Gmail import + unlimited: `isPlus` / `limitsFor`. Inviting
  assistants: member accounts. Inviting customers: admins only. `ANTHROPIC_KEY_OWNER_EMAILS` (026) unchanged.
### Migration (`20261121b_plans_addons_admin.sql`, `supabase/apply_plans_addons_admin.sql`)
- AC4 `user_roles.account_type` (member|assistant), `plan` (free|plus), `features text[]` (<@ {portfolio}), defaults
  member/free/{}; backfill from role (only rows still at defaults → re-runnable).
- AC5 `role` is kept and written consistently via `legacyRoleFor` (Free + Portfolio → `main`).
- AC6 Security: no client writes to `user_roles` / `customer_invitations` (see RLS findings).
- AC7 `customer_invitations.plan/features` (+ CHECKs, backfill from the 026 role column, which stays populated).
- AC8 `audit_log_action_check` recreated with the FULL list + `user_plan_changed`, `user_features_changed`,
  `customer_invited`, `customer_invitation_revoked`.
### Customer invitations (admin only)
- AC9 Form: name, email, plan (Free/Plus) radio + "Portfolio (beta)" checkbox with one-line explanations.
- AC10 `POST/GET /api/customer-invitations`, `/resend`, `DELETE /api/customer-invitations/[id]` (revoke): 403 for
  non-admins; Zod `CustomerInviteSchema` (strict). Before 20261121b only combinations the role column can carry are
  accepted (Free + Portfolio → 400 "needs a database update"); never silently downgraded.
- AC11 Signup applies the invitation's plan/add-ons only when the inviter is (still) an admin; otherwise Free/[].
  Legacy role inserted first, new columns written in a best-effort update.
- AC12 Email lists plan + Portfolio requirements (own Alpaca + own Anthropic key, as in 026).
### Admin page
- AC13 `/admin` (server-side admin check, Nav link only for admins). `GET /api/admin/users`,
  `PATCH /api/admin/users/[id]` (Zod `{plan?, features?}`, strict — cannot touch admin/account_type/role).
- AC14 Table: name, email, account type, plan, add-ons, created, linked member for assistants, Portfolio status
  (terms, Alpaca paper/live, AI key, last run + status, autopilot mode, dry run, paused). Inline plan select +
  Portfolio checkbox (confirm on removal). Pending invitations with resend / revoke.
- AC15 Removing Portfolio → `setTradingPause(user, true, "Portfolio access removed by admin")`,
  `cancelInFlightExecutions`, `autopilot_mode = 'off'`; audited in `user_features_changed`.
### UI copy
- AC16 Settings shows plan ("Free (beta limits)" / "Plus") with description and add-ons; admins get a link to /admin.
  Nav badge: "Free", "Plus", "Plus · Portfolio", "Free · Portfolio"; assistants unchanged.

## RLS findings
- `user_roles`: migrations only ever created `authenticated users can read user_roles` (SELECT, `using (true)`). No
  INSERT/UPDATE/DELETE policy exists in the migrations, and there is NO client-side `.from('user_roles').update/insert`
  anywhere in `src/` — every write (signup, auth callback, assistant invite, deactivation, reference date, admin PATCH)
  uses the service-role client. Risk: Supabase grants table write privileges to `anon`/`authenticated` by default, so
  any policy added later (e.g. via the dashboard) would allow self-escalation. **Fix**: the migration drops every
  non-SELECT policy on `user_roles` (whatever its name), re-creates the read policy if missing, and revokes
  INSERT/UPDATE/DELETE/TRUNCATE from `anon, authenticated`.
- `customer_invitations`: 008 created client SELECT + INSERT policies for role `premium`, i.e. a premium user could
  insert invitation rows straight from the browser. **Fix**: both policies dropped + client writes revoked (the API
  uses the service role). Independently, signup only honours plan/add-ons of invitations whose inviter is an admin.
- `delete_user(uuid)` (007) is `SECURITY DEFINER` and executable by PUBLIC → any signed-in user could call it via
  `/rest/v1/rpc/delete_user`. **Fix**: `revoke execute ... from public, anon, authenticated` (app never calls it).
- Not changed (noted): `user_roles` is readable by every authenticated user (display names, now also plan/add-ons);
  `account_links` has client INSERT/DELETE policies gated on `role = 'main'` (unused by the app; Free members keep
  role `main`, so behaviour is unchanged).

## Decisions made autonomously
1. `AuthUser.role` / `UserContext.role` removed (not kept alongside) so the compiler found every role comparison.
   `UserRole` remains only for the legacy column type.
2. Assistants: `effectivePlan` follows the active linked member (same cookie/fallback resolution as the data scope).
   `hasFeature` is always false for assistants; `isAdmin` is always false for assistants.
3. Safety net: legacy `role = 'assistant'` wins over `account_type`, because assistant creation writes the legacy
   role first and the new columns best-effort.
4. Unknown legacy role → member/free/[] (most restricted member).
5. Invitations by non-admins (legacy pending "premium" invites) still let the friend sign up, but as Free/[].
6. Resending an invitation re-issues it from the current admin (`invited_by` updated) so signup's admin check passes.
7. Revoke = status `expired` + `expires_at = now()` (the status CHECK has no `revoked`; avoided a constraint change).
8. Added audit actions `customer_invited` and `customer_invitation_revoked` (CLAUDE.md: writes are audited).
9. Removing Portfolio pauses trading + cancels in-flight app executions + autopilot off, but does NOT cancel open
   orders on the user's Alpaca account (they may be the user's own); re-enabling Portfolio never resumes trading or
   turns dry run off (the user does that). No notification email (the 023 `trading_paused` template only knows
   manual / loss-stop sources).
10. Downgrading Plus → Free keeps existing data; limits only block new trips/expenses/assistants.
11. Fixed along the way: `/api/settings/reference-date` and `/api/invitations/resend` allowed only `main`; now any
    member (premium users were wrongly refused). Inviting an existing Free/Plus member as an assistant is refused
    (previously only `main` was refused).
12. Admin PATCH before the migration: writes the legacy role only and refuses Free + Portfolio with 409.
13. Customer invitations moved from Settings to `/admin` (Settings links there for admins).
14. Admin list loads up to 1000 auth users / 2000 recent runs (fine for a beta; paginate later).

## Out of scope / follow-ups
- Dropping the legacy `role` column (after the migration has been applied everywhere).
- Billing for Plus; more add-ons; restricting user_roles reads to own row + linked accounts.
