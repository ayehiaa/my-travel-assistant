# Tasks: Edit Saved Trips

**Input**: Design documents from `specs/001-edit-saved-trips/`

**Prerequisites**: plan.md ✅, spec.md ✅, data-model.md ✅, contracts/PATCH-trips-id.md ✅

**Tests**: No new test tasks — no new pure functions introduced. Quality gate (`npm test`, `npm run build`, `npm run lint`) runs in the Tester step.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to
- Exact file paths in every description

---

## Phase 1: Setup

**Purpose**: No project initialization required — existing Next.js app. This phase confirms existing patterns before modifying them.

- [ ] T001 Read src/app/api/trips/[id]/route.ts to understand existing DELETE handler pattern before adding PATCH

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: PATCH API route — required by all three user stories. Must be complete before any frontend work.

**⚠️ CRITICAL**: No user story frontend work can begin until this phase is complete.

- [ ] T002 Add `PATCH` handler to `src/app/api/trips/[id]/route.ts`: (1) auth via `getUser()` → 401 if missing; (2) resolve `activeMainAccountId`; (3) fetch existing trip + legs from admin client with ownership check (`eq('owner_id', activeMainAccountId)`) → 404 if missing; (4) validate body with reused `ManualTripSchema` → 400 if invalid; (5) normalise legs (same date normalisation as POST: `YYYY-MM-DD` → `YYYY-MM-DDT00:00:00.000Z`); (6) delete all old `trip_legs` rows for `trip_id`; (7) update `trips` row (`source: 'manual'`, `trip_type`, `days_outside_uk`, `last_modified_by: user.id`); (8) insert new `trip_legs` rows with `leg_order` 1-indexed; (9) build `changedFields` diff (`Record<string, { before, after }>` — include `legs` key always, other fields only if changed); (10) call `logAudit({ performedBy: user.id, action: 'updated', tripId: id, tripSnapshot: { ...updatedTrip, legs: newLegs }, changedFields, onBehalfOf: user.role === 'assistant' ? activeMainAccountId : undefined })`; (11) return `NextResponse.json({ ...updatedTrip, legs: newLegs })` with status 200. Use `createAdminClient()` for all DB writes (same as DELETE).

**Checkpoint**: PATCH /api/trips/:id is functional — all user stories can now proceed.

---

## Phase 3: User Story 1 + User Story 3 — Edit a manually-added trip / Assistant access (Priority: P1) 🎯 MVP

**Goal**: All authenticated users (main and assistant) can open a pre-filled edit modal from any trip card, edit airports and dates, and save. Audit attribution is correct for assistants.

**Independent Test**: Navigate to a manual trip on the dashboard, click the pencil icon, change one field, save, confirm the dashboard card reflects the change and a success toast appears.

### Implementation for User Story 1 + US3

- [ ] T003 [P] [US1] Modify `src/components/dashboard/AddPastTripModal.tsx`: add `tripToEdit?: TripWithUsers` to props. Initialise `tripType` from `tripToEdit?.trip_type ?? 'round_trip'` (coerce `'one_way'` to `'round_trip'`). For round-trip/one-way: pre-fill departure airport from `legs[0].from_airport`, destination from `legs[1]?.to_airport`, departure date from `legs[0].departure_at`, return date from `legs[1]?.departure_at`. For multi-city: initialise `mcLegs` array from all legs. Use minimal `{ iataCode, name: iataCode }` airport objects to satisfy `AirportAutocomplete`'s value type. Add `isUpcoming` flag: `tripToEdit && new Date(tripToEdit.legs[0].departure_at) >= startOfToday()`. When `isUpcoming` is true, remove the `max={yesterday}` constraint from the departure date input(s).
- [ ] T004 [US1] Modify `src/components/dashboard/AddPastTripModal.tsx`: update edit-mode UI — title: `"Edit trip"`, subtitle: `"Update airports or dates."`. Update `handleSave`: when `tripToEdit` is defined, call `PATCH /api/trips/${tripToEdit.id}` instead of `POST /api/trips`. Show `"Saving…"` on the Save button while in-flight. On success: show `"Trip updated"` toast and close modal. On API failure: show error toast and keep modal open with edited values intact. On 404 response: show `"Trip no longer exists"` error inline.
- [ ] T005 [P] [US1] Modify `src/components/dashboard/TripCard.tsx`: add `onEdit?: () => void` prop. Add `PencilIcon` SVG (14×14, path: `"M9.5 2.5l2 2M2 10l.5-2.5 6-6 2 2-6 6L2 10z"`, stroke `currentColor`, strokeWidth 1.5, round caps/joins). Add pencil button in the card footer next to the existing delete button, using the same ghost-button style but with `text-blue-700` colour. Button is visible to all authenticated users (not gated on `canDelete`). onClick calls `onEdit?.()`.
- [ ] T006 [P] [US1] Modify `src/components/dashboard/PastTrips.tsx`: add `onEdit: (trip: TripWithUsers) => void` prop to both `PastRow` and `PastTrips`. In `PastRow`, add a pencil button in the `sj-pr-action` column (before the delete button) using the same `PencilIcon` SVG and ghost-button style. Visible to all authenticated users.
- [ ] T007 [US1] Modify `src/components/dashboard/UpcomingTrips.tsx`: add `onEditTrip?: (trip: TripWithUsers) => void` prop and thread it through to `<TripCard onEdit={() => onEditTrip?.(trip)} />`.
- [ ] T008 [US1] Modify `src/components/dashboard/DashboardClient.tsx`: add `const [tripToEdit, setTripToEdit] = useState<TripWithUsers | null>(null)`. Pass `onEditTrip={setTripToEdit}` to `<UpcomingTrips>` and `<PastTrips>`. Render `{tripToEdit && <AddPastTripModal tripToEdit={tripToEdit} onClose={() => setTripToEdit(null)} />}` at the bottom of the return (existing `showModal` / "Add past trip" modal for `PastTrips` remains unchanged — keep both).

