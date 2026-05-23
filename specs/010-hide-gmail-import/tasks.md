# Tasks: Hide Gmail Import

**Input**: `specs/010-hide-gmail-import/plan.md`, `specs/010-hide-gmail-import/research.md`

**Prerequisites**: plan.md ✅ | spec.md ✗ (not required — scope derived from plan.md) | research.md ✅

**Tests**: No test tasks — no pure functions added or changed (per plan.md Constitution Check).

**Organization**: Single user story (UI-only removal). No backend, no DB, no new files.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- Include exact file paths in descriptions

---

## Phase 1: Setup

*No setup required — no new dependencies, no new files, no schema changes.*

---

## Phase 2: Foundational

*No foundational prerequisites — both file changes are independent of each other.*

---

## Phase 3: User Story 1 — Hide Gmail Import Button (Priority: P1) 🎯 MVP

**Goal**: Remove the "Import from Gmail" entry point from the dashboard hero. Backend Gmail code is untouched.

**Independent test criteria**: `npm run build` passes with no type errors; `npm run lint` passes; no "Import from Gmail" button visible in the dashboard for any role.

- [ ] T001 [P] [US1] Remove `onImportFromGmail?: () => void` from Props interface and destructuring in `src/components/dashboard/DashboardHero.tsx`
- [ ] T002 [P] [US1] Remove the `{onImportFromGmail && (<button>…</button>)}` JSX block (lines 79–86) from `src/components/dashboard/DashboardHero.tsx`
- [ ] T003 [P] [US1] Remove the `handleImportFromGmail` async function (lines 33–41) from `src/components/dashboard/DashboardClient.tsx`
- [ ] T004 [P] [US1] Remove the `onImportFromGmail={role === 'premium' ? handleImportFromGmail : undefined}` prop (line 54) from the `<DashboardHero>` call in `src/components/dashboard/DashboardClient.tsx`

---

## Phase 4: Polish & Quality Gate

- [ ] T005 Run `npm run build` and confirm zero type errors
- [ ] T006 Run `npm run lint` and confirm zero lint errors
- [ ] T007 Run `npm test` and confirm all tests pass

---

## Dependencies

```
T001 ──┐
T002 ──┤── (DashboardHero.tsx changes, independent of DashboardClient.tsx)
T003 ──┤
T004 ──┘
       └── T005 → T006 → T007
```

T001 and T002 must both be applied to `DashboardHero.tsx` before it compiles cleanly (removing the prop without removing the JSX, or vice versa, would leave a reference to an undefined identifier). T003 and T004 are similarly paired for `DashboardClient.tsx`. All four can be executed together in a single editing pass.

## Parallel Execution

All four implementation tasks (T001–T004) are marked `[P]` because they touch two separate files. Within each file, T001+T002 and T003+T004 must be applied together.

## Implementation Strategy

MVP = Phase 3 (all four tasks). This is the entire feature. No incremental delivery needed — changes are two small edits with a quality gate.

## Summary

| Phase | Tasks | Parallel? |
|-------|-------|-----------|
| Phase 3: US1 | 4 | Yes (across files) |
| Phase 4: Polish | 3 | No (sequential gate) |
| **Total** | **7** | — |
