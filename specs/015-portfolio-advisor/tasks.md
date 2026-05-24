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

---
---

# Tasks: Portfolio Holdings Management + Settings (Issue #74)

**Issue**: #74 | **Spec**: `specs/015-portfolio-advisor/spec.md` | **Plan**: `specs/015-portfolio-advisor/plan.md`

**Scope**: Issue #74 only — `portfolio_holdings` and `portfolio_settings` DB tables + migration, holdings CRUD API, Polygon.io ticker autocomplete proxy, settings API, portfolio overview UI, settings UI, and TypeScript types. Issue #73 (tier system, middleware, T&C gate, Nav, `user_profiles` migration) is already merged.

**Auth pattern**: Use `getAuthUser()` from `@/lib/auth` — returns `AuthUser | null` with `.role` already resolved. Check `user.role !== 'premium_plus'` for 403. Do NOT use raw `supabase.auth.getUser()` + separate `user_roles` query.

**Data scoping**: Scope all portfolio queries to `user.id` directly — portfolio is owner-only, no assistant access. Do NOT use `getActiveMainAccountId`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label — maps to spec.md stories 2–9

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: TypeScript types, audit action strings, and DB migration that all other tasks depend on.

**⚠️ CRITICAL**: No other tasks can begin until T101 and T102 are complete.

- [ ] T101 Add to `src/types/database.ts`: (1) `RiskProfile = 'conservative' | 'moderate' | 'aggressive'` type alias; (2) `PortfolioHolding { id: string, user_id: string, ticker: string, company_name: string, total_value_usd: number, created_at: string, updated_at: string }` interface; (3) `PortfolioSettings { user_id: string, cash_usd: number, target_return_pct: number, risk_profile: RiskProfile, run_interval_days: 7 | 14 | 30, last_run_at: string | null, next_run_at: string | null, created_at: string, updated_at: string }` interface; (4) extend `AuditAction` union to add `'holding_created' | 'holding_updated' | 'holding_deleted' | 'portfolio_settings_updated'`
- [ ] T102 [P] Create `supabase/migrations/015_portfolio_holdings_settings.sql`: create `portfolio_holdings` table (`id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `ticker text NOT NULL`, `company_name text NOT NULL`, `total_value_usd numeric(12,2) NOT NULL CHECK (total_value_usd > 0)`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`, `UNIQUE (user_id, ticker)`); create `portfolio_settings` table (`user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `cash_usd numeric(12,2) NOT NULL DEFAULT 0 CHECK (cash_usd >= 0)`, `target_return_pct numeric(5,2) NOT NULL DEFAULT 10 CHECK (target_return_pct > 0)`, `risk_profile text NOT NULL DEFAULT 'moderate' CHECK (risk_profile IN ('conservative','moderate','aggressive'))`, `run_interval_days integer NOT NULL DEFAULT 30 CHECK (run_interval_days IN (7,14,30))`, `last_run_at timestamptz NULL`, `next_run_at timestamptz NULL`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`); enable RLS on both tables; `portfolio_holdings` policy: users can SELECT/INSERT/UPDATE/DELETE only rows where `user_id = auth.uid()`; `portfolio_settings` policy: users can SELECT/UPDATE only their own row

**Checkpoint**: TypeScript compiles with new types and audit actions; migration SQL file exists and is ready to apply.

---

## Phase 2: Holdings API (User Stories 2, 3, 5)

**Goal**: All backend CRUD routes for stock holdings + Polygon.io ticker autocomplete proxy.

**Independent Test**: `POST /api/portfolio/holdings` with valid body → 201. Same ticker again → 409. `GET` → list by value desc with total. `PUT /[id]` → 200. `DELETE /[id]` → 204. Wrong user's holding → 404. Unauthenticated → 401. Non-`premium_plus` → 403. `GET /tickers/search?q=AAPL` → results array.

