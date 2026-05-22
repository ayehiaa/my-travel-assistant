# Architect Notes: Export Trips CSV

**Date**: 2026-05-22 | **Feature**: `012-export-trips-csv` | **Branch**: `012-export-trips-csv`

---

## Overview

This feature adds a client-initiated CSV export capability for past trips. Users can download a timestamped CSV file containing all their accessible trips, with both search-sourced and manually-entered trips included. The implementation is minimal, reusing existing auth, DB queries, and CSV utilities.

**Key Drivers**:
1. **Spec**: User wants to export travel history for offline analysis and archival
2. **Scope**: Single user story (export trips) + edge case handling (empty state)
3. **Tech Debt**: None — no breaking changes, uses established patterns from CLAUDE.md

---

## Architecture Decisions

### 1. **Read-Only, No Audit Logging**
Export is a **read operation**, not a write. Per CLAUDE.md's audit logging rule ("write actions are logged"), we **do not** call `logAudit()`. No audit table entry needed.

### 2. **Reuse Existing `csvFormatter.ts` Utilities**
Rather than importing a CSV library, leverage the existing `escapeCsvValue()` and `buildCsvContent()` functions in `src/lib/csvFormatter.ts`. This:
- Handles RFC 4180 escaping (quotes, commas, newlines)
- Avoids new dependencies
- Matches established project patterns

### 3. **Pure Function for CSV Formatting**
Implement `exportTripsCSV(trips: Trip[]): string` as a pure, testable function in `src/lib/exportTripsCSV.ts`. This:
- Separates data transformation from HTTP concerns
- Enables unit tests without mocking Supabase or Next.js
- Makes date formatting and field mapping reusable
- Follows CLAUDE.md testing conventions

### 4. **POST Endpoint, Not GET**
Use `POST /api/trips/export` (not GET) because:
- Follows existing pattern for data-returning API actions (e.g., flight search)
- Request body could future-expand (e.g., `{ filters: { startDate, endDate } }`)
- Clearer intent: "export this data"

### 5. **Browser-Side Download, Not Server Redirect**
Client-side `Blob` + `URL.createObjectURL()` + `<a>` click pattern instead of HTTP `Content-Disposition: attachment`:
- Works reliably across browsers
- No extra round-trip or page reload
- Allows naming control (`trips_export_YYYY-MM-DD.csv`)
- Aligns with existing frontend patterns (AddPastTripModal shows similar patterns)

### 6. **Filename Timestamp (Date-Only)**
Use `trips_export_YYYY-MM-DD.csv` format:
- Per spec assumption: "current timestamp (YYYY-MM-DD) is sufficient"
- No time component (simpler, avoids timezone confusion)
- New file on each export, browser download manager merges/renames duplicates

### 7. **Both Trip Sources in One Export**
No filtering by `source` ('search' vs 'manual'). CSV includes all trips the user can see:
- Matches spec requirement: "handle trips from both sources"
- Simpler query (single `SELECT *` on trips table, filtered by auth)
- Users expect unified export

---

## Implementation Plan

### Backend

#### 1. **New Endpoint: `/api/trips/export/route.ts`**

**Location**: `src/app/api/trips/export/route.ts`

**Responsibilities**:
- Verify auth (return 401 if no user)
- Fetch user's trips from Supabase
- Validate response schema with Zod
- Call `exportTripsCSV()` to generate CSV string
- Return CSV with correct HTTP headers (`Content-Type: text/csv`, `Content-Disposition: attachment`)

**Implementation Sketch**:
```ts
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { exportTripsCSV } from '@/lib/exportTripsCSV'
import { tripSchema } from '@/lib/tripSchemas' // or similar Zod schema
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export async function POST(request: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  
  // Validate response
  const tripsResult = z.array(tripSchema).safeParse(data)
  if (!tripsResult.success) {
    return NextResponse.json({ error: 'Invalid trip data' }, { status: 500 })
  }
  
  const csv = exportTripsCSV(tripsResult.data)
  
  // Generate filename with current date
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const filename = `trips_export_${today}.csv`
  
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
```

