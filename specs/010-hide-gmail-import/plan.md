# Implementation Plan: Hide Gmail Import

**Branch**: `010-hide-gmail-import` | **Date**: 2026-05-22 | **Spec**: (inferred from branch + codebase — no spec.md)

**Input**: Branch context and codebase reading (`src/components/dashboard/DashboardClient.tsx`, `DashboardHero.tsx`)

## Summary

Remove the "Import from Gmail" entry point from the dashboard hero UI. The button is currently rendered for `premium` role users via an optional `onImportFromGmail` prop on `DashboardHero`. The underlying Gmail OAuth backend routes (`/api/gmail/`, `/gmail/callback`) and library files (`src/lib/gmail.ts`, `src/lib/gmailParser.ts`, `src/lib/gmailCrypto.ts`) are retained. Only the UI entry point and its prop wiring are removed.

## Technical Context

**Language/Version**: TypeScript strict, Next.js 16 App Router, React 19

**Primary Dependencies**: None new

**Storage**: N/A — no database changes

**Testing**: Vitest — no pure functions involved; no new tests required

**Target Platform**: Web (Next.js App Router, deployed on Vercel)

**Project Type**: web-application

**Performance Goals**: N/A

**Constraints**: `npm run build` + `npm test` + `npm run lint` must pass; no `console.log` in production code

**Scale/Scope**: 2 component files changed; pure UI wiring removal

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Auth-First API Routes | ✅ N/A | No API routes modified |
| II. Zod Validation | ✅ N/A | No request bodies modified |
| III. Audit Logging | ✅ N/A | No write operations |
| IV. Role-Based Access | ✅ Pass | Premium-gated backend routes remain unchanged |
| V. Pure-Function Tests | ✅ N/A | No pure functions added or changed |

**No gate violations.**

## Project Structure

### Documentation (this feature)

```text
specs/010-hide-gmail-import/
├── plan.md              # This file
├── research.md          # Phase 0 output
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (changes only)

```text
src/components/dashboard/
├── DashboardClient.tsx   # Remove handleImportFromGmail + onImportFromGmail prop
└── DashboardHero.tsx     # Remove onImportFromGmail from Props interface + JSX
```

**Structure Decision**: Single project (Next.js App Router). Two files modified, no new files created.

## Complexity Tracking

No constitution violations — table not applicable.

---

## Phase 0: Research

### Research Findings

**Decision**: UI-only removal. Keep all backend Gmail code intact.

**Rationale**: The Gmail import backend (`/api/gmail/`, `/gmail/callback`, `src/lib/gmail*`) is complete and gated to `premium` role. Removing it would be a larger, riskier change. Hiding the entry point is the minimal, reversible approach — the feature can be re-exposed by simply restoring the prop.

**Alternatives considered**:
1. *Delete all Gmail code* — higher blast radius, harder to reverse, and the backend is already working; no reason to delete.
2. *Feature-flag via env var* — adds complexity for a simple hide that has no timeline for re-exposure.
3. *Keep button but disable it* — confusing UX (why show a disabled button?). Hidden is cleaner.

**No unknowns remain.**

---

## Phase 1: Design

### Data Model

No entities added, modified, or removed. No migration required.

### Interface Contracts

No new API surface. No changes to existing routes.

### Component Design

#### `DashboardHero.tsx`

Remove `onImportFromGmail?: () => void` from the `Props` interface and remove the corresponding JSX block:

```tsx
// BEFORE — lines 14 and 79–86 in DashboardHero.tsx
onImportFromGmail?: () => void
...
{onImportFromGmail && (
  <button onClick={onImportFromGmail} ...>
    Import from Gmail
  </button>
)}

// AFTER — both removed
```

#### `DashboardClient.tsx`

Remove the `handleImportFromGmail` async function (lines 33–41) and the `onImportFromGmail` prop passed to `DashboardHero` (line 54):

```tsx
// BEFORE
async function handleImportFromGmail() {
  const res = await fetch('/api/gmail/auth-url')
  ...
}
...
onImportFromGmail={role === 'premium' ? handleImportFromGmail : undefined}

// AFTER — both removed
```

The `role` prop remains on `DashboardClient` — it is still used for other rendering decisions (e.g. assistant greeting text flows through to `DashboardHero` separately).

### Quality Gate Re-check (post-design)

- No type errors expected: the prop is optional (`?`) so removing it won't break callers; removing it from the interface means TypeScript will flag any accidental remaining usage.
- `npm test` unchanged — no test files affected.
- `npm run lint` unchanged — no new lint surface.
- `npm run build` should pass cleanly.