- [ ] T103 [US2] Create `src/app/api/portfolio/holdings/route.ts`: `GET` — `const user = await getAuthUser()` → 401 if null; `if (user.role !== 'premium_plus')` → 403; `const supabase = await createClient()`; query `portfolio_holdings` where `user_id = user.id` order by `total_value_usd DESC`; compute `total_holdings_usd` as sum; return `{ holdings, total_holdings_usd }`; `POST` — same auth/role checks; Zod `z.object({ ticker: z.string().min(1).max(10), company_name: z.string().min(1).max(100), total_value_usd: z.number().positive() })`; use `createClient()` to insert (RLS enforces user_id scoping); catch Postgres unique constraint violation (`error.code === '23505'`) → 409 `{ error: 'This ticker is already in your portfolio' }`; `await logAudit({ performedBy: user.id, action: 'holding_created', tripId: null })`; return 201 `{ holding }`
- [ ] T104 [P] [US5] Create `src/app/api/portfolio/holdings/[id]/route.ts`: `PUT` — `getAuthUser()` → 401/403; `const { id } = await params` (params is `Promise<{ id: string }>` in Next.js 16 App Router); Zod `z.object({ total_value_usd: z.number().positive() })`; `const supabase = await createClient()`; update where `id = id AND user_id = user.id`; if 0 rows updated → 404 `{ error: 'Holding not found' }`; `await logAudit({ performedBy: user.id, action: 'holding_updated', tripId: null })`; return 200 `{ holding }`; `DELETE` — `getAuthUser()` → 401/403; `const { id } = await params`; use `createClient()` to delete where `id = id AND user_id = user.id`; if 0 rows deleted → 404; `await logAudit({ performedBy: user.id, action: 'holding_deleted', tripId: null })`; return 204
- [ ] T105 [P] [US2] Create `src/app/api/portfolio/tickers/search/route.ts`: `GET` — `getAuthUser()` → 401/403; read `q` from `request.nextUrl.searchParams`; if missing/empty → 400 `{ error: 'Missing q parameter' }`; fetch `https://api.polygon.io/v3/reference/tickers?search=${q}&active=true&market=stocks&limit=10&apiKey=${process.env.POLYGON_API_KEY}`; map response to `{ results: [{ ticker, name, primary_exchange }] }`; return 200; on fetch error → 500 `{ error: 'Ticker search unavailable' }`

**Checkpoint**: All holdings CRUD and ticker search routes return correct status codes; auth/role guards work; duplicate ticker returns 409.

---

## Phase 3: Settings API (User Stories 7, 8, 9)

**Goal**: Backend for portfolio configuration (risk profile, target return, schedule, cash).

**Independent Test**: `GET /api/portfolio/settings` with no prior row → creates default, returns it; call again → same row (idempotent). `PUT` with `{ risk_profile: 'aggressive' }` → 200. Invalid `risk_profile` → 400. `cash_usd: -1` → 400. Unauthenticated → 401.

- [ ] T106 [US7] Create `src/app/api/portfolio/settings/route.ts`: `GET` — `getAuthUser()` → 401/403; `const supabase = await createClient()`; attempt insert of default row via `supabase.from('portfolio_settings').insert({ user_id: user.id }).select().single()` — if error code `23505` (row exists) do nothing; then select the row with `supabase.from('portfolio_settings').select().eq('user_id', user.id).single()` and return `{ settings: PortfolioSettings }`; `PUT` — `getAuthUser()` → 401/403; Zod partial `z.object({ cash_usd: z.number().min(0).optional(), target_return_pct: z.number().positive().optional(), risk_profile: z.enum(['conservative','moderate','aggressive']).optional(), run_interval_days: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional() }).strict()`; `const supabase = await createClient()`; update `portfolio_settings` set validated fields + `updated_at = now()` where `user_id = user.id`; `await logAudit({ performedBy: user.id, action: 'portfolio_settings_updated', tripId: null })`; return 200 `{ settings }`

