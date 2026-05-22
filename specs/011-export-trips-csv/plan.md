# Implementation Plan: CSV Export for Past Trips

**Branch**: `011-export-trips-csv` | **Date**: 2026-05-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-export-trips-csv/spec.md`

**Note**: This plan is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add CSV export functionality to the Past Trips dashboard allowing authenticated users to download their saved travel records. The feature will generate a valid CSV file with trip details (airports, dates, airlines, flight numbers, days outside UK) in under 5 seconds and respect existing role-based access control. Implementation uses a new API route that queries the database and streams the CSV response, with client-side button UI in the Past Trips component.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 (App Router), React 19

**Primary Dependencies**: React 19, Supabase (Postgres + Supabase Auth), Zod validation, Tailwind CSS v4

**Storage**: Supabase Postgres (existing `trips` table)

**Testing**: Vitest (pure functions only; no infrastructure mocks)

**Target Platform**: Browser (web application)

**Project Type**: Next.js web application

**Performance Goals**: CSV export completes within 5 seconds regardless of trip volume (target: sub-second for <100 trips, linear scaling for larger datasets)

**Constraints**: 
- Browser-compatible CSV download (no custom dialogs, standard browser download)
- Must respect existing authentication and authorization model
- File size expected <1MB for typical user datasets

**Scale/Scope**: Feature scope limited to read-only export of user's own trips; no sharing, no batch operations; 1-2 files per user per session typical

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Principles to Verify**:

✅ **I. Auth-First API Routes**: Export endpoint MUST verify authentication before any query execution. Pattern confirmed in design.

✅ **II. Zod Validation**: No request body validation needed (GET request, user ID from session). No external input to validate.

✅ **III. Audit Logging**: CSV export is a READ operation, not a write. Audit logging not required per constitution (audit applies to create/update/delete only).

✅ **IV. Role-Based Access Control**: Users export only their own trips. Existing auth context (`getUser()`) provides user ID for query scoping.

✅ **V. Pure-Function Tests**: CSV formatting logic (escaping, header generation) must be pure and testable. Infrastructure (Supabase query) excluded from test boundary.

**Gate Status**: ✅ PASS — No constitution violations detected. Design aligns with all five principles.

## Project Structure

### Documentation (this feature)

```text
specs/011-export-trips-csv/
├── spec.md              # Feature specification (completed)
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── api-export.md    # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md  # Quality checklist (completed)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── api/
│   │   ├── trips/route.ts       # Updated: GET endpoint query only
│   │   └── trips/export/route.ts # NEW: CSV export endpoint
│   └── dashboard/
│       └── past-trips/page.tsx   # Updated: Add export button + trigger
├── components/
│   └── dashboard/
│       └── PastTrips.tsx         # Updated: Add export button + loading state
├── lib/
│   └── csvExport.ts             # NEW: Pure CSV formatting logic
└── ...existing structure
```

**Structure Decision**: Single Next.js web application. CSV export implemented as a new API route (`src/app/api/trips/export/route.ts`) that queries existing Supabase tables and returns streamed CSV. UI button added to existing PastTrips component with client-side fetch. Pure formatting logic in `src/lib/csvExport.ts` testable without mocks.
