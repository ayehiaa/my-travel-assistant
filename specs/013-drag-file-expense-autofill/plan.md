# Implementation Plan: Receipt Drag-and-Drop with AI Auto-fill

**Branch**: `013-drag-file-expense-autofill` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-drag-file-expense-autofill/spec.md`

## Summary

Adds drag-and-drop (and click-to-upload parity) to the Add Expense modal so that dropping a receipt file automatically attaches it and calls a new authenticated server-side API route (`POST /api/expenses/parse-receipt`) that uses Claude's vision/document API to extract title, amount, currency, and date. Non-null extracted fields pre-fill the form; null fields remain blank. Parsing failures show a non-blocking inline notice while keeping the file attached.

## Technical Context

**Language/Version**: TypeScript 5 / Next.js 16 (App Router), React 19

**Primary Dependencies**: `@anthropic-ai/sdk ^0.92.0` (already installed), Zod, Supabase

**Storage**: No new storage — parse endpoint discards file bytes after extraction; Supabase Storage used only on final expense save (existing flow unchanged)

**Testing**: Vitest — pure extraction/parsing logic only

**Target Platform**: Web (Next.js, server components + client components)

**Project Type**: Web application (Next.js App Router)

**Performance Goals**: Parse endpoint p95 ≤ 8 s (from SC-003)

**Constraints**: Parse endpoint must not persist file bytes; authenticated only; 10 MB / JPG-PNG-PDF limit matches existing upload restrictions

**Scale/Scope**: Existing small-scale travel app; no new infrastructure

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I — Auth-First | ✅ PASS | `POST /api/expenses/parse-receipt` will check `getAuthUser()` as first operation |
| II — Zod Validation | ✅ PASS | Incoming `FormData` validated (file presence, MIME type, size) with Zod-compatible guards before touching the AI SDK |
| III — Audit Logging | ✅ PASS | Parse endpoint is read-only (no DB writes); no audit entry required |
| IV — RBAC | ✅ PASS | Both `main` and `assistant` roles can access Add Expense modal; no role restriction on parse endpoint |
| V — Pure-Function Tests | ✅ PASS | `receiptParser.ts` pure extraction logic will have co-located Vitest tests |

**Constitution Check result: PASS — proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/013-drag-file-expense-autofill/
├── plan.md              ← this file
├── research.md          ← Phase 0
├── data-model.md        ← Phase 1
├── quickstart.md        ← Phase 1
└── tasks.md             ← Phase 2 (/speckit-tasks)
```

### Source Code Changes

```text
src/
├── app/
│   └── api/
│       └── expenses/
│           └── parse-receipt/
│               └── route.ts         ← NEW — POST endpoint
├── lib/
│   ├── receiptParser.ts             ← NEW — pure extraction logic
│   └── receiptParser.test.ts        ← NEW — Vitest unit tests
└── components/
    └── expenses/
        └── AddExpenseModal.tsx      ← MODIFIED — drag-and-drop + auto-fill
```

## Complexity Tracking

No constitution violations. No unusual complexity introduced.