**Key Details**:
- Use `getUser()` for auth (respects activeMainAccountId implicitly via created_by)
- Reuse `tripSchema` from existing `tripSchemas.ts` or define inline Zod validation
- No audit logging (read operation)
- Fetch **all** trips for the user (no filtering by trip type)

#### 2. **CSV Formatter: `exportTripsCSV.ts`**

**Location**: `src/lib/exportTripsCSV.ts`

**Signature**:
```ts
export function exportTripsCSV(trips: TripWithUsers[]): string
```

**Responsibilities**:
- Format trip data to RFC 4180 CSV string
- Handle date formatting, null fields, special characters

**Implementation Sketch**:
```ts
import { TripWithUsers } from '@/types/database'
import { buildCsvContent } from '@/lib/csvFormatter'

export function exportTripsCSV(trips: TripWithUsers[]): string {
  const headers = [
    'Departure Airport',
    'Destination Airport',
    'Outbound Airline',
    'Outbound Flight Number',
    'Outbound Departure',
    'Outbound Arrival',
    'Return Airline',
    'Return Flight Number',
    'Return Departure',
    'Return Arrival',
    'Days Outside UK',
    'Created Date',
  ]
  
  const rows: string[][] = [headers]
  
  for (const trip of trips) {
    rows.push([
      trip.departure_airport ?? '',
      trip.destination_airport ?? '',
      trip.outbound_airline ?? '',
      trip.outbound_flight_number ?? '',
      formatDatetime(trip.outbound_departure_at),
      formatDatetime(trip.outbound_arrival_at),
      trip.return_airline ?? '',
      trip.return_flight_number ?? '',
      formatDatetime(trip.return_departure_at),
      formatDatetime(trip.return_arrival_at),
      String(trip.days_outside_uk ?? ''),
      formatDate(trip.created_at),
    ])
  }
  
  return buildCsvContent(rows)
}

function formatDatetime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(/(\d+)\/(\d+)\/(\d+),\s(\d+:\d+:\d+)/, '$3-$2-$1 $4')
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return iso.split('T')[0]
}
```

**Key Details**:
- Pure function, no side effects, fully testable
- Handles null/undefined fields as empty strings (not "null")
- Dates formatted as `YYYY-MM-DD HH:MM:SS` for datetime, `YYYY-MM-DD` for date
- Reuses `buildCsvContent()` which calls `escapeCsvValue()` for RFC 4180 compliance

#### 3. **Unit Tests: `exportTripsCSV.test.ts`**

**Location**: `src/lib/exportTripsCSV.test.ts`

**Test Cases**:
- Single trip with all fields → CSV has header + 1 row with correct data
- Multiple trips → CSV has header + N rows
- Trip with special characters (e.g., "Air France-KLM", "BA, Ltd.") → Properly escaped
- Trip with null fields → Empty cells in CSV (not "null")
- Date formatting → `YYYY-MM-DD HH:MM:SS` for times, `YYYY-MM-DD` for dates
- Empty array → CSV has header only

**Pattern** (per CLAUDE.md):
```ts
import { describe, it, expect } from 'vitest'
import { exportTripsCSV } from './exportTripsCSV'
import { TripWithUsers } from '@/types/database'

describe('exportTripsCSV', () => {
  it('should generate CSV header row', () => {
    const result = exportTripsCSV([])
    expect(result).toContain('Departure Airport,Destination Airport')
  })
  
  it('should format single trip correctly', () => {
    const trip: TripWithUsers = {
      id: '1',
      departure_airport: 'LHR',
      destination_airport: 'CDG',
      outbound_airline: 'BA',
      outbound_flight_number: 'BA001',
      outbound_departure_at: '2026-05-01T08:00:00Z',
      outbound_arrival_at: '2026-05-01T10:00:00Z',
      return_airline: 'AF',
      return_flight_number: 'AF002',
      return_departure_at: '2026-05-05T12:00:00Z',
      return_arrival_at: '2026-05-05T14:00:00Z',
      days_outside_uk: 4,
      created_at: '2026-04-01T00:00:00Z',
      // ... other required fields
    }
    const result = exportTripsCSV([trip])
    expect(result).toContain('LHR')
    expect(result).toContain('CDG')
  })
  
  // ... more tests
})
```

