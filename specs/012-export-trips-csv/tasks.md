# Tasks: Export Trips CSV

**Feature Branch**: `012-export-trips-csv` | **Feature Dir**: `specs/012-export-trips-csv/` | **Spec**: [spec.md](spec.md)

**Definition of Done**: All tasks complete AND (`npm run build` passes) AND (`npm test` passes) AND (`npm run lint` passes) AND no `console.log` in production code.

---

## Phase 1: Setup & Infrastructure

### Prerequisites
None — feature has no blocking dependencies. Existing auth, DB queries, and CSV utilities are ready.

### Tests (Optional)
If you want to run tests as you implement, setup is complete after T001.

---

- [ ] T001 Verify project dependencies and existing utilities (`csvFormatter.ts`, auth, Supabase client)

---

## Phase 2: Implementation — User Story 1 (Export Trips History) [P1]

**Goal**: Enable authenticated users to export all accessible past trips to a CSV file named `trips_export_YYYY-MM-DD.csv`

**Independent Test**: Navigate to Past Trips section with trips available, click "Export to CSV" button, verify CSV downloads with all trips and correct data.

**Acceptance Criteria** (from spec.md):
1. POST `/api/trips/export` generates valid RFC 4180 CSV file with all past trips
2. CSV filename: `trips_export_YYYY-MM-DD.csv` (current date)
3. CSV includes 12 columns: Departure Airport, Destination Airport, Outbound Airline, Outbound Flight Number, Outbound Departure, Outbound Arrival, Return Airline, Return Flight Number, Return Departure, Return Arrival, Days Outside UK, Created Date
4. Both search-sourced and manually-entered trips included in export
5. Special characters in airline names (accents, apostrophes, commas) handled correctly
6. CSV download completes within 2 seconds for up to 100 trips

### Implementation Tasks

#### Backend: API Endpoint

- [ ] T002 [P] [US1] Create `/api/trips/export` route in `src/app/api/trips/export/route.ts`
  - Verify auth first (return 401 if unauthenticated)
  - Fetch trips using existing server client (respects activeMainAccountId, filters created_by)
  - Validate response shape with Zod
  - Call `exportTripsCSV()` to format
  - Return CSV with Content-Type: text/csv and Content-Disposition: attachment; filename="trips_export_YYYY-MM-DD.csv"
  - Handle errors (400 for validation, 500 for DB)
  - NO audit logging (read-only operation)

#### Backend: CSV Formatter

- [ ] T003 [P] [US1] Create pure function `exportTripsCSV(trips: Trip[]): string` in `src/lib/exportTripsCSV.ts`
  - Import Trip type from `@/types/database`
  - Import CSV utilities from `@/lib/csvFormatter`
  - Format headers: "Departure Airport,Destination Airport,Outbound Airline,Outbound Flight Number,Outbound Departure,Outbound Arrival,Return Airline,Return Flight Number,Return Departure,Return Arrival,Days Outside UK,Created Date"
  - For each trip, format fields:
    - Airports: `trip.departure_airport`, `trip.destination_airport` (strings)
    - Airlines/flights: `trip.outbound_airline`, `trip.outbound_flight_number`, `trip.return_airline`, `trip.return_flight_number` (strings, empty string if null)
    - Dates: format `trip.outbound_departure_at`, `trip.outbound_arrival_at`, `trip.return_departure_at`, `trip.return_arrival_at` as `YYYY-MM-DD HH:MM:SS` (use ISO format from DB, parse with Date, format with toLocaleString or manual)
    - `trip.days_outside_uk` as number string
    - `trip.created_at` as `YYYY-MM-DD`
  - Use `buildCsvContent()` from csvFormatter
  - Return single RFC 4180-compliant string with `\r\n` line terminators
  - Handle null/undefined fields as empty strings
  - Handle special characters (accents, apostrophes, commas) via existing `escapeCsvValue()`

#### Backend: Unit Tests

- [ ] T004 [P] [US1] Create `src/lib/exportTripsCSV.test.ts` with pure function tests
  - Test: Basic trip export with full fields → CSV includes all columns and one row
  - Test: Multiple trips → CSV has header + N rows
  - Test: Trip with special characters (commas, quotes, accents) in airline name → CSV escapes correctly per RFC 4180
  - Test: Trip with null fields (e.g., `return_airline = null`) → CSV cell is empty (not "null" string)
  - Test: Dates are formatted as `YYYY-MM-DD HH:MM:SS`
  - Test: Empty trips array → CSV includes header only, no rows
  - Use `npm test` to verify all pass

#### Frontend: UI Component

