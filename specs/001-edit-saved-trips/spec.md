# Feature Specification: Edit Saved Trips

**Feature Branch**: `001-edit-saved-trips`

**Created**: 2026-05-20

**Status**: Draft

**Input**: User description: "I want to be able to edit flights I've already saved — currently only delete is available."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Edit a manually-added trip (Priority: P1)

A main account user opens the dashboard, finds a manually-entered trip (upcoming or
past), clicks the edit icon, adjusts the airports and/or dates in a pre-filled modal,
and saves. The trip on the dashboard reflects the updated details immediately.

**Why this priority**: Manual trips are the most common targets for edits — they are
entered by hand and most likely to contain errors or need updating.

**Independent Test**: Navigate to a manual trip on the dashboard, click the edit button,
change one field, save, and confirm the dashboard card reflects the change.

**Acceptance Scenarios**:

1. **Given** a main account with a saved manual round-trip, **When** the user clicks the
   edit icon and changes the destination airport and return date, **Then** the trip card
   updates and a success toast is shown.
2. **Given** a main account with a saved multi-city manual trip, **When** the user edits
   leg 2's origin and date, **Then** all legs save correctly and days-outside-UK
   recalculates.
3. **Given** a valid edit form, **When** the user clicks Save, **Then** the Save button
   shows "Saving…" while the request is in flight and returns to normal on completion.
4. **Given** an API failure on save, **When** the save request fails, **Then** a toast
   error is shown and the modal stays open with the edited values intact.

---

### User Story 2 — Edit a search-sourced trip (Priority: P2)

A main account user finds a trip that was originally saved from the flight search flow
and wants to correct the airports or dates (e.g. the route was logged with the wrong
departure airport).

**Why this priority**: Search trips can also contain errors, but editing them replaces
the stored flight-detail fields (airline, flight number, times) with null since the
user is no longer working from live search results.

**Independent Test**: Open a search-sourced trip, edit the departure airport, save, and
confirm the trip now shows "Manually added" in place of airline/flight-number details.

**Acceptance Scenarios**:

1. **Given** a search-sourced trip, **When** the user opens edit, **Then** only airports
   and dates are pre-filled; airline/flight-number fields are not shown (the edit modal
   is the same manual-entry modal regardless of source). A one-line inline warning
   ("Saving will remove stored flight details") is shown at the top of the modal.
2. **Given** a search-sourced trip being edited, **When** saved successfully, **Then** the
   trip's `source` is updated to `'manual'` and flight-detail columns are nulled out.
3. **Given** a search-sourced trip being edited, **When** the audit log entry is written,
   **Then** the before-snapshot preserves the original flight details and the
   after-snapshot reflects the new manual values.

---

### User Story 3 — Assistants can edit and delete trips with full audit attribution (Priority: P1)

An assistant user sees the same edit icon (and existing delete icon) on every trip card
as a main account user. When they edit or delete, the audit log records the action with
the assistant as `performed_by` and the active main account as `on_behalf_of`.

**Why this priority**: Both main accounts and assistants need full write access to trips.
Audit attribution (on_behalf_of) is the accountability mechanism, not access restriction.
Must be implemented alongside P1.

**Independent Test**: Log in as an assistant, edit a trip, confirm the trip updates
correctly, then check the audit log shows "by [assistant] on behalf of [main account]".

**Acceptance Scenarios**:

1. **Given** an assistant viewing the dashboard, **When** the page renders, **Then** the
   edit icon is visible on every upcoming and past trip row (same as for main accounts).
2. **Given** an assistant who edits a trip, **When** the save succeeds, **Then** the
   audit log entry has `performed_by = assistant_user_id` and
   `on_behalf_of = active_main_account_id`.
3. **Given** an assistant who deletes a trip, **When** the delete succeeds, **Then** the
   audit log entry has `performed_by = assistant_user_id` and
   `on_behalf_of = active_main_account_id` (this is already the case in the existing
   delete route — confirmed, no change needed there).
4. **Given** an authenticated user with no session, **When** they send
   `PATCH /api/trips/:id`, **Then** the API returns `401 Unauthorized`.

---

### Edge Cases

- What happens when a multi-city trip is edited to have a first-leg date that is today
  or in the future (making it an "upcoming" trip)? The trip moves from Past to Upcoming
  on the next dashboard load — this is correct behaviour, no special handling needed.
