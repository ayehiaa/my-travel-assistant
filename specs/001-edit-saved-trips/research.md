# Research: Edit Saved Trips

**Branch**: `001-edit-saved-trips` | **Date**: 2026-05-20

## Decision 1 — Legs replacement strategy

**Decision**: Delete all `trip_legs` for the trip, then insert the new set.

**Rationale**: Max 3 legs per trip. Diffing (insert/update/delete individual legs) adds
significant complexity with no performance benefit at this scale. Wholesale replacement
is already stated in the spec assumption and matches the existing insert pattern in POST.
If a leg delete succeeds but the insert fails, the trip is left with no legs — mitigated
by inserting legs first and running the trip update last, rolling back if legs insert fails.

**Alternatives considered**:
- Per-leg diff (upsert by leg_order): More complex, harder to audit, unnecessary at ≤3 legs.
- Single DB transaction via Postgres RPC: Would require a new Supabase function. Overkill.

## Decision 2 — Which Supabase client to use in PATCH

**Decision**: `createAdminClient()` for all write operations (delete legs, update trip,
insert legs, audit write).

**Rationale**: Same pattern as the existing `DELETE` route, which also uses admin client.
RLS policies for `trip_legs` require ownership checks that add complexity when using the
user client; admin client bypasses RLS and lets the route enforce ownership in application
code (`.eq('owner_id', activeMainAccountId)`).

**Alternatives considered**:
- Use server client (`createClient()`) for trip + legs, admin for audit only: Would require
  verifying RLS policies support the update/delete operations — unnecessary risk.

## Decision 3 — Change diff format for audit log

**Decision**: Flat `Record<string, { before: unknown; after: unknown }>` object, keyed by
field name. Legs stored under a single `legs` key as `{ before: TripLeg[], after: TripLeg[] }`.

**Rationale**: Matches the existing `changed_fields` column type in `audit_log` and the
`AuditLogEntry.changed_fields` TypeScript type. The `ChangesDetail` component in the audit
UI already renders this shape.

**Alternatives considered**:
- Full before/after trip snapshot in `trip_snapshot`: Already captured; `changedFields` is
  an additive field for the diff view.
- JSON Patch (RFC 6902): Over-engineered; the audit UI does not consume patch operations.

## Decision 4 — Modal reuse vs new component

**Decision**: Extend `AddPastTripModal` with an optional `tripToEdit?: TripWithUsers` prop.

**Rationale**: The spec explicitly states this approach. Avoids duplicating the multi-city
leg management logic. The component is already 436 lines with complex leg state — a new
component would duplicate all of it.

**Alternatives considered**:
- New `EditTripModal` component: Rejected — identical logic, pure duplication.

## Decision 5 — Where to manage tripToEdit state

**Decision**: Lift `tripToEdit` state to `DashboardClient` (already a client component
that manages the existing `showModal` state).

**Rationale**: Both upcoming (TripCard) and past (PastRow) sections need to open the same
edit modal. Centralising in `DashboardClient` means a single modal instance and avoids
converting `UpcomingTrips` to a client component. Props thread down: DashboardClient →
UpcomingTrips/PastTrips → TripCard/PastRow.

**Alternatives considered**:
- Each section manages its own modal: Requires `UpcomingTrips` to become `'use client'`
  and creates two independent modal instances.
- Modal in each individual card: State explosion; modal portals compete.

## Decision 6 — Airport pre-fill in edit mode

**Decision**: Pre-fill airports as minimal `{ iataCode, name }` objects, using the IATA
code as both `iataCode` and `name` (e.g. `{ iataCode: 'LHR', name: 'LHR' }`). The full
airport name is not stored in `trip_legs`; showing the IATA code as the label is
acceptable and consistent with how TripCard displays airports.

**Rationale**: `trip_legs` only stores IATA codes (3-letter strings), not full airport
names. `AirportAutocomplete` accepts `Airport | null` where `Airport = { iataCode, name }`.
The user can re-search if they want the full name; the existing value is pre-populated for
the common case where they want to keep it unchanged.

**Alternatives considered**:
- Lookup full name from `airportCountry.ts` map: Possible but the map stores country/flag,
  not the airport display name. The API autocomplete could be called on load, but that is
  over-engineering for a pre-fill.
