# User Stories — My Travel Assistant

**Version**: 1.1  
**Date**: 2026-05-04  
**Reference**: PRD v1.3  

Each story is scoped to fit within a single implementation session (~50K tokens). Stories must be built in order — each one depends on the previous.

---

## Story 1 — Project Foundation & Database Schema

**As a** developer,  
**I want** the Next.js project wired up to Supabase with the full database schema in place,  
**so that** all subsequent stories have a stable foundation to build on.

### Acceptance Criteria
- [ ] Supabase client is initialised and accessible from both server and client components
- [ ] `.env.local` template file (`.env.example`) lists all required variables with placeholder values
- [ ] `user_roles` table exists with `user_id`, `role`, `display_name`, `created_at`
- [ ] `trips` table exists with all columns defined in PRD §8
- [ ] `audit_log` table exists with all columns defined in PRD §8
- [ ] RLS is enabled on all three tables
- [ ] RLS policies: authenticated users can read all trips; authenticated users can insert trips; only owner role can delete trips; audit_log is readable by all authenticated users, writable only via service role
- [ ] `updated_at` on `trips` auto-updates via a Postgres trigger
- [ ] A SQL migration file (`supabase/migrations/001_initial_schema.sql`) contains the full schema so it can be re-run from scratch
- [ ] TypeScript types generated from the schema are available in `src/types/database.ts`

### Technical Tasks
- Install `@supabase/supabase-js` and `@supabase/ssr`
- Create `src/lib/supabase/client.ts` (browser client)
- Create `src/lib/supabase/server.ts` (server client using cookies)
- Create `src/lib/supabase/admin.ts` (service role client — server only)
- Write `supabase/migrations/001_initial_schema.sql`
- Write `src/types/database.ts` with full TypeScript interfaces for all tables

### Files Created
```
supabase/migrations/001_initial_schema.sql
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/admin.ts
src/types/database.ts
.env.example
```

---

## Story 2 — Authentication & Role-Based Access