- What happens if all legs of a multi-city trip are removed down to one? The minimum is
  two legs — the "Remove" button on leg 2 is hidden when only two legs remain.
- What happens if the trip no longer exists when the save fires (deleted by another
  session)? The API returns 404 and the modal shows an inline error.
- What happens when editing a `one_way` trip? The modal opens in round-trip mode with
  origin and first-leg date pre-filled; destination is left blank for the user to
  complete. On save the `trip_type` updates to whatever the user selects.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose a `PATCH /api/trips/:id` endpoint that accepts the same
  payload shape as `POST /api/trips` (airports + dates + legs array, `source: 'manual'`).
- **FR-002**: The endpoint MUST verify the caller is authenticated; return `401` if not.
  Both `'main'` and `'assistant'` roles may edit trips.
- **FR-003**: The endpoint MUST verify the trip belongs to `activeMainAccountId`; return
  `404` if not found or not owned.
- **FR-004**: The endpoint MUST update `last_modified_by` to the caller's `user_id`.
- **FR-005**: The endpoint MUST write an `'updated'` audit log entry with the full
  before-snapshot and a `changes` diff before returning success. When the caller is an
  assistant, `on_behalf_of` MUST be set to `activeMainAccountId` in the audit entry.
- **FR-006**: An edit icon (pencil) MUST appear on each upcoming `TripCard` and each past
  `PastRow` for all authenticated users (both main and assistant).
- **FR-007**: Clicking the edit icon MUST open the existing `AddPastTripModal` pre-filled
  with the trip's current airports, dates, and trip type. The trip-type tab MUST be
  pre-selected to the current type but the user MUST be able to switch it (round_trip ↔
  multi_city).
- **FR-008**: On successful save the modal MUST close, the dashboard MUST refresh, and a
  success toast MUST be shown.
- **FR-009**: If a search-sourced trip is edited, the trip's `source` MUST be set to
  `'manual'` and all flight-detail columns (airline, flight number, times) MUST be
  nulled out.
- **FR-010**: Days-outside-UK MUST be recalculated from the new dates on every save.

### Key Entities

- **Trip**: The record being edited. Has `source`, `trip_type`, `owner_id`,
  `last_modified_by`, `days_outside_uk`.
- **TripLeg**: Child rows linked to the trip. Replaced entirely on each edit (delete old
  legs, insert new legs) to keep the logic simple.
- **AuditLog entry**: Written before the response is returned; captures `before` and
  `after` snapshots as a `changes` object.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A main account user can edit any saved trip in under 60 seconds from
  clicking the edit icon to seeing the updated card on the dashboard.
- **SC-002**: Every successful edit produces exactly one `'updated'` audit log entry
  containing both the before and after state.
- **SC-003**: Every edit or delete by an assistant produces an audit log entry with
  correct `on_behalf_of` attribution in 100% of cases.
- **SC-004**: No edit operation leaves orphaned `trip_legs` rows (old legs are fully
  replaced on each save).

## Clarifications

### Session 2026-05-20

- Q: Can users change the trip type (round_trip ↔ multi_city) when editing? → A: Yes — the tab is pre-selected to the current trip_type but the user can switch it.
- Q: How should one_way trips be handled in edit? → A: Open as round-trip — pre-fill origin/date from leg 1, destination left blank.
- Q: For search-sourced trips, show original flight details as a read-only reference? → A: No — open the manual modal pre-filled with airports/dates only; show a one-line inline warning that flight details will be cleared.

## Assumptions

- Both `'main'` and `'assistant'` roles can edit and delete trips. Audit attribution
  (`on_behalf_of`) is the accountability mechanism — access is not restricted by role.
- The edit modal reuses `AddPastTripModal` with an optional `tripToEdit` prop rather than
  creating a new component — avoids duplicating the multi-city leg logic. When editing a
  search-sourced trip, a one-line warning is shown; no read-only reference panel is
  displayed.
- Trip type is pre-selected but switchable — users can change round_trip ↔ multi_city
  freely. One-way trips open in round-trip mode with only origin/date pre-filled.
- Trip legs are replaced wholesale on edit (delete all old legs, insert new ones) rather
  than diffed. This is simpler and safe given the small number of legs per trip (max 3).
- Date constraints in edit mode differ from add mode: for upcoming trips, the first leg
  date may be today or future; for past trips, the first leg date must remain in the
  past. The modal applies the same constraint as it does today (first leg date ≤
  yesterday) unless the trip being edited is already upcoming.