**Checkpoint**: GET always returns a row (creates default on first access). PUT accepts partial updates, rejects invalid values with 400.

---

## Phase 4: Portfolio Overview UI (User Stories 2, 3, 4, 5, 6)

**Goal**: Upgrade `/portfolio` from placeholder to working overview — holdings table, totals, add/edit/delete.

**Independent Test**: Log in as `premium_plus` with T&C accepted → `/portfolio` shows `PortfolioOverview` (skeleton → table or empty state). "Add holding" button opens modal. Autocomplete fires on 2+ chars. Submit adds row. Edit prefills modal. Delete removes row. Totals update. T&C gate still works for new users.

- [ ] T107 [US2] Create `src/components/portfolio/TickerAutocomplete.tsx` (`'use client'`): props `{ value: string, onChange: (val: string) => void, onSelect: (result: { ticker: string, company_name: string }) => void, placeholder?: string }`; debounce `GET /api/portfolio/tickers/search?q=${value}` 300ms (min 2 chars) via `useEffect` + `useRef` timeout; render relative-positioned wrapper with input + absolute dropdown below; each item shows `{ticker} — {name}`; on select: call `onSelect`, clear dropdown; close on Escape and outside click; spinner inside input during fetch; "No matching tickers" empty state
- [ ] T108 [US2] Create `src/components/portfolio/HoldingForm.tsx` (`'use client'`): modal form (consistent with existing `AddExpenseModal` pattern); props `{ isOpen: boolean, onClose: () => void, onSuccess: () => void, editHolding?: PortfolioHolding }`; add mode: `TickerAutocomplete` populates `ticker` + `company_name` + number input for `total_value_usd` (min 0.01, step 0.01, "$" prefix); edit mode: read-only ticker/company display, only `total_value_usd` editable via the same modal (AC2 "inline" = within the app via modal, not in-place table cell editing); add calls `POST /api/portfolio/holdings`, edit calls `PUT /api/portfolio/holdings/${editHolding.id}`; on 409 show inline error "This ticker is already in your portfolio"; on success: `onSuccess()` then `onClose()`; `useToast()` for other errors; fixed overlay modal with centered white card; disable submit while loading
- [ ] T109 [P] [US6] Create `src/components/portfolio/PortfolioOverview.tsx` (`'use client'`): fetch `GET /api/portfolio/holdings` and `GET /api/portfolio/settings` in parallel on mount; show `<Skeleton />` (`import { Skeleton } from '@/components/ui/Skeleton'`) during load; empty state: "No holdings yet — add your first holding"; holdings table columns: Ticker, Company, Value (USD), Actions (Edit / Delete); table footer: "Total Holdings" + formatted sum; Cash row from settings; Grand Total = holdings + cash; "Add Holding" button (top right) opens `HoldingForm` add mode; Edit opens `HoldingForm` edit mode prefilled; Delete calls `DELETE /api/portfolio/holdings/${id}` with `window.confirm` then re-fetches; `onSuccess` triggers re-fetch; link "Update cash & settings →" to `/portfolio/settings`; scope all fetches to `user.id` via the API (no `activeMainAccountId`)
- [ ] T110 [US6] Upgrade `src/app/portfolio/page.tsx` (server component): keep `getAuthUser()` → redirect `/login` if null; keep redirect `/` if not `premium_plus`; keep T&C gate (`<PortfolioTosGate />` if no `portfolio_tos_accepted_at`); replace placeholder `<div>` with `<PortfolioOverview />` when T&C accepted; page heading "Portfolio"

**Checkpoint**: Full portfolio overview works end-to-end. T&C gate unchanged. Holdings CRUD flows correctly in browser.

---

## Phase 5: Portfolio Settings UI (User Stories 7, 8, 9)

**Goal**: `/portfolio/settings` page for risk profile, target return, schedule, and cash configuration.

