# Implementation Plan: Edit Saved Trips

**Branch**: `001-edit-saved-trips` | **Date**: 2026-05-20 | **Spec**: `specs/001-edit-saved-trips/spec.md`

## Summary

Allow all authenticated users (main, premium, and assistant roles) to edit any saved trip
from the dashboard. A pencil icon on every TripCard (upcoming) and PastRow (past) opens
the existing `AddPastTripModal` pre-filled with the trip's current airports, dates, and
trip type. On save, a new `PATCH /api/trips/:id` handler replaces the legs wholesale,
recalculates `days_outside_uk`, and writes an `'updated'` audit log entry with before/after
snapshots.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node.js 24 LTS

**Primary Dependencies**: Next.js 16 App Router, React 19, Zod, Supabase JS client v2

**Storage**: Supabase Postgres — `trips` + `trip_legs` + `audit_log` tables (schema unchanged)

**Testing**: Vitest — pure functions only; no new pure functions are introduced in this
feature (daysCalculator is already tested; the `changes` diff is inlined in the route)

**Target Platform**: Vercel (Fluid Compute)

**Project Type**: Web application (Next.js App Router — server + client components)

**Performance Goals**: Edit saves complete in < 1 s p95 (single DB transaction equivalent:
delete + insert + update + audit write)

**Constraints**: No new DB migrations required — existing `trips`, `trip_legs`, and
`audit_log` tables cover the feature. Admin client required for audit writes.

**Scale/Scope**: Feature touches 1 API route file, 3 existing components, and the modal.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Auth-First API Routes | ✅ PASS | `PATCH` handler calls `getAuthUser()` first; returns `401` before reading body |
| II. Zod Validation at System Boundaries | ✅ PASS | `ManualTripSchema` (reused from POST) validates PATCH body |
| III. Audit Logging on Every Write | ✅ PASS | `logAudit('updated')` with before/after called before returning success |
| IV. Role-Based Access Control | ✅ PASS | Both `main`/`premium` and `assistant` can edit (no restriction); assistant writes `on_behalf_of` |
| V. Pure-Function Tests for Business Logic | ✅ PASS | No new pure functions; `daysCalculator` already tested |

## Project Structure

### Documentation (this feature)

