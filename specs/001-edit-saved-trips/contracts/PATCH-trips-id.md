# API Contract: PATCH /api/trips/:id

**Feature**: Edit Saved Trips | **Date**: 2026-05-20

## Endpoint

```
PATCH /api/trips/:id
```

## Authentication

Required — Supabase session cookie. Returns `401` if no authenticated user.

## Path Parameters

| Name | Type | Description |
|------|------|-------------|
| id | uuid | ID of the trip to update |

## Request Body

```json
{
  "source": "manual",
  "trip_type": "round_trip",
  "legs": [
    { "from_airport": "LHR", "to_airport": "CDG", "departure_at": "2026-03-15" },
    { "from_airport": "CDG", "to_airport": "LHR", "departure_at": "2026-03-22" }
  ]
}
```

| Field | Type | Constraints |
|-------|------|------------|
| source | `"manual"` | Literal — must always be `"manual"` |
| trip_type | `"round_trip" \| "multi_city"` | |
| legs | array | min 2, max 3 items |
| legs[].from_airport | string | exactly 3 chars, IATA code |
| legs[].to_airport | string | exactly 3 chars, IATA code |
| legs[].departure_at | string | `YYYY-MM-DD` format |

## Responses

### 200 OK

Updated trip with legs.

```json
{
  "id": "uuid",
  "owner_id": "uuid",
  "source": "manual",
  "trip_type": "round_trip",
  "days_outside_uk": 7,
  "created_by": "uuid",
  "last_modified_by": "uuid",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-05-20T10:00:00Z",
  "legs": [
    {
      "id": "uuid",
      "trip_id": "uuid",
      "leg_order": 1,
      "from_airport": "LHR",
      "to_airport": "CDG",
      "airline": null,
      "flight_number": null,
      "departure_at": "2026-03-15T00:00:00.000Z",
      "arrival_at": null,
      "created_at": "2026-05-20T10:00:00Z"
    }
  ]
}
```

### 400 Bad Request

```json
{ "error": "Invalid request body" }
```

Returned when body fails Zod validation.

### 401 Unauthorized

```json
{ "error": "Unauthorized" }
```

### 404 Not Found

```json
{ "error": "Trip not found" }
```

Returned when the trip does not exist or does not belong to `activeMainAccountId`.

### 500 Internal Server Error

```json
{ "error": "Internal server error" }
```

## Side Effects

1. All existing `trip_legs` rows for the trip are deleted.
2. New `trip_legs` rows are inserted with new UUIDs.
3. The `trips` row is updated: `source = 'manual'`, `trip_type`, `days_outside_uk`,
   `last_modified_by`, `updated_at`.
4. An `'updated'` audit log entry is written with:
   - `performed_by = user.id`
   - `on_behalf_of = activeMainAccountId` (when caller is assistant)
   - `trip_snapshot` = after-state `{ ...updatedTrip, legs: newLegs }`
   - `changed_fields` = diff of trip fields + legs

## Role Access

| Role | Can call? |
|------|-----------|
| main | Yes |
| premium | Yes |
| assistant | Yes — `on_behalf_of` is set in audit log |

## Notes

- The `source` field is always forced to `'manual'` regardless of the original trip source.
  Any stored flight details (airline, flight_number, arrival_at) are cleared as a result
  of wholesale leg replacement.
- Date normalisation: `departure_at` strings in `YYYY-MM-DD` format are converted to
  `YYYY-MM-DDT00:00:00.000Z` before storage (same as POST).
- `days_outside_uk` is recalculated server-side using `daysOutsideUK(firstLeg, lastLeg)`
  from the new legs. The client preview in the modal is informational only.
