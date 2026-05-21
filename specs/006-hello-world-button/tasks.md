# Tasks: Hello World Button

**Input**: Design documents from `specs/006-hello-world-button/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅

**Tests**: Not requested — no pure business logic introduced (per Constitution Principle V and research.md decision).

**Organization**: Single user story. No setup or foundational phases required — the project infrastructure is fully established and this feature adds one button to one existing component.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: User Story 1 — Click Hello World Button (Priority: P1) 🎯 MVP

**Goal**: Add a "Hello World" button to the navigation bar. When clicked, display a "Hello, World!" toast notification. Visible to all authenticated users regardless of role.

**Independent Test**: Log in as Owner or Assistant, see the "Hello World" button in the nav bar on every page, click it, and observe the "Hello, World!" toast notification. Confirm unauthenticated visitors see no button.

### Implementation

- [ ] T001 [US1] Add `useToast` import and `Hello World` button to desktop nav in `src/components/Nav.tsx`
- [ ] T002 [US1] Add `Hello World` button to mobile menu in `src/components/Nav.tsx`

**Checkpoint**: Both desktop and mobile users see the Hello World button and can trigger the toast. Unauthenticated visitors do not see the button (Nav is not rendered on `/login` or `/auth/callback`).

---

## Phase 2: Polish & Cross-Cutting Concerns

**Purpose**: Quality gate verification

- [ ] T003 Run `npm run build` and confirm zero TypeScript errors
- [ ] T004 Run `npm test` and confirm all tests pass
- [ ] T005 Run `npm run lint` and confirm zero ESLint warnings
- [ ] T006 Confirm no `console.log` statements introduced

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies — `src/components/Nav.tsx` is self-contained; T001 and T002 both modify the same file so they must be sequential.
- **Phase 2**: Depends on Phase 1 completion.

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies on other stories or infrastructure. The `useToast` hook and `Nav.tsx` component already exist.

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. Complete Phase 1: T001 → T002 (same file, sequential)
2. Complete Phase 2: Quality gates T003–T006
3. **VALIDATE**: Visual check — button appears in nav, toast fires on click

---

## Notes

- T001 and T002 modify the same file (`Nav.tsx`) — do NOT run in parallel
- No new files, no DB migration, no API changes
- `useToast` is imported from `@/context/ToastContext`; Nav is already `'use client'`
- Toast type: `'info'` (neutral dark, per research.md decision)
- Desktop button: placed in right-side controls before the avatar, styled as ghost text (matching Sign out button)
- Mobile button: placed inside mobile menu, styled as full-width left-aligned item (matching Sign out button)