---

### Frontend

#### 1. **Modified Component: `PastTrips.tsx`**

**Location**: `src/components/dashboard/PastTrips.tsx`

**Changes**:
1. Add export button next to "+ Add past trip" button (existing flex container, line ~273)
2. Button state: disabled when `trips.length === 0`, loading state during POST
3. On click: POST to `/api/trips/export`, handle response as Blob, trigger download

**Implementation Sketch**:
```ts
'use client'
import { useState } from 'react'
import { useToast } from '@/context/ToastContext'

export default function PastTrips({ trips, ... }: Props) {
  const [exporting, setExporting] = useState(false)
  const toast = useToast()
  
  async function handleExport() {
    setExporting(true)
    try {
      const response = await fetch('/api/trips/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      if (!response.ok) {
        throw new Error('Export failed')
      }
      
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = blob.type.includes('csv') 
        ? `trips_export_${new Date().toISOString().split('T')[0]}.csv`
        : 'trips_export.csv'
      document.body.appendChild(a)
      a.click()
      URL.revokeObjectURL(url)
      a.remove()
      
      toast('Trips exported successfully', 'success')
    } catch (err) {
      toast('Failed to export trips', 'error')
    } finally {
      setExporting(false)
    }
  }
  
  return (
    <section>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={handleExport}
            disabled={trips.length === 0 || exporting}
            style={{
              fontSize: 13, fontWeight: 600, color: 'var(--blue-500)', background: 'none', border: 'none',
              cursor: trips.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'var(--sans)',
              opacity: trips.length === 0 ? 0.4 : 1,
            }}
            title={trips.length === 0 ? 'No trips to export' : undefined}
          >
            {exporting ? '…' : 'Export to CSV'}
          </button>
          <button
            onClick={() => setShowModal(true)}
            disabled={!!atTripLimit}
            style={{...}}
          >
            + Add past trip
          </button>
        </div>
        {atTripLimit && (...)}
      </div>
      {trips.length === 0 ? (
        <EmptyState message="No past trips yet. Use the button above to log a trip taken before Sojourn." />
      ) : (
        <div style={{...}}>
          {trips.map((trip, i) => (...))}
        </div>
      )}
    </section>
  )
}
```

**Key Details**:
- Export button disabled when `trips.length === 0` (empty state)
- Loading state: `exporting` flag toggles button text to "…"
- Blob download pattern: fetch → blob → ObjectURL → `<a>` click → cleanup
- Toast for success/error feedback
- Title attribute for tooltip when disabled

---

## Data Flow

```
User clicks "Export to CSV"
  ↓
PastTrips.tsx: handleExport()
  ↓
POST /api/trips/export
  ↓
API route: Verify auth, fetch trips, validate, call exportTripsCSV()
  ↓
exportTripsCSV(): Format to RFC 4180 CSV string
  ↓
API returns CSV as text/csv with attachment header
  ↓
PastTrips.tsx: Convert to Blob, trigger download via <a> click
  ↓
Browser downloads `trips_export_YYYY-MM-DD.csv`
```

---

## Testing Strategy

### Unit Tests (Backend)
- **File**: `src/lib/exportTripsCSV.test.ts`
- **Scope**: Pure function tests, no mocking
- **Cases**: Basic export, special chars, null fields, date formatting, empty array
- **Run**: `npm test`

### Integration Test (Manual)
- Start `npm run dev`
- Navigate to dashboard with past trips
- Click "Export to CSV"
- Verify download completes with correct filename
- Open CSV in Excel/Google Sheets, verify columns and data
- Test with special characters (e.g., airline name with apostrophe)
- Test with multiple trips (5+)
- Verify download time < 2 seconds