**As a** user (Owner or Assistant),  
**I want** to log in with my email and password (or Google, if I'm the owner),  
**so that** I can access the app and no one else can.

### Acceptance Criteria
- [ ] `/login` page renders an email/password form and a "Sign in with Google" button
- [ ] Successful email/password login redirects to `/`
- [ ] Successful Google OAuth login redirects to `/`
- [ ] All routes except `/login` and `/auth/callback` are protected by middleware
- [ ] Unauthenticated requests to any protected route redirect to `/login`
- [ ] After login, the user's role is fetched from `user_roles` and stored in the session/context
- [ ] A `useUser` hook (or equivalent server context) exposes `{ user, role, displayName }` to all components
- [ ] Signing out clears the session and redirects to `/login`
- [ ] A sign-out button is visible in the app's nav/header on all protected pages

### Technical Tasks
- Configure Supabase Auth Google OAuth provider (instructions in README)
- Create `src/app/login/page.tsx` — login form UI
- Create `src/app/auth/callback/route.ts` — OAuth callback handler
- Create `src/middleware.ts` — protect all routes, redirect unauthenticated users
- Create `src/lib/auth.ts` — helper to fetch user + role from Supabase server-side
- Create `src/context/UserContext.tsx` — client-side context for user + role
- Update `src/app/layout.tsx` to wrap app in `UserProvider` and render the nav with sign-out

### Files Created / Modified
```
src/app/login/page.tsx
src/app/auth/callback/route.ts
src/middleware.ts
src/lib/auth.ts
src/context/UserContext.tsx
src/app/layout.tsx  (modified)
src/components/Nav.tsx
```

---

## Story 3 — Amadeus Flight Search API Route

**As a** developer,  
**I want** a server-side API route that queries Amadeus and returns the top 3 ranked flights per direction,  
**so that** the frontend can display real flight options without exposing API credentials.

### Acceptance Criteria
- [ ] `POST /api/flights/search` accepts `{ origin, destination, departureDate, returnDate, outboundSlot, returnSlot }` in the request body
- [ ] Route authenticates with Amadeus using client credentials (token cached for reuse within its validity window)
- [ ] Route calls Amadeus Flight Offers Search API for outbound leg and return leg in parallel
- [ ] Results are filtered to only include flights departing within the requested time slot (Morning 06:00–13:00 / Evening 13:00–23:59)
- [ ] Results are ranked: British Airways first, then fewest stops, then fastest duration
- [ ] Only the top 3 results per direction are returned
- [ ] Response shape: `{ outbound: FlightOffer[], return: FlightOffer[] }` with a normalised `FlightOffer` type
- [ ] If Amadeus returns no results for a slot, the response returns an empty array (not an error)
- [ ] Amadeus credentials are read from env vars and never sent to the client
- [ ] Returns 401 if the caller is not authenticated

### Normalised `FlightOffer` type
```typescript
type FlightOffer = {
  id: string
  airline: string          // Full name e.g. "British Airways"
  airlineCode: string      // IATA e.g. "BA"
  flightNumber: string     // e.g. "BA107"
  departureAt: string      // ISO datetime
  arrivalAt: string        // ISO datetime
  durationMinutes: number
  stops: number
  price: number            // Per person, one-way, GBP
  currency: string
  isBA: boolean
}
```

### Technical Tasks
- Install `amadeus` Node.js SDK
- Create `src/lib/amadeus.ts` — initialise client, expose typed search helper
- Create `src/app/api/flights/search/route.ts` — POST handler
- Create `src/lib/flightRanker.ts` — ranking and filtering logic (pure function, testable)
- Write unit tests for `flightRanker.ts` covering BA priority, stop count, and duration sorting

### Files Created
```
src/lib/amadeus.ts
src/app/api/flights/search/route.ts
src/lib/flightRanker.ts
src/lib/flightRanker.test.ts
src/types/flights.ts
```

---

## Story 4 — Flight Search Form UI

**As a** user,  
**I want** to fill in a search form with my trip details and time preferences,  
**so that** I can trigger a flight search without knowing IATA codes by heart.

### Acceptance Criteria
- [ ] `/search` page renders a form with: origin airport, destination airport, departure date, return date, outbound time slot toggle (Morning / Evening), return time slot toggle (Morning / Evening)
- [ ] Airport fields use an autocomplete that queries Amadeus Airport & City Search API as the user types (debounced, min 2 chars), showing city name + IATA code
- [ ] Date pickers enforce: departure date ≥ today; return date > departure date
- [ ] All fields are required — the submit button is disabled until the form is complete
- [ ] On submit, the form calls `POST /api/flights/search` and shows a loading state (skeleton cards) while waiting
- [ ] If the API returns an error or empty results, a clear message is shown ("No flights found for this route and time slot")
- [ ] Form state is preserved if the user navigates back from results

### Technical Tasks
- Create `src/app/search/page.tsx` — page shell
- Create `src/components/search/SearchForm.tsx` — controlled form component
- Create `src/components/search/AirportAutocomplete.tsx` — debounced autocomplete input
- Create `src/app/api/airports/route.ts` — thin proxy to Amadeus Airport & City Search (to keep API key server-side)
- Create `src/hooks/useFlightSearch.ts` — manages search state (idle / loading / results / error)

### Files Created
```
src/app/search/page.tsx
src/components/search/SearchForm.tsx
src/components/search/AirportAutocomplete.tsx
src/app/api/airports/route.ts
src/hooks/useFlightSearch.ts
```

---

## Story 5 — Flight Results UI & Selection

**As a** user,  
**I want** to see the top 3 outbound and top 3 return flights after searching,  
**so that** I can compare options and select one of each to build my trip.

### Acceptance Criteria
- [ ] After a successful search, the `/search` page shows two columns (or stacked sections on mobile): Outbound Flights and Return Flights
- [ ] Each column shows up to 3 flight cards
- [ ] Each flight card displays: airline name, airline logo/icon, flight number, departure time → arrival time, duration, stops ("Direct" / "1 stop"), price in GBP, and a "BA" badge if the airline is British Airways
- [ ] Clicking a card selects it; selected card has a distinct highlighted style; clicking again deselects
- [ ] Only one card can be selected per direction at a time
- [ ] A "Review Trip" button appears (and is enabled) only when both an outbound and a return flight are selected
- [ ] Clicking "Review Trip" navigates to or scrolls to the trip summary panel (Story 6)
- [ ] BA flights are visually distinguishable from other airlines (badge + subtle highlight)

### Technical Tasks
- Create `src/components/search/FlightResultsPanel.tsx` — two-column results layout
- Create `src/components/search/FlightCard.tsx` — individual flight card with selection state
- Create `src/components/search/BABadge.tsx` — small BA indicator badge
- Update `src/hooks/useFlightSearch.ts` — add `selectedOutbound` and `selectedReturn` state
- Add airline logo mapping in `src/lib/airlineLogos.ts` (use text fallback if logo unavailable)

### Files Created / Modified
```
src/components/search/FlightResultsPanel.tsx
src/components/search/FlightCard.tsx
src/components/search/BABadge.tsx
src/lib/airlineLogos.ts
src/hooks/useFlightSearch.ts  (modified)
```

---

## Story 6 — Trip Summary, Days Calculation & Save

**As a** user,  
**I want** to review a summary of my selected flights with the days outside UK calculated,  
**so that** I can confirm the trip looks correct before saving it.

### Acceptance Criteria
- [ ] After selecting both flights, a trip summary panel is shown on the `/search` page below the results
- [ ] Summary displays: outbound flight (airline, number, departure date/time, arrival date/time), return flight (airline, number, departure date/time, arrival date/time), route (departure city → destination city), days outside UK (prominently displayed)
- [ ] Days outside UK is calculated as `return_date - departure_date - 1` (date portion only, timezone-safe)
- [ ] A "Save Trip" button saves the trip to Supabase via `POST /api/trips`
- [ ] On save, `created_by` is set to the current user's ID server-side; `last_modified_by` is also set to the same user
- [ ] On successful save, the user is redirected to `/` (the dashboard)
- [ ] On save failure, an inline error message is shown and the button returns to its normal state
- [ ] A "Back to results" link lets the user change their selection without losing the search form state

### Technical Tasks
- Create `src/components/search/TripSummary.tsx` — summary panel component
- Create `src/lib/daysCalculator.ts` — pure function for days outside UK calculation with unit tests
- Create `src/app/api/trips/route.ts` — GET (fetch all trips) and POST (create trip) handlers
- POST handler writes to `trips` table and triggers an audit log entry via the admin Supabase client

### Files Created
```
src/components/search/TripSummary.tsx
src/lib/daysCalculator.ts
src/lib/daysCalculator.test.ts
src/app/api/trips/route.ts
```

---

## Story 7 — Trip Dashboard (Upcoming & Past Trips)

**As a** user,  
**I want** to see all my saved trips split into upcoming and past sections,  
**so that** I have a clear view of my travel history and future plans.

### Acceptance Criteria
- [ ] `/` (home) page shows two sections: "Upcoming Trips" and "Past Trips"
- [ ] Upcoming: trips where departure date ≥ today, sorted by departure date ascending
- [ ] Past: trips where departure date < today, sorted by departure date descending
- [ ] If either section is empty, a friendly empty state message is shown
- [ ] Each trip card shows: destination city, departure date → return date, outbound flight (airline + number + time), return flight (airline + number + time), days outside UK (prominent), "Added by [name]", "Last edited by [name]" (if different from creator)
- [ ] A "Search flights" button/link in the header navigates to `/search`
- [ ] Owner sees a Delete button on each trip card; Assistant does not
- [ ] Clicking Delete (Owner only) shows a confirmation prompt, then calls `DELETE /api/trips/[id]`; on success the card is removed from the list
- [ ] Trip data is fetched server-side (SSR) for fast initial load

### Technical Tasks
- Create `src/app/page.tsx` — dashboard page with SSR data fetching
- Create `src/components/dashboard/TripCard.tsx` — individual trip card
- Create `src/components/dashboard/UpcomingTrips.tsx` — upcoming section
- Create `src/components/dashboard/PastTrips.tsx` — past section
- Create `src/components/dashboard/EmptyState.tsx` — empty state component
- Create `src/app/api/trips/[id]/route.ts` — DELETE handler (owner only, logs to audit)

### Files Created
```
src/app/page.tsx
src/components/dashboard/TripCard.tsx
src/components/dashboard/UpcomingTrips.tsx
src/components/dashboard/PastTrips.tsx
src/components/dashboard/EmptyState.tsx
src/app/api/trips/[id]/route.ts
```

---

## Story 7.5 — Manual Past Trip Entry

**As a** user,  
**I want** to log a past trip directly from the dashboard without searching for flights,  
**so that** I can record trips that were booked outside the app or taken before I started using it.

### Acceptance Criteria
- [ ] The Past Trips section on the dashboard has a **"+ Add past trip"** button visible to all authenticated users
- [ ] Clicking the button opens a modal with: origin airport (autocomplete), destination airport (autocomplete), departure date (date picker, max = yesterday), return date (date picker, min = departure date + 1, max = today)
- [ ] The Save button is disabled until all fields are filled and return date > departure date
- [ ] Clicking outside the modal or the × button closes it without saving
- [ ] On save, the trip is posted to `POST /api/trips` with `source: "manual"`; flight detail fields are omitted
- [ ] On success, a toast notification confirms the save and the dashboard refreshes
- [ ] On failure, a toast error is shown and the modal stays open
- [ ] The saved trip card displays **"Manually added"** in place of flight info
- [ ] Days outside UK is calculated automatically from the two dates
- [ ] The action is recorded in the audit log as `created`
- [ ] The database allows null flight detail columns via migration `002_add_manual_trips.sql`

### Technical Tasks
- Add `source VARCHAR(10) NOT NULL DEFAULT 'search' CHECK (source IN ('search', 'manual'))` column to `trips` table
- Make `outbound_airline`, `outbound_flight_number`, `outbound_arrival_at`, `return_airline`, `return_flight_number`, `return_arrival_at` nullable in `trips` table
- Write `supabase/migrations/002_add_manual_trips.sql`
- Create `src/components/dashboard/AddPastTripModal.tsx` — modal component
- Update `src/app/api/trips/route.ts` — handle `source: "manual"` in POST handler with `ManualTripSchema` validation
- Update `src/components/dashboard/PastTrips.tsx` — add "+" button and render modal
- Update `src/components/dashboard/TripCard.tsx` — render "Manually added" when `source === "manual"`
- Update `src/types/database.ts` — add `source` field and make flight detail fields optional

### Files Created / Modified
```
supabase/migrations/002_add_manual_trips.sql
src/components/dashboard/AddPastTripModal.tsx
src/app/api/trips/route.ts            (modified)
src/components/dashboard/PastTrips.tsx  (modified)
src/components/dashboard/TripCard.tsx   (modified)
src/types/database.ts                   (modified)
```

---

## Story 8 — Audit Log

**As a** user (Owner or Assistant),  
**I want** to view a chronological log of all actions taken on trips,  
**so that** I know who created, changed, or deleted any trip and when.

### Acceptance Criteria
- [ ] `/audit` page is accessible to both Owner and Assistant roles
- [ ] Page shows a table/list of audit log entries, newest first
- [ ] Each entry shows: timestamp (formatted, local time), user display name + email, action type (Created / Updated / Deleted) with a colour-coded badge, trip destination + departure date, and for Updates a collapsible "Changes" section showing before/after values for each changed field
- [ ] Deleted trips show the trip details from the snapshot (since the trip row may no longer exist)
- [ ] Audit entries are paginated (20 per page) or use infinite scroll
- [ ] All three write API routes (`POST /api/trips`, `DELETE /api/trips/[id]`, any future `PATCH`) write to `audit_log` using the service role client before returning their response
- [ ] The `audit_log` table has an RLS policy preventing any client-side writes

### Technical Tasks
- Create `src/app/audit/page.tsx` — audit log page with SSR data fetching
- Create `src/app/api/audit/route.ts` — GET handler returning paginated audit entries joined with `user_roles` for display names
- Create `src/components/audit/AuditEntry.tsx` — single audit log entry row
- Create `src/components/audit/ChangesDetail.tsx` — collapsible before/after diff
- Create `src/lib/auditLogger.ts` — reusable server-side helper to write audit entries (used by all write API routes)
- Update `src/app/api/trips/route.ts` and `src/app/api/trips/[id]/route.ts` to call `auditLogger`

### Files Created / Modified
```
src/app/audit/page.tsx
src/app/api/audit/route.ts
src/components/audit/AuditEntry.tsx
src/components/audit/ChangesDetail.tsx
src/lib/auditLogger.ts
src/app/api/trips/route.ts         (modified)
src/app/api/trips/[id]/route.ts    (modified)
```

---

## Story 9 — Polish, Error Handling & Responsive Layout

**As a** user,  
**I want** the app to handle loading states, errors, and small screens gracefully,  
**so that** it feels complete and reliable on any device.

### Acceptance Criteria
- [ ] All data-fetching states have a loading skeleton (not a spinner) that matches the layout of the loaded content
- [ ] All API errors surface a user-facing toast or inline message — no silent failures
- [ ] The search form, results, and dashboard are fully usable on a 375px wide screen (iPhone SE)
- [ ] Flight results columns stack vertically on mobile, side-by-side on desktop (≥768px)
- [ ] Dashboard trip cards use a single-column layout on mobile
- [ ] The nav is a hamburger menu on mobile
- [ ] All interactive elements have focus-visible styles for keyboard accessibility
- [ ] Page titles are set correctly via Next.js `metadata` on each page
- [ ] A 404 page (`not-found.tsx`) and a global error boundary (`error.tsx`) exist

### Technical Tasks
- Create `src/components/ui/Skeleton.tsx` — generic skeleton component
- Create `src/components/ui/Toast.tsx` + `src/context/ToastContext.tsx` — toast notification system
- Audit all pages for responsive breakpoints and fix layout issues
- Create `src/app/not-found.tsx`
- Create `src/app/error.tsx`
- Add `metadata` exports to all page files

### Files Created / Modified
```
src/components/ui/Skeleton.tsx
src/components/ui/Toast.tsx
src/context/ToastContext.tsx
src/app/not-found.tsx
src/app/error.tsx
src/app/layout.tsx           (modified — add ToastProvider)
src/app/page.tsx             (modified — metadata)
src/app/search/page.tsx      (modified — metadata)
src/app/audit/page.tsx       (modified — metadata)
```

---

## Story 10 — Vercel Deployment & Environment Configuration

**As a** developer,  
**I want** the app deployed to Vercel and accessible online with all secrets configured,  
**so that** both Owner and Assistant can use it from any device.

### Acceptance Criteria
- [ ] App is deployed to Vercel and accessible at a stable URL
- [ ] All environment variables from `.env.example` are set in Vercel project settings
- [ ] Supabase Auth redirect URLs are configured to include the Vercel production URL
- [ ] Google OAuth redirect URI is updated to include the production URL
- [ ] `next.config.ts` has correct image domain config for any external images (airline logos)
- [ ] A `README.md` section documents: how to set up Supabase, how to run the migration, how to create user accounts, how to set env vars locally and on Vercel
- [ ] Production build (`next build`) passes with no type errors or build warnings
- [ ] The app is verified end-to-end: login → search → select flights → save trip → view dashboard → view audit log → delete trip

### Technical Tasks
- Update `README.md` with full setup instructions
- Update `next.config.ts` with any required config (image domains, etc.)
- Verify `tsconfig.json` strict mode is on
- Run `next build` locally and fix any type or lint errors
- Deploy to Vercel via GitHub integration or `vercel` CLI

### Files Modified
```
README.md
next.config.ts
```

---

## Story Dependency Map

```
Story 1 (Foundation)
    └── Story 2 (Auth)
            ├── Story 3 (SerpAPI Flight Search)
            │       ├── Story 4 (Search Form)
            │       │       └── Story 5 (Results UI)
            │       │               └── Story 6 (Trip Summary + Save)
            │       │                       ├── Story 7 (Dashboard)
            │       │                       │       └── Story 7.5 (Manual Past Trip Entry)
            │       │                       └── Story 8 (Audit Log)
            │       │                               └── Story 9 (Polish)
            │       │                                       └── Story 10 (Deploy)
```

---

## Total Estimated Stories: 11