- [ ] T005 [P] [US1] Modify `src/components/dashboard/PastTrips.tsx` to add export button
  - Add button in the flex container next to "+ Add past trip" button (line ~273)
  - Button text: "Export to CSV"
  - Button visible only when `trips.length > 0`
  - Button disabled state: only when actively exporting (POST in flight)
  - On click: POST to `/api/trips/export`, handle response as Blob, trigger download with `URL.createObjectURL()` and `<a>` click pattern
  - Show loading state: button text → "…" or similar while in flight
  - Handle errors: show toast via `useToast()` with error message
  - **After download**: reset loading state immediately
  - Style to match existing button styling (color: var(--blue-500), fontWeight: 600, fontSize: 13)

#### Frontend: Integration Test (Manual)

- [ ] T006 [US1] Test export feature end-to-end
  - Start `npm run dev`, navigate to dashboard with past trips visible
  - Click "Export to CSV" button
  - Verify: Download completes with filename `trips_export_YYYY-MM-DD.csv`
  - Verify: Open CSV in Excel or Google Sheets, all columns present, all rows populated
  - Verify: Special characters (e.g., "United Airlines" with apostrophe) display correctly
  - Verify: Dates formatted as `YYYY-MM-DD HH:MM:SS`
  - Test with 1 trip, 5 trips, 20+ trips
  - Record: Download time, file size, CSV parsing without errors

---

## Phase 3: Implementation — User Story 2 (Handle Empty Trips) [P2]

**Goal**: Provide clear user feedback when no trips are available for export

**Independent Test**: View Past Trips with zero trips, observe export button disabled or hidden with helper text "No trips to export".

**Acceptance Criteria** (from spec.md):
1. Export button disabled or hidden when `trips.length === 0`
2. Clear message "No trips to export" visible near button

### Implementation Tasks

- [ ] T007 [US2] Modify `src/components/dashboard/PastTrips.tsx` to disable/hide export button when empty
  - Update export button to set `disabled={trips.length === 0}` or conditionally render
  - Add title attribute or inline text: "No trips to export"
  - Match styling of existing disabled buttons (opacity: 0.4, cursor: not-allowed)
  - When disabled, prevent click handler from firing

- [ ] T008 [US2] Test empty state behavior
  - Start `npm run dev`, view Past Trips with no trips
  - Verify: Export button disabled or hidden
  - Verify: Tooltip/text "No trips to export" visible
  - Verify: Button does not respond to clicks
  - Add trip, verify button becomes enabled
  - Delete all trips again, verify button disabled

---

## Phase 4: Polish & Quality Gates

### Build & Lint

- [ ] T009 Run `npm run build` and verify no TypeScript errors
  - Check all new imports resolve correctly
  - Verify types for Trip, TripWithUsers, and CSV formatting functions
  - No type-casting workarounds or `any` types

- [ ] T010 Run `npm run lint` and verify no ESLint errors
  - Check for unused imports in `/api/trips/export/route.ts` and `exportTripsCSV.ts`
  - Check for `console.log`, `debugger`, or other debug statements in production code
  - Fix any formatting or unused variable warnings

### Final Tests

- [ ] T011 Run `npm test` and verify all tests pass
  - Confirms `exportTripsCSV.test.ts` suite passes
  - Existing tests remain passing (no regression)

- [ ] T012 Final manual smoke test
  - Start `npm run dev`
  - Quick flows:
    1. As authenticated user with trips: Click export → download CSV → open in spreadsheet ✓
    2. As authenticated user with no trips: View Past Trips → export button disabled ✓
    3. Special characters test: Verify CSV with "BA&Co" or similar parses correctly ✓
  - No console errors in DevTools

---

## Dependencies & Execution Order

**Execution Model**: Tasks T002–T005 can run **in parallel** (different files, no inter-dependencies). T006 is blocked on T002–T005 completion. Tasks T007–T008 depend on feature-complete, so run after T006. T009–T012 are final gates, run sequentially at the end.

**Recommended Execution**:
1. T001 (verify setup)
2. **Parallel**: T002, T003, T004, T005 (backend endpoint, CSV formatter, tests, UI)
3. T006 (manual integration test)
4. **Parallel**: T007, T008 (empty state feature + test)
5. **Sequential**: T009, T010, T011, T012 (quality gates)

**Estimated Time**: 
- Parallel phase (T002–T005): ~45 min
- Integration test (T006): ~15 min
- Empty state (T007–T008): ~20 min
- Quality gates (T009–T012): ~15 min
- **Total: ~95 min** (parallelism reduces wall-clock time)

---

## Testing Strategy

**Unit Tests** (T004): Pure function `exportTripsCSV()` tested independently — no mocking of Supabase or Next.js required. All test cases in `src/lib/exportTripsCSV.test.ts`.

**Integration Test** (T006): Manual E2E in browser — verifies API endpoint, database query, CSV download, and file content.

**Manual Smoke Tests** (T012): Quick validation of happy path + edge cases before final commit.

**Definition of Done**: 
- `npm test` passes (all unit tests green)
- `npm run build` passes (no type errors)
- `npm run lint` passes (no linting errors)
- Manual smoke tests pass (download works, special chars preserved, empty state behaves)
- No `console.log` in production code
