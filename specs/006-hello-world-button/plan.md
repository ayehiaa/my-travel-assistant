# Implementation Plan: Hello World Button

**Branch**: `006-hello-world-button` | **Date**: 2026-05-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-hello-world-button/spec.md`

## Summary

Add a "Hello World" button to the navigation bar (`src/components/Nav.tsx`) that calls `useToast()` with "Hello, World!" when clicked. The button appears for all authenticated users regardless of role. No backend changes, no database migration, no audit logging.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode)

**Primary Dependencies**: React 19, Next.js 16 App Router, Tailwind CSS v4, `useToast()` from `src/context/ToastContext.tsx`

**Storage**: N/A

**Testing**: Vitest (no new pure functions introduced — no tests required)

**Target Platform**: Web (desktop + mobile responsive)

**Project Type**: Web application (Next.js App Router)

**Performance Goals**: Button click response < 100ms (instant UI feedback, no network call)

**Constraints**: Must use existing `useToast()` system; Tailwind only; no CSS modules

**Scale/Scope**: Single component change — `src/components/Nav.tsx`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | Justification |
|-----------|---------|---------------|
| I. Auth-First API Routes | ✅ N/A | No API routes added or modified |
| II. Zod Validation at System Boundaries | ✅ N/A | No external input; button click has no payload |
| III. Audit Logging on Every Write | ✅ N/A | No trip create/update/delete operations |
| IV. Role-Based Access Control | ✅ PASS | Button visible to all authenticated users (both roles); unauthenticated users never reach Nav |
| V. Pure-Function Tests | ✅ N/A | No new pure functions with business logic |

**Post-design re-check**: All principles still N/A or passing. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/006-hello-world-button/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit-tasks)
```

### Source Code Changes

```text
src/components/
└── Nav.tsx              ← Add Hello World button + useToast import
```

No contracts directory needed (no API surface changes).

## Phase 0: Research

See [research.md](./research.md).

## Phase 1: Design

### Component Change — `src/components/Nav.tsx`

`Nav.tsx` is already `'use client'`. The `useToast` hook is available from `@/context/ToastContext`.

**Desktop placement**: Add the button to the right-side controls section (between the account info and the avatar/sign-out cluster), following the existing inline flex row. Styled to match the "Sign out" button aesthetic — small, low-contrast ghost style.

**Mobile placement**: Add the button inside the mobile menu dropdown, in its own section styled consistently with existing mobile menu items.

**Implementation**:

```tsx
// Import addition
import { useToast } from '@/context/ToastContext'

// Inside Nav():
const toast = useToast()

// Button JSX (desktop right side, before avatar):
<button
  onClick={() => toast('Hello, World!', 'info')}
  style={{ fontSize: 13, color: 'rgba(255,255,255,.70)' }}
  className="hover:text-white transition-colors"
>
  Hello World
</button>

// Button JSX (mobile menu, in right section):
<button
  onClick={() => { toast('Hello, World!', 'info'); setMenuOpen(false) }}
  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
  style={{ color: 'rgba(255,255,255,.65)' }}
>
  Hello World
</button>
```

No new files. No DB migration. No API changes.
