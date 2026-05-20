<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.0.1
Modified principles:
  - IV. Role-Based Access Control: corrected assistant role from "read + create only"
    to "full write access; on_behalf_of is the accountability mechanism."
    Also clarified that routes using createAdminClient() rely solely on API-layer
    enforcement (admin client bypasses RLS by design — intentional pattern).
Added sections: None
Removed sections: None

Templates reviewed:
  ✅ .specify/templates/plan-template.md — Constitution Check gate adapts to
     updated principles automatically; no literal role text referenced
  ✅ .specify/templates/spec-template.md — No role definitions embedded; no change
  ✅ .specify/templates/tasks-template.md — No role definitions embedded; no change

Follow-up TODOs: None
-->

# Sojourn Constitution

## Core Principles

### I. Auth-First API Routes (NON-NEGOTIABLE)

Every API route handler MUST verify the caller is authenticated as the very first
operation — before reading request bodies, querying the database, or executing any
business logic. Unauthenticated requests MUST return `401` immediately.

Pattern:
```ts
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

No exceptions. Server components that fetch data MUST use `getUser()` from
`src/lib/auth.ts` and redirect to `/login` if null.

### II. Zod Validation at System Boundaries

All external input — request bodies, query parameters, form data — MUST be validated
with a Zod schema before it touches the database or business logic. Validation
failures MUST return `400` with a structured error. Trust internal code and framework
guarantees; only validate at boundaries.

### III. Audit Logging on Every Write (NON-NEGOTIABLE)

Every API route that creates, updates, or deletes a trip MUST call `logAudit()` (via
the admin Supabase client) before returning a success response. The audit entry MUST
include: `performed_by`, `action`, `trip_id`, `trip_snapshot`, and `on_behalf_of`
when an assistant acts for a main account. No write operation is complete without its
audit record.

### IV. Role-Based Access Control

Two roles exist: `'main'` (full access) and `'assistant'` (full write access —
read, create, edit, and delete). Both roles may perform all trip write operations.
The accountability mechanism for assistants is audit attribution via `on_behalf_of`,
not access restriction.

Role checks MUST be enforced at the API layer for every route. For routes that use
`createAdminClient()` (which bypasses Supabase RLS by design), the API layer is the
sole enforcement layer — this is the intentional pattern for write routes. Routes
that use the standard server client rely on both the API layer and RLS independently.

Neither enforcement path may be skipped; the chosen client determines which layers
apply and both MUST be present where applicable.

### V. Pure-Function Tests for Business Logic

Every pure function that encodes business logic (days calculations, ranking, filtering)
MUST have co-located unit tests (`src/lib/foo.test.ts`). Infrastructure MUST NOT be
mocked — Supabase, Next.js, and external APIs are excluded from the test boundary.
Tests MUST pass (`npm test`) before any feature is considered done.

## Tech Stack & Quality Gates

**Framework**: Next.js 16 App Router, React 19, TypeScript strict mode
**Database + Auth**: Supabase (Postgres + Supabase Auth)
**Styling**: Tailwind CSS v4 — tokens in `globals.css :root`, no `tailwind.config.ts`
**Validation**: Zod — all schemas co-located with their route or component
**Testing**: Vitest — pure functions only, no infrastructure mocks
**Flight data**: SerpAPI (Google Flights)

**Definition of Done — every feature MUST satisfy all five gates:**

1. All story acceptance criteria are met
2. `npm run build` passes with zero type errors
3. `npm test` passes (all tests green)
4. `npm run lint` passes (zero ESLint warnings)
5. No `console.log` left in production code

No feature may be merged unless all five gates pass.

## Development Workflow

**Supabase clients** — use the right client for the context:

- Browser components: `import { createClient } from '@/lib/supabase/client'`
- Server components / API routes: `import { createClient } from '@/lib/supabase/server'`
- Admin (audit writes, service role, write routes): `import { createAdminClient } from '@/lib/supabase/admin'`

**Component patterns:**

- Server components by default; add `'use client'` only when event handlers or hooks
  are required
- Skeleton loading states (not spinners) for all async data
- Toast notifications via `useToast()` for all user-facing errors
- Tailwind only — no CSS modules, no inline styles

**Data scoping:**

- All data queries MUST be scoped to `activeMainAccountId` (from `src/lib/activeAccount.ts`)
- Main accounts: `activeMainAccountId === user.id` always
- Assistants: `activeMainAccountId` is the selected main account from the cookie,
  validated against active `account_links` rows only

**Comments** — write no comments by default. Add a comment only when the WHY is
non-obvious: a hidden constraint, a subtle invariant, or a workaround for a known bug.

## Governance

This constitution supersedes all other practices documented elsewhere. When a conflict
arises between this document and a README, ADR, or inline comment, this document wins.

**Amendment procedure:**

1. Propose the change and rationale in a PR description
2. Bump version per semantic versioning (MAJOR: principle removed/redefined;
   MINOR: principle added; PATCH: wording/clarification)
3. Update `LAST_AMENDED_DATE`
4. Propagate any impacted templates (plan-template, spec-template, tasks-template)

**Compliance review:** Every PR that touches API routes, database queries, or
auth logic MUST be checked against Principles I, II, III, and IV before merge.

**Version**: 1.0.1 | **Ratified**: 2026-05-20 | **Last Amended**: 2026-05-20
