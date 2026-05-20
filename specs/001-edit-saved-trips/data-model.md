# Data Model: Edit Saved Trips

**Branch**: `001-edit-saved-trips` | **Date**: 2026-05-20

## Entities

### Trip (existing — no schema change)

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK |
| owner_id | uuid | FK → user_roles; scoped to activeMainAccountId |
| source | `'search' \| 'manual'` | Set to `'manual'` on every edit |
| trip_type | `'round_trip' \| 'multi_city' \| 'one_way'` | Updated to whatever user selects |
| days_outside_uk | int | Recalculated from new leg dates on every save |
| created_by | uuid | Not changed on edit |
| last_modified_by | uuid | Updated to `user.id` on every edit |
| created_at | timestamptz | Not changed on edit |
| updated_at | timestamptz | Auto-updated by Supabase trigger |

**Edit invariants**:
- `owner_id` never changes — ownership cannot be transferred
- `source` always becomes `'manual'` after an edit (even if originally `'search'`)
- Old legs are deleted and replaced wholesale; no leg IDs survive an edit

### TripLeg (existing — no schema change)

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | PK — new UUIDs generated on every edit |
| trip_id | uuid | FK → trips |
| leg_order | int | 1-indexed; assigned in order of legs array |
| from_airport | char(3) | IATA code |
| to_airport | char(3) | IATA code |
| airline | text \| null | Always null after edit |
| flight_number | text \| null | Always null after edit |
| departure_at | timestamptz | Normalised from YYYY-MM-DD to midnight UTC |
| arrival_at | timestamptz \| null | Always null after edit |

### AuditLogEntry (existing — no schema change)

| Field | Type | Notes |
|-------|------|-------|
| action | `'updated'` | Fixed for edit operations |
| performed_by | uuid | The caller's user_id |
| on_behalf_of | uuid \| null | Populated when caller is assistant |
| trip_id | uuid | The edited trip's id |
| trip_snapshot | jsonb | After-state: `{ ...updatedTrip, legs: newLegs }` |
| changed_fields | jsonb | Diff: `Record<string, { before, after }>` |

**`changed_fields` structure**:
```json
{
  "trip_type":      { "before": "round_trip",   "after": "multi_city" },
  "days_outside_uk":{ "before": 5,              "after": 7 },
  "source":         { "before": "search",        "after": "manual" },
  "legs":           { "before": [...old legs...], "after": [...new legs...] }
}
```
Only fields that actually changed are included. `legs` is always included (leg IDs change
on every edit even if airports/dates are identical).

## State Transitions

```
Trip.source: 'search' → 'manual'   (on any edit — one direction only)
Trip.source: 'manual' → 'manual'   (unchanged)

TripLeg lifecycle on edit:
  old legs (any count) → deleted
  new legs (2–3)       → inserted with new UUIDs
```

## Validation Rules (PATCH body)

Same as POST `ManualTripSchema`:
- `source`: must be `'manual'` (literal)
- `trip_type`: `'round_trip' | 'multi_city'`
- `legs`: array, min 2, max 3
- Each leg: `from_airport` (3 chars), `to_airport` (3 chars), `departure_at` (YYYY-MM-DD)

No additional server-side validation for past vs upcoming trip dates — the server accepts
any valid date (date constraint is a UX-only guard in the modal).