```text
specs/001-edit-saved-trips/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code

```text
src/
├── app/
│   └── api/
│       └── trips/
│           └── [id]/
│               └── route.ts          # ADD: PATCH handler (alongside existing DELETE)
├── components/
│   └── dashboard/
│       ├── AddPastTripModal.tsx      # MODIFY: add tripToEdit prop + edit mode
│       ├── DashboardClient.tsx       # MODIFY: add tripToEdit state, pass onEdit callbacks
│       ├── UpcomingTrips.tsx         # MODIFY: accept + pass onEdit to TripCard
│       ├── TripCard.tsx              # MODIFY: add pencil edit button
│       └── PastTrips.tsx             # MODIFY: pass onEdit to PastRow; PastRow gets pencil button
```

## Phase 0 — Research

See `research.md` for full findings. Key decisions:

- **Legs replacement strategy**: Delete all `trip_legs` for the trip, then insert the new
  legs in a single `supabase.from('trip_legs').insert(...)` call. Simpler than diffing;
  max 3 legs per trip, so no performance concern.
- **Admin client for write operations**: The PATCH route uses `createAdminClient()` for
  the leg delete + trip update + leg insert sequence to avoid RLS complications. Same
  pattern as the existing DELETE route.
- **Change diff format**: Flat `Record<string, { before, after }>` keyed by field name
  (e.g. `{ trip_type: { before: 'round_trip', after: 'multi_city' } }`). Legs diff stored
  under a single `legs` key comparing the before/after arrays. Uses existing `changedFields`
  column in `audit_log`.
- **Modal reuse**: `AddPastTripModal` receives an optional `tripToEdit?: TripWithUsers`
  prop. When set, it initialises state from the trip's legs and shows edit-mode UI. No
  new component is created.
- **Upcoming vs past date constraint**: When `tripToEdit` is defined and its first leg
  departure is today or in the future, the round-trip departure date and first multi-city
  leg date have no `max` constraint (user can keep or change to any valid future date).
  Otherwise, the existing `max={yesterday}` constraint applies.

## Phase 1 — Design & Contracts

See `data-model.md` for entity definitions.
See `contracts/PATCH-trips-id.md` for the API contract.

### Implementation details by file

#### `src/app/api/trips/[id]/route.ts` — add PATCH handler

```ts
export async function PATCH(request, { params }) {
  // 1. Auth (principle I)
  const user = await getAuthUser()
  if (!user) return 401

  // 2. Resolve active main account
  const activeMainAccountId = await getActiveMainAccountId(user)
  const admin = createAdminClient()
  const { id } = await params

  // 3. Fetch existing trip (ownership check + before-snapshot)
  const { data: before } = await admin
    .from('trips')
    .select('*, legs:trip_legs(*)')
    .eq('id', id)
    .eq('owner_id', activeMainAccountId)
    .order('leg_order', { referencedTable: 'trip_legs', ascending: true })
    .single()
  if (!before) return 404

  // 4. Parse + validate body (principle II) — reuse ManualTripSchema
  const parsed = ManualTripSchema.safeParse(await request.json())
  if (!parsed.success) return 400

  // 5. Normalise legs (same as POST)
  const normalisedLegs = ...

  // 6. Delete old legs
  await admin.from('trip_legs').delete().eq('trip_id', id)

  // 7. Update trip row
  const { data: updatedTrip } = await admin
    .from('trips')
    .update({
      trip_type:        body.trip_type,
      source:           'manual',
      days_outside_uk:  daysOutsideUK(firstDep, lastDep),
      last_modified_by: user.id,
    })
    .eq('id', id)
    .select()
    .single()

  // 8. Insert new legs
  const { data: newLegs } = await admin
    .from('trip_legs')
    .insert(normalisedLegs.map((leg, i) => ({ ...leg, trip_id: id, leg_order: i + 1 })))
    .select()

  // 9. Build changedFields diff
  const changedFields = buildChanges(before, updatedTrip, before.legs, newLegs)

  // 10. Audit (principle III)
  await logAudit({
    performedBy:   user.id,
    action:        'updated',
    tripId:        id,
    tripSnapshot:  { ...updatedTrip, legs: newLegs },
    changedFields,
    onBehalfOf:    user.role === 'assistant' ? activeMainAccountId : undefined,
  })

  // 11. Return updated trip
  return NextResponse.json({ ...updatedTrip, legs: newLegs })
}
```

`buildChanges` is a small inline helper (not exported, not tested — it's glue code, not
business logic) that compares trip fields and before/after legs arrays.

#### `src/components/dashboard/AddPastTripModal.tsx` — edit mode

New prop signature:
```ts
type Props = {
  onClose: () => void
  tripToEdit?: TripWithUsers
}
```

Changes:
- Initialise `tripType` from `tripToEdit?.trip_type ?? 'round_trip'` (one_way → round_trip)
- Initialise round-trip fields from leg 0 (from/date) and leg 1 (from→to/date) when
  `tripToEdit?.trip_type === 'round_trip'` or `'one_way'`
- Initialise `mcLegs` from all legs when `tripToEdit?.trip_type === 'multi_city'`
- Pre-fill airports by matching IATA code to `Airport` shape `{ iataCode, name }` (a
  minimal object satisfying `AirportAutocomplete`'s value type)
- Add `isUpcoming` flag: `tripToEdit && new Date(tripToEdit.legs[0].departure_at) >= new Date(today)`
- Adjust date `max` constraints based on `isUpcoming`
- Show warning banner (amber strip) when `tripToEdit?.source === 'search'`
- Title: "Edit trip" vs "Add a past trip"
- Subtitle: "Update airports or dates." vs current subtitle
- `handleSave` calls `PATCH /api/trips/${tripToEdit.id}` when editing
- Success toast: "Trip updated" vs "Past trip added"

#### `src/components/dashboard/DashboardClient.tsx` — lift edit state

Add:
```ts
const [tripToEdit, setTripToEdit] = useState<TripWithUsers | null>(null)
```

Pass `onEditTrip={setTripToEdit}` to `<UpcomingTrips>` and `<PastTrips>`.

Render at bottom:
```tsx
{tripToEdit && (
  <AddPastTripModal
    tripToEdit={tripToEdit}
    onClose={() => setTripToEdit(null)}
  />
)}
```

The existing `showModal` (for "Add past trip") remains unchanged in `PastTrips`.

#### `src/components/dashboard/UpcomingTrips.tsx` — thread onEdit

Not a client component — just add `onEditTrip` prop and thread it to `<TripCard>`.

#### `src/components/dashboard/TripCard.tsx` — pencil button

Add `onEdit?: () => void` prop. Add a pencil button in the footer (next to existing
delete button), visible to all authenticated users (not gated on `canDelete`).

Pencil SVG icon (14×14, same weight as TrashIcon in PastTrips):
```tsx
function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9.5 2.5l2 2M2 10l.5-2.5 6-6 2 2-6 6L2 10z"
            stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
```

Style: same ghost-button pattern as the delete button but uses `var(--blue-700)` colour.

#### `src/components/dashboard/PastTrips.tsx` — pencil button on PastRow

Add `onEdit: (trip: TripWithUsers) => void` to `PastRow` and `PastTrips` props.
Add pencil button in `sj-pr-action` column (before or after the delete button).

## Complexity Tracking

No Constitution violations. No complexity justification required.
