# Implementation Plan: Export Trips CSV

**Branch**: `012-export-trips-csv` | **Date**: 2026-05-22 | **Spec**: [specs/012-export-trips-csv/spec.md](spec.md)

**Input**: Feature specification from `/specs/012-export-trips-csv/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Enable authenticated users (both Owner and Assistant roles) to export all accessible past trips to a CSV file. The feature adds an "Export to CSV" button to the Past Trips section, which generates and downloads a file named `trips_export_YYYY-MM-DD.csv` containing all trip data with proper RFC 4180 formatting. The button is disabled when no trips are available, with explanatory text for users. Both search-sourced and manually-entered trips are included in the export.

## Technical Context

**Language/Version**: TypeScript 5 (Next.js 16, React 19)

**Primary Dependencies**: Next.js 16 App Router, React 19, Supabase Auth/Postgres, Zod, csvFormatter utility

**Storage**: Supabase PostgreSQL (trips table with 12+ fields including airport codes, airlines, flight numbers, dates, days_outside_uk, created_at)

**Testing**: Vitest (npm test runs all tests)

**Target Platform**: Web browser (Next.js App Router, all modern browsers)

**Project Type**: Full-stack web application (Next.js)

**Performance Goals**: CSV generation and download within 2 seconds for users with up to 100 trips

**Constraints**: Must respect authentication, role-based access, and data scoping to activeMainAccountId; RFC 4180 CSV formatting with special character handling (accents, apostrophes, commas)

**Scale/Scope**: Single feature within existing travel app; reuses existing trip query/auth infrastructure; no new database schema changes required

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Principles Verified:**

1. **✅ Auth-First API Routes (NON-NEGOTIABLE)**: Export endpoint will verify authenticated user as first operation
2. **✅ Zod Validation at System Boundaries**: Request body (if any) will be validated; query parameters validated
3. **✅ Audit Logging on Every Write**: Export is a READ operation, not a write. No audit logging required for data retrieval
4. **✅ Role-Based Access Control**: Both Owner and Assistant roles have read access to trips and can trigger export
5. **✅ Pure-Function Tests**: CSV formatting logic and data transformation can be unit tested without mocking infrastructure

**No violations identified.** Feature aligns with all five constitutional principles.

## Project Structure

### Documentation (this feature)

```text
specs/012-export-trips-csv/
├── plan.md              # This file (/speckit-plan command output)
├── spec.md              # Feature specification (user stories, requirements, acceptance criteria)
├── research.md          # Phase 0 output (/speckit-plan command) - research tasks resolved
├── data-model.md        # Phase 1 output (/speckit-plan command) - entities and data contracts
├── quickstart.md        # Phase 1 output (/speckit-plan command) - implementation overview
├── contracts/           # Phase 1 output (/speckit-plan command) - API contract definitions
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── page.tsx                    # Dashboard (displays PastTrips component)
│   ├── api/
│   │   └── trips/
│   │       ├── export/route.ts     # [NEW] POST /api/trips/export — CSV generation endpoint
│   │       ├── route.ts            # [MODIFIED] Existing GET /api/trips (fetch for export)
│   │       └── [id]/route.ts       # [UNCHANGED] DELETE trip
│   └── ...
├── components/
│   └── dashboard/
│       ├── PastTrips.tsx           # [MODIFIED] Add export button UI
│       ├── TripCard.tsx            # [UNCHANGED]
│       └── EmptyState.tsx          # [UNCHANGED]
├── lib/
│   ├── csvFormatter.ts             # [EXISTING] Utility for CSV formatting — can be extended if needed
│   ├── exportTripsCSV.ts           # [NEW] Business logic: format trips array to RFC 4180 CSV string
│   ├── exportTripsCSV.test.ts      # [NEW] Pure function tests for CSV export formatting
│   └── auth.ts, supabase/*.ts      # [UNCHANGED] Existing auth and DB utilities
└── ...
```

**Structure Decision**: Single Next.js project with minimal additions. The feature extends the existing API and component layer without introducing new dependencies or breaking existing structure. The `exportTripsCSV.ts` module encapsulates CSV formatting logic as a pure function for testability. The `/api/trips/export` endpoint handles auth, data retrieval, and response streaming.

## Phase 0: Research & Clarification

**Status**: Ready to start

**Research Tasks** (none required — technical stack is well-known and feature scope is clear)

- ✅ CSV formatting library strategy: Existing `csvFormatter.ts` is sufficient; no new dependencies needed
- ✅ Browser download API: Standard `Blob` + `URL.createObjectURL()` + `<a>` click pattern
- ✅ RFC 4180 compliance: Standard library patterns or custom formatter in existing `csvFormatter.ts`
- ✅ Special character handling: UTF-8 encoding with proper CSV escaping (quotes, commas, newlines)
- ✅ Role-based data scoping: Already implemented in existing `/api/trips` endpoint

**Output**: None required — proceed directly to Phase 1 design

## Phase 1: Design & Implementation

**Prerequisites**: Phase 0 complete (research tasks)

### Data Model

**Trip export record** (read-only view of trips table):

| Field | Type | Source | Required |
|-------|------|--------|----------|
| Departure Airport | string | `departure_airport` | Yes |
| Destination Airport | string | `destination_airport` | Yes |
| Outbound Airline | string | `outbound_airline` | Yes |
| Outbound Flight Number | string | `outbound_flight_number` | Yes |
| Outbound Departure | ISO 8601 datetime | `outbound_departure_at` | Yes |
| Outbound Arrival | ISO 8601 datetime | `outbound_arrival_at` | Yes |
| Return Airline | string | `return_airline` | Yes |
| Return Flight Number | string | `return_flight_number` | Yes |
| Return Departure | ISO 8601 datetime | `return_departure_at` | Yes |
| Return Arrival | ISO 8601 datetime | `return_arrival_at` | Yes |
| Days Outside UK | integer | `days_outside_uk` | Yes |
| Created Date | ISO 8601 date | `created_at` | Yes |

**Transformations**:
- Dates formatted as `YYYY-MM-DD HH:MM:SS` in CSV (user-friendly timezone-aware display)
- Empty fields represented as empty cells (no "null" strings)
- Special characters in airline names escaped per RFC 4180 (quotes doubled, fields with quotes/commas wrapped in quotes)

### API Contract

**POST /api/trips/export**

```ts
Request: 
  Content-Type: application/json
  Body: { } (empty, no parameters required)
  
Response (200 OK):
  Content-Type: text/csv; charset=utf-8
  Content-Disposition: attachment; filename="trips_export_YYYY-MM-DD.csv"
  Body: RFC 4180 CSV text

Error responses:
  401 Unauthorized (unauthenticated)
  400 Bad Request (validation fails)
  500 Internal Server Error (DB error)
```

**CSV Format**:
- First row: Headers (comma-separated)
- Subsequent rows: Trip data (one trip per row, all fields present)
- Line terminator: `\r\n` (Windows style, RFC 4180 compliant)

### Component Contract (PastTrips)

**New UI addition**:
- Button: "Export to CSV"
- State: disabled when `trips.length === 0`
- Message when disabled: "No trips to export"
- On click: POST to `/api/trips/export`, trigger download via blob URL

### Implementation Notes

1. **CSV Generation**:
   - Pure function `exportTripsCSV(trips: Trip[]): string` in `lib/exportTripsCSV.ts`
   - Handles RFC 4180 escaping, date formatting, special characters
   - Fully testable without mocking
   - Tests in `lib/exportTripsCSV.test.ts`

2. **API Route** (`/api/trips/export`):
   - Verify auth first (return 401 if unauthenticated)
   - Fetch trips using existing server client (respects activeMainAccountId)
   - Validate response with Zod
   - Call `exportTripsCSV()` to format data
   - Return CSV with correct headers and attachment disposition
   - No audit logging (read-only operation)

3. **UI Component** (PastTrips.tsx):
   - Add "Export to CSV" button below or inside trip list
   - Disable button when `trips.length === 0`
   - Show loading state while POST is in flight
   - Handle errors via toast notification
   - Trigger download via standard blob pattern

4. **Testing Strategy**:
   - Unit: `lib/exportTripsCSV.test.ts` — test CSV formatting with various inputs (special chars, empty fields, dates)
   - Integration: API route returns correct headers and CSV content
   - E2E (manual): Click button, verify download, open in Excel/Google Sheets

## Next Steps

1. Run `/speckit-tasks` to generate actionable task list
2. Execute implementation tasks with `/speckit-implement`
3. Verify all gates pass before merge (build, lint, test, no console.log)