**Independent Test**: Visit `/portfolio/settings` → form loads with current values. Change risk profile to "aggressive" → Save → reload → persists. Invalid target return (0) → inline error. Toast "Settings saved" on success. Non-`premium_plus` user → redirected to `/`.

- [ ] T111 [US7] Create `src/components/portfolio/PortfolioSettingsForm.tsx` (`'use client'`): fetch `GET /api/portfolio/settings` on mount; show `<Skeleton />` while loading; form: (1) risk_profile — three radio buttons "Conservative" / "Moderate" / "Aggressive"; (2) target_return_pct — number input with `%` suffix, min 0.1, step 0.1; (3) run_interval_days — `<select>` with options 7 / 14 / 30 labelled "Weekly / Every 2 weeks / Monthly"; (4) cash_usd — number input with `$` prefix, min 0, step 0.01; submit: client-side validate (return > 0, cash >= 0) then `PUT /api/portfolio/settings`; `useToast()` success "Settings saved"; inline validation errors; loading state on submit button
- [ ] T112 [US7] Create `src/app/portfolio/settings/page.tsx` (server component): `getAuthUser()` → redirect `/login` if null; redirect `/` if not `premium_plus`; render heading "Portfolio Settings" + back link "← Portfolio" + `<PortfolioSettingsForm />`

**Checkpoint**: Settings page loads, saves all four fields, persists on reload. Wrong-role users blocked.

---

## Phase 6: Pure Function + Polish

**Purpose**: Testable value calculation utility; all quality gates green.

- [ ] T113 Create `src/lib/portfolioCalculator.ts` with `computeTotalPortfolioValue(holdings: Pick<PortfolioHolding, 'total_value_usd'>[], cashUsd: number): number` — sum of all `total_value_usd` values plus `cashUsd`; cashUsd is pre-validated by Zod (min 0) so no negative-cash guard needed; create `src/lib/portfolioCalculator.test.ts`: empty holdings + zero cash → 0; empty holdings + cash → cash value; multiple holdings + no cash → sum; multiple holdings + cash → full sum
- [ ] T114 [P] Run `npm run build` — fix TypeScript errors in new files; verify `AuditAction` extension compiles across all files that import it
- [ ] T115 [P] Run `npm run lint` — fix ESLint errors in new/modified files; no `console.log` in production code
- [ ] T116 Run `npm test` — confirm `portfolioCalculator.test.ts` passes and no regressions

**Checkpoint**: `npm run build`, `npm test`, `npm run lint` all pass with zero errors.

---

## Dependencies & Execution Order

```
T101 (types + AuditAction) + T102 (migration) — parallel, MUST complete before everything else
    ↓
T103 [Holdings GET+POST]  T104 [Holdings PUT+DELETE]  T105 [Ticker search]  T106 [Settings API]
    ↓ (all four run in parallel after T101+T102)
T107 [TickerAutocomplete]
    ↓
T108 [HoldingForm]   T109 [PortfolioOverview]   ← parallel (different files)
    ↓
T110 [Upgrade /portfolio page]
    ↓
T111 [PortfolioSettingsForm]
    ↓
T112 [/portfolio/settings page]
    ↓
T113 [portfolioCalculator + test]
T114 [build] + T115 [lint] + T116 [test]  ← parallel
```

### Parallel Opportunities

```
# After T101+T102 — all API routes simultaneously:
T103: Holdings GET+POST
T104: Holdings PUT+DELETE
T105: Ticker search proxy
T106: Settings GET+PUT

# After T107 — simultaneously:
T108: HoldingForm modal
T109: PortfolioOverview list

# Polish — simultaneously:
T114: npm run build
T115: npm run lint
T116: npm test
```

---

## DB Migration Required (Issue #74)

Apply to Supabase after migrations 013 + 014 (from issue #73):

1. `015_portfolio_holdings_settings.sql` — creates `portfolio_holdings` and `portfolio_settings` tables with RLS
