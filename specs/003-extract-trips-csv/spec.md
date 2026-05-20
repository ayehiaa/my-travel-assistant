# Feature Specification: Extract Past Trips to CSV

**Feature Branch**: `003-extract-trips-csv`

**Created**: 2026-05-20

**Status**: Draft

**Input**: User description: "Add a feature for users to extract all their past trips to a CSV file. Past trips are trips where the return arrival date is in the past. The CSV should contain the key trip details: departure airport, destination airport, outbound airline, outbound flight number, outbound departure date/time, outbound arrival date/time, return airline, return flight number, return departure date/time, return arrival date/time, days outside UK, and trip source (search or manual). The user should be able to click a button on the dashboard to download the CSV file. Both owner and assistant roles can use this feature. The CSV download action should be logged to the audit log."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Download past trips as CSV (Priority: P1)

A signed-in user (Owner or Assistant) opens the dashboard, sees their list of past
trips, and clicks an "Export to CSV" button near the past-trips section. The browser
immediately downloads a single CSV file containing one row per past trip with all the
recorded flight, date, and source details. The user then opens the file in a
spreadsheet to review their travel history offline.

**Why this priority**: This is the entire feature. Without the download path the
feature delivers no value, so it is the only required user story for v1.

**Independent Test**: Sign in, navigate to the dashboard with at least one past
trip on record, click "Export to CSV", confirm a file downloads, open it, and
verify every past trip is present with the expected columns. Delivers value on its
own: portable, offline-readable history.

**Acceptance Scenarios**:

1. **Given** the signed-in user has past trips on record, **When** they click the
   "Export to CSV" button on the dashboard, **Then** a CSV file is downloaded
   named `past-trips-YYYY-MM-DD.csv` containing one header row and one row per
   past trip.
2. **Given** the signed-in user has no past trips on record, **When** they click
   the "Export to CSV" button, **Then** the user is shown a clear message that
   there are no past trips to export and no file is downloaded.
3. **Given** the signed-in user has both search-sourced and manually entered past
   trips, **When** they export to CSV, **Then** every past trip is present and the
   `Source` column distinguishes `search` from `manual`.
4. **Given** the signed-in user has manually entered trips with no flight details,
   **When** they export to CSV, **Then** the flight columns for those rows are
   empty strings rather than the literal text "null" or "undefined".
5. **Given** any user (Owner or Assistant) downloads a CSV, **When** an Owner
   later opens the audit log, **Then** the export action is visible with the
   timestamp and the user who performed it.

---

### Edge Cases

- The user has zero past trips: show a friendly empty-state message and do not
  produce an empty file.
- The user has upcoming-only trips (no return arrival in the past): treated the
  same as zero past trips.
- A trip's airport, airline, or flight-number field contains a comma, quote, or
  newline: CSV cell values are escaped so the file opens correctly in Excel,
  Numbers, and Google Sheets.
- Date/time values must be rendered in a consistent, locale-independent format
  (ISO 8601) so they sort correctly in spreadsheets.
- The user is unauthenticated: the export endpoint returns 401 and no file is
  produced.
- The download is triggered repeatedly within seconds: each download produces
  one audit entry; no client-side throttling required for v1.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST display an "Export to CSV" button visible to
  both Owner and Assistant roles, positioned alongside the past-trips list.
- **FR-002**: The system MUST treat a trip as a "past trip" when the trip's
  return arrival date/time is strictly before the current time, using the same
  classification rule already used by the dashboard's past-trips view.
- **FR-003**: When the user triggers the export, the system MUST produce a CSV
  file containing exactly the following columns, in this order:
  `Departure Airport`, `Destination Airport`, `Outbound Airline`,
  `Outbound Flight Number`, `Outbound Departure`, `Outbound Arrival`,
  `Return Airline`, `Return Flight Number`, `Return Departure`,
  `Return Arrival`, `Days Outside UK`, `Source`.
- **FR-004**: The CSV MUST contain one header row followed by one row per past
  trip, sorted by return arrival date descending (most recent first), matching
  the dashboard ordering.
- **FR-005**: Date/time columns MUST be formatted as ISO 8601 strings (e.g.
  `2025-08-12T14:30:00Z`). Missing dates MUST render as empty strings.
- **FR-006**: Flight-detail columns (airline, flight number, departure, arrival)
  for `manual`-sourced trips MUST render as empty strings when the underlying
  data is null, never as `null` or `undefined`.
- **FR-007**: All cell values MUST be CSV-escaped: values containing commas,
  double quotes, or line breaks MUST be wrapped in double quotes with embedded
  double quotes doubled.
- **FR-008**: The downloaded file MUST be named
  `past-trips-YYYY-MM-DD.csv` where the date is the date of download (UTC).
- **FR-009**: The export endpoint MUST require an authenticated session and
  MUST return 401 for unauthenticated callers.
- **FR-010**: Both `owner` and `assistant` roles MUST be able to use the
  feature; no role gate beyond authentication is required.
- **FR-011**: Every successful CSV export MUST be recorded in the audit log
  with the action `export_trips_csv`, the performing user's id, the timestamp,
  and the number of trips included in the export.
- **FR-012**: When the user has zero past trips, the system MUST show a
  user-facing message and MUST NOT generate or download an empty file. The
  audit log MUST NOT record an export in this case.

### Key Entities *(include if feature involves data)*

- **Past Trip Row**: A flat, read-only projection of a single past trip prepared
  for CSV output. Contains the 12 columns listed in FR-003, derived from the
  existing `trips` record.
- **CSV Export Audit Entry**: A row in the existing audit log capturing who
  triggered the export, when, and how many rows it included. No trip snapshot
  is stored (the action does not mutate data).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from viewing the dashboard to having the CSV open
  in their spreadsheet of choice in under 10 seconds for a history of up to
  500 past trips.
- **SC-002**: 100% of past trips visible in the dashboard's past-trips list
  also appear in the downloaded CSV (no missing rows, no extra rows).
- **SC-003**: The downloaded file opens correctly in Microsoft Excel, Apple
  Numbers, and Google Sheets without manual repair or import wizard
  adjustments, including when values contain commas or quotes.
- **SC-004**: 100% of completed exports produce exactly one matching entry in
  the audit log, attributed to the correct user, with the correct row count.

## Assumptions

- The existing dashboard already separates past from upcoming trips using a
  return-arrival-in-the-past rule; this feature reuses that same rule.
- Users are happy with a simple, immediate, full-history export — no filters,
  date-range pickers, or column selection in v1.
- The downloaded file uses UTF-8 encoding without a BOM. Spreadsheet apps in
  the user's environment open UTF-8 CSVs correctly.
- Audit logging for read-style actions (no data mutation) is acceptable and
  matches the project's existing logging patterns.
- Dataset size for any single user remains well under 10,000 rows, so a
  single-request synchronous export is sufficient; no pagination or background
  job is needed.
- "Days outside UK" is already computed and stored on the trip record; the
  export reuses that stored value without recomputation.
