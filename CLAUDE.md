# My Travel Assistant — Agent Context

## Project Overview
Next.js 16 travel app for tracking UK-based travel. Users search flights (via SerpAPI), select outbound + return flights, and save trips to Supabase. Two roles: **Owner** (full access, can delete) and **Assistant** (read + create only). All write actions are logged to an audit table.

## Tech Stack
- **Framework**: Next.js 16 (App Router), React 19, TypeScript strict
- **Database + Auth**: Supabase (Postgres + Supabase Auth)
- **Styling**: Tailwind CSS v4
- **Validation**: Zod
- **Testing**: Vitest (`npm test` runs all tests)
- **Flight data**: SerpAPI (Google Flights)

## Running the Project
```bash
npm run dev       # dev server on :3000
npm test          # run all vitest tests
npm run build     # production build (must pass before done)
npm run lint      # eslint check
```

## Directory Structure
```
src/
  app/
    page.tsx                    # dashboard (SSR)
    layout.tsx                  # root layout + providers
    search/page.tsx             # flight search
    audit/page.tsx              # audit log
    login/page.tsx              # auth
    auth/callback/route.ts      # OAuth callback
    api/
      flights/search/route.ts   # POST — flight search
      airports/route.ts         # GET — airport autocomplete proxy
      trips/route.ts            # GET + POST trips
      trips/[id]/route.ts       # DELETE trip
      audit/route.ts            # GET audit log
  components/
    Nav.tsx
    search/   SearchForm, AirportAutocomplete, FlightCard, FlightResultsPanel, TripSummary, BABadge
    dashboard/ TripCard, UpcomingTrips, PastTrips, EmptyState, AddPastTripModal
    audit/    AuditEntry, ChangesDetail
    ui/       Skeleton, Toast
  context/
    UserContext.tsx   # { user, role, displayName }
    ToastContext.tsx
  hooks/
    useFlightSearch.ts
  lib/
    supabase/client.ts   # browser client
    supabase/server.ts   # server client (cookies)
    supabase/admin.ts    # service role (server only)
    auth.ts              # getUser() helper for server components
    serpapi.ts           # flight search via SerpAPI
    flightRanker.ts      # BA-first ranking + slot filtering
    airlineLogos.ts      # IATA → logo mapping
    daysCalculator.ts    # days outside UK (pure, tested)
    auditLogger.ts       # logAudit() helper
  types/
    database.ts          # TypeScript interfaces for all DB tables
    flights.ts           # FlightOffer type
  middleware.ts          # protect all routes except /login, /auth/callback
```

## Code Conventions

### API Routes
- Always check auth first: `const { data: { user } } = await supabase.auth.getUser()`
- Return `401` if no user, `400` for bad input, `500` for DB errors
- Validate all request bodies with **Zod** before touching the DB
- Write API routes must call `logAudit()` before returning success

```ts
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // ... validate with Zod, then DB operation, then logAudit
}
```

### Supabase Clients
- **Browser components**: `import { createClient } from '@/lib/supabase/client'`
- **Server components / API routes**: `import { createClient } from '@/lib/supabase/server'` (async, uses cookies)
- **Admin operations** (audit writes): `import { createAdminClient } from '@/lib/supabase/admin'`

### Auth / Role Checks
- Server: `import { getUser } from '@/lib/auth'` — returns `{ user, role, displayName } | null`
- Client: `import { useUser } from '@/context/UserContext'`
- Role values: `'owner'` | `'assistant'`

### Component Patterns
- Server components by default; add `'use client'` only when needed (event handlers, hooks)
- Tailwind only — no CSS modules or inline styles
- Skeleton loading states (not spinners) for all async data
- Toast notifications via `useToast()` for all user-facing errors

### Testing
- Tests live next to the file: `src/lib/foo.test.ts`
- Pure functions only — no mocking of Supabase or Next.js
- Run `npm test` after implementing any testable logic

## Database Schema (key tables)
```sql
trips (id, departure_airport, destination_airport, outbound_airline, outbound_flight_number,
       outbound_departure_at, outbound_arrival_at, return_airline, return_flight_number,
       return_departure_at, return_arrival_at, days_outside_uk, created_by, last_modified_by,
       created_at, updated_at)

user_roles (user_id, role, display_name, created_at)

audit_log (id, performed_by, action, trip_id, trip_snapshot, changes, created_at)
```

## Environment Variables
All required vars are in `.env.local` (never commit). Key ones:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SERPAPI_KEY`

## Story Spec
Full feature specs are in `STORIES.md` (v1.1). Stories 1–9 are complete. A manual trip entry story was added (AddPastTripModal). Story 10 (Vercel deploy) is pending.

## Trip Sources
Trips have two sources (discriminated union in `POST /api/trips`):
- `source: 'search'` — full flight data from the search flow
- `source: 'manual'` — minimal data (airports + dates only), entered via `AddPastTripModal`

## Definition of Done (per feature)
1. All acceptance criteria in the story are met
2. `npm run build` passes with no type errors
3. `npm test` passes
4. `npm run lint` passes
5. No `console.log` left in production code

<!-- SPECKIT START -->
## Current Feature Plan
Active implementation plan: `specs/015-portfolio-advisor/plan.md`
<!-- SPECKIT END -->