### Smoke Test (Manual)
- Empty state: No trips → Export button disabled
- Full state: With trips → Export button enabled and downloadable
- No console errors in DevTools

---

## Files to Create/Modify

| File | Type | Purpose |
|------|------|---------|
| `src/app/api/trips/export/route.ts` | **Create** | POST endpoint for CSV export |
| `src/lib/exportTripsCSV.ts` | **Create** | Pure function for CSV formatting |
| `src/lib/exportTripsCSV.test.ts` | **Create** | Unit tests for CSV formatter |
| `src/components/dashboard/PastTrips.tsx` | **Modify** | Add export button + handler |

**Files NOT Modified**:
- `src/lib/csvFormatter.ts` — Existing utilities sufficient; no changes needed
- `src/app/api/trips/route.ts` — No changes (export is separate endpoint)
- Database schema — No changes (read-only feature)

---

## Implementation Order

### Phase 1: Backend Infrastructure
1. Create `src/lib/exportTripsCSV.ts` (pure function)
2. Create `src/lib/exportTripsCSV.test.ts` (unit tests)
3. Create `src/app/api/trips/export/route.ts` (API endpoint)
4. Run `npm test` to verify tests pass

### Phase 2: Frontend Integration
5. Modify `src/components/dashboard/PastTrips.tsx` (add export button + handler)
6. Test manually in browser

### Phase 3: Quality Gates
7. `npm run build` — Verify no TypeScript errors
8. `npm run lint` — Verify no linting issues
9. Final smoke test — Test export flow end-to-end

**Parallelization**: Steps 1–3 can run in parallel (independent files). Step 5 depends on step 3 completion. Steps 7–9 are sequential final gates.

---

## CLAUDE.md Adherence

✅ **Auth-First**: API route checks auth before any DB operations  
✅ **Zod Validation**: Response validated before processing  
✅ **No Audit Logging**: Read-only operation, no write audit needed  
✅ **Pure Function Tests**: `exportTripsCSV()` tested without mocking  
✅ **Tailwind Only**: No CSS modules, inline styles minimal (reused from PastTrips)  
✅ **No New Dependencies**: Reuses existing `csvFormatter.ts`  
✅ **Component Patterns**: Client component with `'use client'` for event handlers  
✅ **Toast Notifications**: Error feedback via `useToast()`  
✅ **No Console.log**: Final gate checks for debug statements  

---

## Edge Cases & Assumptions

| Case | Handling |
|------|----------|
| No trips (empty state) | Export button disabled with title "No trips to export" |
| 100+ trips | Single CSV with all rows; download < 2 seconds expected |
| Null/undefined fields | Empty cells in CSV (not "null" strings) |
| Special characters in airline names | RFC 4180 escaping via `escapeCsvValue()` |
| Both search + manual trips | All trips included, no filtering by source |
| Concurrent exports | No state conflicts (POST is stateless) |
| Browser without download support | Unlikely (modern browsers); graceful error via toast |

---

## Performance Considerations

- **CSV Generation**: O(n) where n = trip count; pure string concatenation
- **API Response**: Single DB query (SELECT *) + CSV formatting; <200ms for 100 trips expected
- **Download**: Browser native, not rate-limited
- **Memory**: Single CSV string in memory (50 trips ≈ 20KB typical); no pagination needed

---

## Future Enhancements (Out of Scope)

- Filtered exports (date range, airline filter)
- Alternative formats (JSON, Excel)
- Async download queue for very large exports
- Email delivery of CSV
- Scheduled exports

---

## Rollback Plan

If issues arise before merge:
1. Revert `src/components/dashboard/PastTrips.tsx` to remove button
2. Delete `src/app/api/trips/export/route.ts`
3. Delete `src/lib/exportTripsCSV.ts` and `.test.ts`
4. No DB migrations to revert (read-only feature)

No user data affected; no infrastructure changes.