**Checkpoint**: All authenticated users (main + assistant) can edit any manual trip. Audit log records `performed_by` and `on_behalf_of` correctly.

---

## Phase 4: User Story 2 — Edit a search-sourced trip (Priority: P2)

**Goal**: When a user opens the edit modal for a search-sourced trip, they see a one-line inline warning that flight details will be cleared on save.

**Independent Test**: Open a search-sourced trip in edit mode, confirm the amber warning banner is visible, save, and confirm the trip now shows `source: 'manual'` (airline/flight-number fields absent).

### Implementation for User Story 2

- [ ] T009 [US2] Modify `src/components/dashboard/AddPastTripModal.tsx`: add an amber inline warning strip immediately below the modal title when `tripToEdit?.source === 'search'`. Text: `"Saving will remove stored flight details."` Style: amber background strip (`bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-2 rounded`). No additional fields or read-only panel — just the warning.

**Checkpoint**: Search-sourced trips show the warning; save clears flight details server-side (handled by Phase 2 PATCH route).

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final review across all modified files.

- [ ] T010 [P] Verify no `console.log` statements remain in any modified production file
- [ ] T011 [P] Confirm `TripWithUsers` type in `src/types/database.ts` includes a `legs: TripLeg[]` array field — if not, add it so `AddPastTripModal` can read leg data for pre-filling
- [ ] T012 Run quickstart.md end-to-end validation scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **US1 + US3 (Phase 3)**: Depends on Phase 2 completion
- **US2 (Phase 4)**: Depends on Phase 3 completion (same file as modal changes)
- **Polish (Phase 5)**: Depends on all story phases completing

### Within Phase 3

- **T003 and T004 and T005 and T006 are all parallel** — different files, no shared state
- **T007** depends on T005 (TripCard must have `onEdit` prop before UpcomingTrips threads it)
- **T008** depends on T003, T004, T005, T006, T007 (DashboardClient wires everything together)

### Execution Order within Phase 3

```
T003 [P] ─┐
T005 [P] ──┼──► T007 ──► T008
T006 [P] ─┘
T004 [P] ──────────────► T008
```

T004 (TripCard pencil button) and T008 are independent — T004 can land any time before T008.

---

## Parallel Execution Example: Phase 3

```
# These four tasks can all start simultaneously (different files):
Task T003: Modify AddPastTripModal.tsx (tripToEdit prop + state init)
Task T004: Modify AddPastTripModal.tsx (edit-mode UI + handleSave)
Task T005: Modify TripCard.tsx (pencil button)
Task T006: Modify PastTrips.tsx (PastRow pencil button)

# Then, once T005 is done:
Task T007: Modify UpcomingTrips.tsx (thread onEditTrip)

# Finally, once T003+T004+T005+T006+T007 are all done:
Task T008: Modify DashboardClient.tsx (lift state, wire everything)
```

---

## Implementation Strategy

### MVP (User Stories 1 + 3 — both P1)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002) — PATCH route with full assistant audit attribution
3. Complete Phase 3: US1 + US3 (T003–T008) — frontend edit flow, pencil buttons, DashboardClient wiring
4. **STOP and VALIDATE**: Test main account edit + assistant edit + audit log
5. Deploy MVP if ready

### Incremental Delivery

1. Phase 2 → Phase 3 → validate MVP (US1 + US3 fully functional)
2. Phase 4 → US2 search-sourced warning (additive change to existing modal)
3. Phase 5 → polish + quality gate

---

## Notes

- No DB migrations required — `trips`, `trip_legs`, `audit_log` tables are unchanged
- `AddPastTripModal` receives most changes — T003 and T004 both modify the same file, so they are listed as sequential within Phase 3 despite the [P] marker on T003
- The `buildChanges` diff helper is an inline function in the PATCH route (not exported, not tested — it's glue code)
- `TripWithUsers` must carry a `legs` array so `AddPastTripModal` can initialise from it — verify in T011
- The existing "Add past trip" modal render path in `DashboardClient` and `PastTrips` is untouched
