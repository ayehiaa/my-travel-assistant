# Tasks: Portfolio Tier System — premium_plus Role + /portfolio Middleware + T&C Gate

**Issue**: #73 | **Spec**: `specs/015-portfolio-advisor/spec.md` | **Plan**: `specs/015-portfolio-advisor/plan.md`

**Scope**: This tasks.md covers only issue #73. It does not include holdings, settings, Inngest, agents, or any other portfolio slice.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1–US5)
- Exact file paths included in every task description

---

## Phase 1: Foundational — Type System + DB Migration

**Purpose**: Add `premium_plus` to the TypeScript type and database enum. Everything else in this issue depends on the type existing.

**⚠️ CRITICAL**: No other tasks can begin until T001 is complete.

- [ ] T001 Add `'premium_plus'` to `UserRole` type union in `src/types/database.ts` (change line: `export type UserRole = 'main' | 'assistant' | 'premium'` → add `| 'premium_plus'`)
- [ ] T002 Create Supabase migration file `supabase/migrations/<timestamp>_add_premium_plus_role.sql`: `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'premium_plus';`
- [ ] T003 Create Supabase migration file `supabase/migrations/<timestamp>_create_user_profiles.sql`: create `user_profiles` table with `user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `portfolio_tos_accepted_at timestamptz NULL`, `created_at timestamptz NOT NULL DEFAULT now()`; add RLS policy allowing users to read/update only their own row

**Checkpoint**: `UserRole` type compiles with `'premium_plus'`; migration SQL files exist and are ready to apply.

---

## Phase 2: User Story 1 — Route Gating (middleware + /agents re-gate)

**Goal**: All `/portfolio/*` routes are protected by auth. `/agents` page requires `premium_plus` instead of `premium`.

**Independent Test**: Visit `/portfolio/anything` while logged out → redirected to `/login`. Log in as `premium` user → redirected away from `/portfolio`. Log in as `premium` user → `/agents` redirects away. Log in as `premium_plus` user → `/agents` is accessible.

- [ ] T004 [US1] Update `src/middleware.ts`: add `/portfolio` to the pathname prefix check so all `/portfolio/*` routes redirect unauthenticated users to `/login` (follow the existing `!user && !isPublicRoute` pattern; `/portfolio/*` is already non-public so no change needed there — verify and confirm the existing catch-all handles it)
- [ ] T005 [US1] Update `src/app/agents/page.tsx`: change role guard from `user.role !== 'premium'` to `user.role !== 'premium_plus'`; update redirect to `'/'`
- [ ] T006 [US1] Update `src/app/api/agents/run/route.ts`: change role guard from `roleRecord?.role !== 'premium'` to `roleRecord?.role !== 'premium_plus'`

**Checkpoint**: `/agents` and `/api/agents/run` are inaccessible to `premium` users; `premium_plus` users can access both.

---

## Phase 3: User Story 2 — Nav Update

**Goal**: Nav shows Portfolio link for `premium_plus` users; Agents link is `premium_plus`-only; role badge displays correctly.

**Independent Test**: Log in as `premium` → no Portfolio nav item, no Agents nav item. Log in as `premium_plus` → both Portfolio and Agents appear. Role badge shows "Premium+" label.

- [ ] T007 [US2] Update `src/components/Nav.tsx` links array: (1) change Agents condition from `user.role === 'premium'` to `user.role === 'premium_plus'`; (2) add Portfolio entry `{ href: '/portfolio', label: 'Portfolio' }` with same `premium_plus` condition; (3) update Settings condition on line 40 from `user.role === 'main' || user.role === 'premium'` to also include `user.role === 'premium_plus'` so premium_plus users see the Settings link
- [ ] T008 [US2] Update role badge display in `src/components/Nav.tsx`: change the inline ternary that shows "Premium" label to handle three cases — `'premium_plus'` → `'Premium+'`, `'premium'` → `'Premium'`, else `'Main'` (desktop display line ~129 and mobile line ~212)

**Checkpoint**: Nav renders correct items and labels for all three non-assistant role tiers.

---

## Phase 4: User Story 3 — T&C Gate API Route

**Goal**: `POST /api/portfolio/tos-accept` sets `portfolio_tos_accepted_at` on the user's `user_profiles` row, creating the row if it does not exist.

**Independent Test**: Authenticated `premium_plus` user calls `POST /api/portfolio/tos-accept` → 200 with `{ accepted_at }`. Second call returns 200 (idempotent). Non-`premium_plus` user → 403. Unauthenticated → 401.

- [ ] T009 [US3] Create `src/app/api/portfolio/tos-accept/route.ts`: auth-first with `supabase.auth.getUser()` → 401 if no user; fetch role from `user_roles` → 403 if not `premium_plus`; upsert `user_profiles` row setting `portfolio_tos_accepted_at = now()` on conflict `(user_id)` do update; return `200 { accepted_at: string }`; use `createAdminClient()` for the upsert (admin client bypasses RLS — intentional pattern for write routes per constitution)

**Checkpoint**: `POST /api/portfolio/tos-accept` sets the column correctly; unauthenticated and wrong-role requests are rejected.

---

## Phase 5: User Story 4 — Portfolio Page + T&C Gate UI

**Goal**: `/portfolio` renders a full-screen T&C acceptance gate for `premium_plus` users who haven't accepted yet; shows a "Portfolio coming soon" placeholder once accepted.

**Independent Test**: Log in as `premium_plus` (no T&C accepted) → visit `/portfolio` → see full-screen gate with checkbox and confirm button. Accept → `portfolio_tos_accepted_at` set → gate gone on next visit → placeholder shown. Log in as `premium` → redirected to `/`. 

- [ ] T010 [US4] Create `src/app/portfolio/page.tsx` (server component): auth-first with `getAuthUser()` → redirect to `/login` if null; redirect to `/` if role is not `premium_plus`; query `user_profiles` for `portfolio_tos_accepted_at`; if null render `<PortfolioTosGate />`; if set render placeholder div with heading "Portfolio" and subtext "Your portfolio dashboard is coming soon."
- [ ] T011 [US4] Create `src/components/portfolio/PortfolioTosGate.tsx` (client component): full-screen centered card with Sojourn brand styling; heading "Before you continue"; disclaimer paragraph "This feature provides AI-generated analysis for informational purposes only. It is not regulated financial advice. Always consult a qualified financial advisor before making investment decisions."; checkbox "I understand this is not regulated financial advice"; disabled "Continue" button that enables when checkbox is checked; on confirm calls `POST /api/portfolio/tos-accept` then redirects via `window.location.href = '/portfolio'` (not `router.push`) to carry session cookie

**Checkpoint**: T&C gate renders, calls the API, and redirects correctly. Accepted users see the placeholder. Non-`premium_plus` users are blocked.

---

## Phase 6: Polish & Cross-Cutting

**Purpose**: Verify the full vertical slice is consistent and the quality gates pass.

- [ ] T012 [P] Run `npm run build` and fix any TypeScript errors introduced by the `UserRole` type change (check all files that reference `'premium'` role for places that should also handle `'premium_plus'`)
- [ ] T013 [P] Run `npm run lint` and fix any ESLint warnings in new/modified files
- [ ] T014 Run `npm test` — confirm all existing tests still pass (no new pure functions introduced in this slice; no test additions needed)
- [ ] T015 [P] Fix all `role !== 'premium'` guards in gmail routes/pages that will block `premium_plus` users from features they should inherit: update `src/app/api/gmail/auth-url/route.ts`, `src/app/api/gmail/import/route.ts`, `src/app/api/gmail/trips/route.ts`, `src/app/gmail/callback/route.ts`, `src/app/gmail/review/page.tsx` — change each `role !== 'premium'` check to `role !== 'premium' && role !== 'premium_plus'` (or extract a `isPremiumOrAbove()` helper in `src/lib/auth.ts`); then scan for any other `role === 'premium'` guards outside agents + gmail and confirm intentionality

**Checkpoint**: `npm run build`, `npm test`, `npm run lint` all pass. No regressions.

---

## Dependencies & Execution Order

```
T001, T002, T003 (Phase 1 — foundational, run first)
    ↓
T004, T005, T006 [US1 — can run in parallel after Phase 1]
T007, T008       [US2 — can run in parallel after Phase 1]
T009             [US3 — can run in parallel after Phase 1]
    ↓
T010, T011       [US4 — T010 depends on T009 being deployable; T011 can be written in parallel]
    ↓
T012–T015        [Polish — after all implementation complete]
```

### Parallel Opportunities

```
# After T001 completes, these can all run simultaneously:
Task T004: Update middleware
Task T005: Update agents page
Task T006: Update agents API route
Task T007: Update Nav links
Task T008: Update Nav role badge
Task T009: Create tos-accept API route

# T010 and T011 can be written in parallel (different files):
Task T010: Portfolio page (server component)
Task T011: PortfolioTosGate component (client component)
```

---

## DB Migrations Required

Before testing in any environment, apply these migrations to Supabase in order:

1. `<timestamp>_add_premium_plus_role.sql` — adds `premium_plus` to the role enum
2. `<timestamp>_create_user_profiles.sql` — creates `user_profiles` table with RLS

To promote a test user to `premium_plus` after migration:
```sql
UPDATE user_roles SET role = 'premium_plus' WHERE user_id = '<your-user-id>';
```
