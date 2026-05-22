# Feature Specification: Export Trips CSV

**Feature Branch**: `012-export-trips-csv`

**Created**: 2026-05-22

**Status**: Draft

**Input**: User description: "add an export csv feature for past trips"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export Trips History (Priority: P1)

As an Owner or Assistant, I want to export all my past trips to a CSV file so I can analyze my travel history in a spreadsheet application or archive my data.

**Why this priority**: Core feature that directly addresses the user request and delivers immediate business value—enables data export and offline analysis.

**Independent Test**: Can be fully tested by navigating to Past Trips section, clicking an export button, and verifying a CSV file downloads with all trips and correct data.

**Acceptance Scenarios**:

1. **Given** I am an authenticated user viewing the Past Trips section with completed trips, **When** I click the "Export to CSV" button, **Then** a file named `trips_export_YYYY-MM-DD.csv` downloads to my device
2. **Given** the CSV file has been generated, **When** I open it in a spreadsheet application, **Then** all trip columns are present and all rows contain my saved trips with accurate data
3. **Given** I have past trips with special characters in airline names, **When** I export to CSV, **Then** the file parses correctly without corruption or encoding issues

---

### User Story 2 - Handle Empty Trips (Priority: P2)

As a user with no past trips, I want to see a message explaining why I cannot export so I understand the feature's availability.

**Why this priority**: Important for user experience—prevents confusion when the export action is unavailable or disabled.

**Independent Test**: Can be tested by viewing Past Trips with zero completed trips and observing the disabled/unavailable state of the export button with helper text.

**Acceptance Scenarios**:

1. **Given** I have no past trips saved, **When** I view the Past Trips section, **Then** the export button is disabled or hidden with a message "No trips to export"
2. **Given** I attempt to export when trips list becomes empty, **When** I try to export, **Then** I see a clear message explaining no trips are available

---

### Edge Cases

- What happens when user has manually added trips (source: 'manual') vs. search trips (source: 'search')? → Both should be included in export
- How does the system handle a very large number of trips (e.g., 1000+ rows)? → CSV should still generate and download within reasonable time
- What if a trip has missing or null fields? → Fields should be included in CSV with empty values; data integrity maintained
- Can multiple users with different roles (Owner vs Assistant) both export? → Yes, both roles have read access to trips so both can export

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate a valid CSV file containing all past trips accessible to the authenticated user
- **FR-002**: CSV MUST include the following columns: Departure Airport, Destination Airport, Outbound Airline, Outbound Flight Number, Outbound Departure, Outbound Arrival, Return Airline, Return Flight Number, Return Departure, Return Arrival, Days Outside UK, Created Date
- **FR-003**: System MUST trigger a browser download with filename format `trips_export_YYYY-MM-DD.csv` where YYYY-MM-DD is the current date
- **FR-004**: System MUST respect user authentication—only authenticated users can trigger export
- **FR-005**: System MUST respect role-based access—Assistant and Owner roles both have permission to export their visible trips
- **FR-006**: System MUST handle trips from both sources ('search' and 'manual') in the same export
- **FR-007**: System MUST present an export button or action in the Past Trips section that is enabled only when trips are available
- **FR-008**: System MUST disable or hide the export button with explanatory text when no trips are present

### Key Entities

- **Trip**: Represents a completed or past trip with all flight details (departure/destination airports, airline info, dates)
- **CSV File**: Generated export artifact containing formatted trip data with headers and rows

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: CSV file downloads successfully in under 2 seconds for users with up to 100 trips
- **SC-002**: 100% of accessible trips are included in the exported CSV with all data fields accurately represented
- **SC-003**: CSV file is properly formatted and imports without errors in Excel, Google Sheets, and standard CSV readers
- **SC-004**: Users can successfully trigger export and receive file on first attempt without errors
- **SC-005**: All special characters (accented characters, apostrophes, commas) in airline names are preserved correctly in CSV

## Assumptions

- Export feature is available to both Owner and Assistant roles (no role-based restriction)
- Trips from both search and manual sources should be exported together
- Users have standard modern browsers with download capability
- Current timestamp (YYYY-MM-DD) is sufficient for filename; no need for timestamp in filename
- The existing trip data model and database queries can be extended without significant refactoring
- CSV format is preferred over other formats (JSON, XML) for this feature
- Users expect standard RFC 4180 CSV format
