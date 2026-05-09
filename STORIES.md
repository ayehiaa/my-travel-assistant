# User Stories — My Travel Assistant

**Version**: 1.6  
**Date**: 2026-05-09  
**Reference**: PRD v1.9  

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

## Story 11 — Password Reset

**As a** user (Owner or Assistant),
**I want** to reset my password via a secure email link,
**so that** I can regain access to my account if I forget my password.

### Acceptance Criteria
- [ ] The `/login` page has a "Forgot password?" link below the password field
- [ ] Clicking the link navigates to `/forgot-password`
- [ ] `/forgot-password` shows a single email input and a "Send reset link" button
- [ ] Submitting the form calls Supabase `resetPasswordForEmail` with `redirectTo` set to `${origin}/reset-password`
- [ ] A success state is shown regardless of whether the email exists (prevents user enumeration)
- [ ] The reset email uses the custom template configured in the Supabase dashboard (see Setup Note below)
- [ ] Clicking the link in the email navigates the user to `/reset-password` with a Supabase `code` param
- [ ] `/reset-password` exchanges the code for a session, then shows a "New password" field and a "Confirm password" field
- [ ] The form is disabled and shows a clear error if the reset link is invalid or expired
- [ ] New password must be at least 8 characters; confirm field must match
- [ ] Inline validation errors appear before submit (no round-trip needed)
- [ ] On successful password update, the user is redirected to `/login?message=password_updated`
- [ ] `/login` shows a green success banner when `?message=password_updated` is present in the URL
- [ ] Both `/forgot-password` and `/reset-password` are public routes (no auth required)

### Setup Note — Supabase Email Template
In the Supabase dashboard → Auth → Email Templates → Reset Password, set the template to:

> **Subject:** Reset your Travel Assistant password
>
> Hi,
>
> We received a request to reset the password for your Travel Assistant account. Click the button below to choose a new password.
>
> [Reset my password] → `{{ .ConfirmationURL }}`
>
> This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your account remains secure.
>
> — The Travel Assistant team

This is a manual one-time setup step; it is not automated by code.

### Technical Tasks
- Update `src/proxy.ts` — add `/forgot-password` and `/reset-password` to the public routes allowlist alongside `/login` and `/auth/callback`
- Create `src/app/forgot-password/page.tsx` — email input form; calls `supabase.auth.resetPasswordForEmail`
- Create `src/app/reset-password/page.tsx` — exchanges `code` param for session via `supabase.auth.exchangeCodeForSession`, then shows new password + confirm form; calls `supabase.auth.updateUser({ password })`
- Update `src/app/login/page.tsx` — add "Forgot password?" link below password field; read `?message=password_updated` query param and render a green success banner

### Files Created / Modified
```
src/app/forgot-password/page.tsx       (new)
src/app/reset-password/page.tsx        (new)
src/app/login/page.tsx                 (modified — forgot link + success banner)
src/proxy.ts                           (modified — public route allowlist)
```

### Dependencies
- Story 2 (Authentication) — requires Supabase Auth to be configured
- No dependency on Story 10 (Vercel deploy) — can be built and tested locally

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

## Story 12 — Trip Timeline View ✅

**As a** user (Owner or Assistant),
**I want** a visual Gantt-style timeline of all my trips spanning 6 months back and 6 months ahead,
**so that** I can see my travel schedule at a glance with country flags and key dates without having to scroll through card lists.

### Acceptance Criteria
- [x] A new `/timeline` page is accessible to all authenticated users
- [x] "Timeline" link appears in the main nav (desktop and mobile hamburger menu) between "Search Flights" and "Audit Log"
- [x] The timeline window spans from **today − 180 days** to **today + 180 days**, recalculated on each page load
- [x] Each trip is rendered as a horizontal bar whose left edge is `outbound_departure_at` and right edge is `return_departure_at`
- [x] Each bar displays only the destination country's flag emoji (no country name on the bar)
- [x] Flags are resolved from a static airport-code → country lookup table (`src/lib/airportCountry.ts`); unknown codes fall back to ✈️
- [x] Past trips (bars entirely before today) are rendered at reduced opacity (dimmed) to visually distinguish them from upcoming trips
- [x] A vertical "Today" marker line (amber/gold colour) is drawn at the current date across all rows
- [x] Month labels are shown along the top axis (e.g. "Apr 26", "May 26", …)
- [x] Hovering a bar shows a tooltip with: destination name, route (e.g. LHR → DXB), depart date, return date, and duration in days
- [x] Clicking a bar does nothing (tooltip on hover is sufficient)
- [x] Four summary stat cards appear above the chart: **Upcoming trips**, **Past trips (in window)**, **Days abroad (in window)**, **Countries visited/planned (in window)**
- [x] If there are no trips in the window, an empty state message is shown instead of the chart
- [x] The chart scrolls horizontally on narrow screens (the time axis is not truncated)
- [x] The page uses the same dark card style (`bg-[#1e2130]`, dark background) established in the mockup, not the white dashboard card style

### Bug Fix (post-implementation)
Days abroad stat card and tooltip were using raw `return − departure` date diff instead of the stored `days_outside_uk` value. Fixed in commit `3981a7f` — the page now fetches `days_outside_uk` alongside trip dates and uses it directly for both the stat card total and the tooltip duration.

### Technical Tasks
- Create `src/lib/airportCountry.ts` — static lookup: `Record<string, { country: string; flag: string }>` covering the ~200 most common IATA airport codes
- Create `src/app/timeline/page.tsx` — server component; fetches all trips for the current user via Supabase, computes the window (today − 180 days → today + 180 days), passes data as props to the chart component
- Create `src/components/timeline/TripTimeline.tsx` — client component; renders the full Gantt chart (month header, grid lines, trip rows, today line, stat cards) using pure CSS/inline styles (no charting library)
- Create `src/components/timeline/Tooltip.tsx` — hover tooltip component (fixed-position, pointer-events: none)
- Update `src/components/Nav.tsx` — add `{ href: '/timeline', label: 'Timeline' }` to the `links` array

### Files Created / Modified
```
src/lib/airportCountry.ts                     (new)
src/app/timeline/page.tsx                     (new)
src/components/timeline/TripTimeline.tsx      (new)
src/components/timeline/Tooltip.tsx           (new)
src/components/Nav.tsx                        (modified — add Timeline link)
```

### Design Reference
`public/timeline-mockup.html` — agreed visual reference. Key design decisions locked in:
- Dark background (`#0f1117` body, `#1e2130` card)
- Flag emoji only on bar (no country name text)
- Amber today line (`#f59e0b`)
- Past trips dimmed with reduced opacity and faded gradient
- Hover tooltip for all trip detail
- No click action on bars

### Dependencies
- Story 7 (Dashboard) — trips must already be saved to Supabase
- Story 2 (Auth) — page is protected by existing middleware; no additional auth work needed

---

## Story 13 — Role Rename & Multi-Account Schema ✅

**As a** developer,
**I want** the data model updated to support isolated main accounts with linked assistants,
**so that** Stories 14 and all future features have a stable, correctly scoped foundation.

### Context & Decisions
- `'owner'` role renamed to `'main'` throughout (DB + code)
- Trips gain an `owner_id` column (which main account the trip belongs to)
- New `account_links` join table (many-to-many: main ↔ assistant)
- `audit_log` gains `on_behalf_of` for assistant attribution
- RLS policies fully rewritten to enforce per-main-account isolation
- Existing trips backfilled: `owner_id = created_by`

### Acceptance Criteria
- [x] `user_roles.role` check constraint updated to `'main' | 'assistant'`; existing `'owner'` rows migrated to `'main'`
- [x] `trips.owner_id uuid not null references auth.users(id)` column added; existing rows backfilled with `created_by`
- [x] `account_links` table created with `(main_user_id, assistant_user_id)` unique pair; RLS enabled
- [x] `audit_log.on_behalf_of uuid nullable references auth.users(id)` column added
- [x] All four RLS policies on `trips` replaced:
  - **SELECT**: user sees trip if `owner_id = auth.uid()` OR user is a linked assistant of that owner
  - **INSERT**: `created_by = auth.uid()` AND (`owner_id = auth.uid()` OR user is a linked assistant of that owner)
  - **UPDATE**: same scope as SELECT; `last_modified_by = auth.uid()`
  - **DELETE**: same scope as SELECT (both main and their assistants can delete)
- [x] `account_links` RLS: main accounts can SELECT/INSERT/DELETE their own links; assistants can SELECT links where they are the assistant
- [x] `UserRole` TypeScript type updated to `'main' | 'assistant'`; all references to `'owner'` updated across the codebase
- [x] `Trip` TypeScript interface gains `owner_id: string`
- [x] `AccountLink` TypeScript interface added to `database.ts`
- [x] Seed script updated: creates users with role `'main'` (not `'owner'`); accepts `SEED_ROLE` env var for `'assistant'`
- [x] All existing tests pass; no runtime errors on dev server

### Technical Tasks
- Write `supabase/migrations/002_multi_account.sql` containing:
  - `ALTER TABLE user_roles` — drop old check, add new check, `UPDATE` existing rows
  - `ALTER TABLE trips ADD COLUMN owner_id` + backfill + not-null constraint
  - `CREATE TABLE account_links`
  - `ALTER TABLE audit_log ADD COLUMN on_behalf_of`
  - `DROP POLICY` (all 4 trip policies) + `CREATE POLICY` (new 4)
  - New RLS policies for `account_links`
- Update `src/types/database.ts` — `UserRole`, `Trip`, add `AccountLink`
- Global find-and-replace `'owner'` → `'main'` in all `.ts`/`.tsx` files (role string literals only)
- Update `scripts/seed-user.mjs` — default role `'main'`, optional `SEED_ROLE` env var

### Files Created / Modified
```
supabase/migrations/002_multi_account.sql    (new)
src/types/database.ts                        (modified)
scripts/seed-user.mjs                        (modified)
src/lib/auth.ts                              (modified — 'owner' → 'main')
src/app/page.tsx                             (modified — 'owner' → 'main')
src/app/api/trips/route.ts                   (modified — owner_id in insert)
src/app/api/trips/[id]/route.ts              (modified — 'owner' → 'main')
src/app/api/audit/route.ts                   (modified — 'owner' → 'main')
```

### Dependencies
- Story 1 (Foundation) — schema must exist
- Must be completed before Story 14

---

## Story 14 — Multi-Account UI & Data Isolation ✅

**As a** main account user,
**I want** my trips to be fully isolated from other users,
**and as an** assistant,
**I want** to switch between the main accounts I'm linked to and manage their trips on their behalf,
**so that** each user sees only what they're authorised to see.

### Context & Decisions
- Main accounts always operate in their own context — no switcher needed
- Assistants get an account switcher dropdown in the nav; selection stored in `active_main_account` cookie
- All server-side data fetches (dashboard, timeline, audit log, search save) are scoped to `activeMainAccountId`
- New `/settings` page (main accounts only): list linked assistants, add by email, remove
- Nav: Settings link visible to main accounts only
- `audit_log.on_behalf_of` populated when an assistant performs a write (value = assistant's `user_id`; `performed_by` = main account's `user_id`)
- Audit log UI updated to show "by [assistant] on behalf of [main]" when `on_behalf_of` is set

### Acceptance Criteria

**Data isolation**
- [x] Main account dashboard shows only trips where `owner_id = user.id`
- [x] Main account timeline shows only their own trips
- [x] Main account audit log shows only entries for their own trips
- [x] Assistant dashboard shows only trips for the currently selected main account
- [x] Assistant timeline and audit log are similarly scoped

**Account switcher (assistants only)**
- [x] Nav shows an account switcher dropdown listing all linked main accounts by display name
- [x] Selecting a main account sets the `active_main_account` cookie and reloads the page
- [x] On first assistant login with no cookie, falls back to first linked main account
- [x] Main accounts do not see the switcher

**Settings page (`/settings` — main accounts only)**
- [x] Accessible via "Settings" nav link (hidden for assistants)
- [x] Lists all currently linked assistants (display name + date added)
- [x] "Add assistant" form: enter email address → validates the email exists AND the account has role `'assistant'` → creates an `account_links` row
- [x] Error shown if email not found, email belongs to a `'main'` account, or already linked
- [x] Each assistant row has a "Remove" button → deletes the `account_links` row
- [x] `/settings` redirects assistants to `/` (enforced in the page server component)

**Audit log attribution**
- [x] When an assistant acts, `audit_log.performed_by` = the assistant's `user_id`; `on_behalf_of` = the active main account's `user_id`
- [x] Audit log UI shows "by [assistant display name] on behalf of [main display name]" when `on_behalf_of` is present
- [x] Audit log UI shows "by [display name]" as before when `on_behalf_of` is null
- [x] Audit log scoped to `performed_by = activeMainAccountId OR on_behalf_of = activeMainAccountId`

**Trip save scoping**
- [x] When any user saves a trip (search flow or manual), `owner_id` is set to `activeMainAccountId`
- [x] For main accounts `activeMainAccountId === user.id` always

### Technical Tasks
- Create `src/lib/activeAccount.ts` — server helper: reads `active_main_account` cookie; for main accounts returns `user.id`; for assistants returns cookie value (validated against `account_links`)
- Update `src/app/page.tsx` — scope trips query with `.eq('owner_id', activeMainAccountId)`
- Update `src/app/timeline/page.tsx` — same scope
- Update `src/app/audit/page.tsx` + `src/app/api/audit/route.ts` — scope to trips owned by `activeMainAccountId`
- Update `src/app/api/trips/route.ts` — set `owner_id = activeMainAccountId` on insert
- Update `src/app/api/trips/[id]/route.ts` — set `on_behalf_of` in audit log when `user.role === 'assistant'`
- Update `src/lib/auditLogger.ts` — accept optional `onBehalfOf` param; write to `audit_log.on_behalf_of`
- Update `src/components/Nav.tsx` — account switcher for assistants; Settings link for main accounts
- Create `src/app/settings/page.tsx` — manage linked assistants
- Create `src/app/api/account-links/route.ts` — GET (list assistants), POST (add by email), DELETE (remove)
- Update `src/proxy.ts` — block `/settings` for assistants; set `active_main_account` cookie on first assistant login
- Update `src/components/audit/AuditTable.tsx` — render `on_behalf_of` attribution

### Files Created / Modified
```
src/lib/activeAccount.ts                        (new)
src/app/settings/page.tsx                       (new)
src/app/api/account-links/route.ts              (new)
src/app/page.tsx                                (modified — scoped query)
src/app/timeline/page.tsx                       (modified — scoped query)
src/app/audit/page.tsx                          (modified — scoped query)
src/app/api/audit/route.ts                      (modified — scoped query)
src/app/api/trips/route.ts                      (modified — owner_id on insert)
src/app/api/trips/[id]/route.ts                 (modified — on_behalf_of in audit)
src/lib/auditLogger.ts                          (modified — on_behalf_of param)
src/components/Nav.tsx                          (modified — switcher + settings link)
src/components/audit/AuditTable.tsx             (modified — attribution display)
src/proxy.ts                                    (modified — settings guard + cookie init)
```

### Dependencies
- Story 13 — schema and role rename must be complete first

---

## Story 15 — Annual Days Abroad Counter ✅

**As a** main account user,
**I want** to set a reference date and see the total days I've spent outside the UK in the 12 months leading up to that date,
**so that** I can monitor my compliance with the 90-day rule at a glance.

### Acceptance Criteria
- [x] A "90-day calculation" card appears on `/settings` below the "Linked assistants" card (main accounts only)
- [x] The card shows a date input pre-filled with the current reference date (if set) and a Save button
- [x] Save is disabled until the date changes; on success a toast confirms; on failure a toast errors
- [x] Any date is accepted — no past/future restriction
- [x] The Timeline page stat card previously labelled "Days abroad" is replaced with "Annual days abroad till [date]"
- [x] The count reflects all days outside the UK in the 12-month window ending on the reference date, with trips clipped to the window boundaries (first and last day of clipped segment excluded)
- [x] If no reference date is set, the stat card shows `—` and a prompt: "Set a reference date in Settings" (linked)
- [x] Assistants see the stat card read-only when viewing a main account's timeline (Settings page remains main-only)
- [x] The Timeline chart window (±6 months from today) is unchanged

### Boundary rule (corrected)
Compute the actual days-abroad range first (`departure + 1 day` → `return − 1 day`), then intersect with the window. Window boundaries are plain calendar dates and are counted if the user was already abroad.
Example: trip 8 Jul → 17 Jul, window starts 12 Jul → days abroad = 9–16 Jul, intersect = 12–16 Jul = **5 days**.

### Bug fix (post-implementation)
`daysOutsideUKInWindow` was clipping the trip to the window boundary first then applying the -1 rule, incorrectly treating the window start/end as if they were departure/return days. Fixed by computing the days-abroad range before intersecting. Also patched a stored `days_outside_uk = 7` (should be 6) on the LHR→BUD trip caused by an off-by-one at save time.

### Technical Tasks
- Add `reference_date date` nullable column to `user_roles` via migration `004_reference_date.sql`
- Add `daysOutsideUKInWindow(outbound, return, windowStart, windowEnd)` to `src/lib/daysCalculator.ts` with unit tests
- Create `src/app/api/settings/reference-date/route.ts` — PATCH, main role only
- Create `src/components/settings/ReferenceDateSettings.tsx` — date input + save button client component
- Update `src/app/settings/page.tsx` — fetch `reference_date`, render new card
- Update `src/app/timeline/page.tsx` — fetch `reference_date` for active main account; query trips overlapping reference window; compute windowed sum; pass props to `TripTimeline`
- Update `src/components/timeline/TripTimeline.tsx` — accept `referenceDate` + `annualDaysAbroad` props; replace stat card

### Files Created / Modified
```
supabase/migrations/004_reference_date.sql              (new)
src/lib/daysCalculator.ts                               (modified — new export)
src/lib/daysCalculator.test.ts                          (modified — new tests)
src/app/api/settings/reference-date/route.ts            (new)
src/components/settings/ReferenceDateSettings.tsx       (new)
src/app/settings/page.tsx                               (modified)
src/app/timeline/page.tsx                               (modified)
src/components/timeline/TripTimeline.tsx                (modified)
```

### Dependencies
- Story 14 (Multi-Account UI) — `user_roles` and the settings page pattern must exist

---

## Story 16 — Multi-city Flight Search ✅

**As a** user,
**I want** to search for multi-city trips with up to 3 legs,
**so that** I can record and plan trips that visit multiple destinations (e.g. LHR → DUS → CDG → LHR) as a single trip.

### Acceptance Criteria
- [x] A trip-type tab switcher ("Round trip" | "Multi-city") appears at the top of the search form
- [x] Switching trip type resets legs, results, and selection state
- [x] Round-trip mode retains the existing 2-column layout using legs[0] (outbound) and legs[1] (return)
- [x] Multi-city mode renders a vertical stack of leg rows, each with: origin, destination, departure date, time slot toggle
- [x] Each leg row (from leg 2 onward) has an × button to remove it (removing leg 2 collapses legs 2 and 3)
- [x] "Add leg" button adds another leg (max 3); next leg's origin auto-fills from previous leg's destination
- [x] 3rd leg's destination auto-fills from leg 0's origin (fly home)
- [x] Multi-city search fires parallel SerpAPI calls per leg and returns `{ tripType: 'multi_city', legs: FlightOffer[][] }`
- [x] Results panel shows a vertical stack of per-leg flight columns (one FlightColumn per leg)
- [x] "Review Trip" enabled when all legs have a selected flight
- [x] Trip summary shows full city chain route and one FlightRow per selected leg
- [x] `days_outside_uk` = first leg departure → last leg departure (same `daysOutsideUK` helper)
- [x] Saved trip writes one `trip_legs` row per leg; `trip_type` column on `trips` is `multi_city`
- [x] Dashboard route display shows full chain: `LHR → DUS → CDG → LHR`
- [x] Timeline bar: left edge = first leg departure, right edge = last leg departure; tooltip shows full route chain

### Technical Tasks
- Write `supabase/migrations/005_multi_city.sql` — create `trip_legs` table, backfill existing round trips, drop flat columns from `trips`, add RLS
- Update `src/types/database.ts` — `Trip` gains `trip_type`; new `TripLeg` + `TripLegInsert` types; `TripWithUsers` gains `legs: TripLeg[]`
- Update `src/types/flights.ts` — add `LegFormState`, `LegSearchRequest`; discriminated union `FlightSearchRequest = RoundTripSearchRequest | MultiCitySearchRequest`
- Rewrite `src/hooks/useFlightSearch.ts` — legs-based state, `tripType`, `updateLeg`, `addLeg`, `removeLeg`, `selectedFlights[]`
- Update `src/app/api/flights/search/route.ts` — branch on `tripType`; multi-city fires parallel SerpAPI calls per leg
- Update `src/app/api/trips/route.ts` — accept `legs` array; insert trip then `trip_legs`; GET joins `trip_legs(*)`
- Update `src/app/api/trips/[id]/route.ts` — DELETE fetches `trip_legs(*)` before cascade-delete for audit snapshot
- Update `src/app/page.tsx` — join `trip_legs(*)`, sort/filter by `legs[0].departure_at`
- Update `src/app/timeline/page.tsx` — fetch `trip_legs`, filter in code, annual calc uses first/last leg departure
- Update `src/components/dashboard/TripCard.tsx` — route string from legs array, dynamic Out/Return/Leg N labels
- Update `src/components/dashboard/AddPastTripModal.tsx` — send `{ trip_type: 'round_trip', legs: [...] }` payload
- Rewrite `src/components/search/SearchForm.tsx` — tab switcher, `RoundTripForm`/`MultiCityForm` with `LegRow`
- Rewrite `src/components/search/FlightResultsPanel.tsx` — discriminate on `results.tripType`; multi_city stack
- Rewrite `src/components/search/TripSummary.tsx` — full route chain, stacked FlightRow per leg
- Rewrite `src/app/search/page.tsx` — wire new hook API; adaptive skeleton
- Update `src/components/audit/AuditEntry.tsx` — derive destination/date from `snapshot.legs[0]`
- Update `src/components/timeline/TripTimeline.tsx` — helpers using legs; bar uses first/last dep
- Update `src/components/timeline/Tooltip.tsx` — `TripSlice` redefined with `legs` array
- Update `src/lib/auditLogger.ts` — `tripSnapshot` type updated to `Trip & { legs: TripLeg[] }`

### Files Created / Modified
```
supabase/migrations/005_multi_city.sql                 (new)
src/types/database.ts                                  (modified)
src/types/flights.ts                                   (modified)
src/hooks/useFlightSearch.ts                           (rewritten)
src/app/api/flights/search/route.ts                    (modified)
src/app/api/trips/route.ts                             (modified)
src/app/api/trips/[id]/route.ts                        (modified)
src/app/page.tsx                                       (modified)
src/app/timeline/page.tsx                              (modified)
src/components/dashboard/TripCard.tsx                  (modified)
src/components/dashboard/AddPastTripModal.tsx          (modified)
src/components/search/SearchForm.tsx                   (rewritten)
src/components/search/FlightResultsPanel.tsx           (rewritten)
src/components/search/TripSummary.tsx                  (rewritten)
src/app/search/page.tsx                                (rewritten)
src/components/audit/AuditEntry.tsx                    (modified)
src/components/timeline/TripTimeline.tsx               (modified)
src/components/timeline/Tooltip.tsx                    (modified)
src/lib/auditLogger.ts                                 (modified)
```

### Dependencies
- Story 15 (Annual Days Abroad) — all prior schema and UI must exist
- Migration `005_multi_city.sql` must be applied via `supabase db push` before the app works end-to-end

---

## Story 17 — Sojourn Landing Page ✅

**As a** visitor who is not yet logged in,
**I want** to see a marketing landing page at `/` explaining what the app does,
**so that** I can understand the product before signing in.

### Acceptance Criteria
- [x] Unauthenticated visitors who navigate to `/` see a landing page instead of being redirected to `/login`
- [x] The app is branded as **Sojourn** throughout — page title, nav, and all copy
- [x] A sticky top nav shows the Sojourn logo/name on the left and a "Sign in →" button on the right
- [x] A dark hero section contains a full-width plane-takeoff photo, the headline "Your trusted travel tracker", a subtitle, a primary CTA button ("Sign in to Sojourn"), and a 3-stat strip (183 days abroad / 5 countries visited / 3 legs per trip)
- [x] Four alternating light/dark feature sections (each with a mockup + copy):
  1. Days counter — progress bar mockup showing days abroad
  2. Flight search — search form + results mockup
  3. Timeline — Gantt bar chart mockup with flag emoji and today marker
  4. Multi-city trips — 3-leg stacked card mockup
- [x] A dark CTA section at the bottom: headline + "Sign in" button
- [x] A minimal footer
- [x] Authenticated users visiting `/` continue to see the dashboard (unchanged behaviour)
- [x] `/` is added to the public route allowlist in `src/proxy.ts` so middleware does not redirect unauthenticated visitors

### Technical Tasks
- Add `pathname === '/'` to `isPublicRoute` in `src/proxy.ts`
- Create `src/components/landing/LandingPage.tsx` — full landing page component (dark hero, 4 feature sections, CTA, footer)
- Update `src/app/page.tsx` — add `if (!user) return <LandingPage />`; update metadata `title` to `'Sojourn — Your trusted travel tracker'`

### Files Created / Modified
```
src/proxy.ts                               (modified — public route allowlist)
src/components/landing/LandingPage.tsx     (new)
src/app/page.tsx                           (modified — landing branch + metadata)
```

### Dependencies
- Story 2 (Auth) — `getAuthUser()` must exist to branch on authentication state
- Story 16 (Multi-city) — landing page references multi-city as a feature

---

---

## Story 18 — Sojourn Visual Rebrand 🔄 IN PROGRESS

**As a** user,
**I want** every page and component to use the Sojourn design system,
**so that** the app looks polished, branded, and consistent end-to-end.

### Design reference
`docs/sojourn-design/` — full prototype including `styles.css`, `dashboard.jsx`, `landing.jsx`, `search.jsx`, `settings.jsx`, `timeline.jsx`, `audit-login.jsx`.

### Implementation plan
11 steps, each verified on dev before committing.

| Step | Scope | Status |
|------|-------|--------|
| 1 | Tokens + Fonts (`globals.css`, `layout.tsx`) | ✅ done |
| 2 | Nav (navy bar, yellow brand tile, pill tabs) | ✅ done |
| 3 | Landing page (full dark navy rewrite) | ✅ done |
| 4 | Login + auth pages (two-column, passport stamps) | ✅ done |
| 5 | Dashboard hero + StatRow + YearStrip + DashboardClient | ✅ done |
| 6 | TripCard gradient covers, PastTrips dense list, AddPastTripModal lavender header, EmptyState | 🔄 built — needs dev verification |
| 7 | Search page — navy hero, yellow-bordered bar, FlightCard selected state, TripSummary navy header | ⏳ |
| 8 | Timeline — 4-up stats, gradient bars, coral TODAY line, tooltip | ⏳ |
| 9 | Settings — 2×2 card grid, reference date navy readout, coral danger zone | ⏳ |
| 10 | Audit — token restyle, action pills (mint/sky/coral) | ⏳ |
| 11 | Polish — hover consistency, focus-visible, responsive, not-found/error, final build | ⏳ |

### Acceptance Criteria
- [ ] All pages use Sojourn tokens (no hardcoded grays or blue-600 remnants)
- [ ] Three-font system applied: Bricolage Grotesque (display), Plus Jakarta Sans (body), JetBrains Mono (mono)
- [ ] Nav: navy bar with yellow rotated brand tile, pill tab group, role-appropriate right section
- [ ] Dashboard: navy hero card + glass days counter + 4 stat tiles + year strip + gradient trip cards + dense past list
- [ ] Search: navy hero, yellow-bordered round-trip bar, "✓ Selected" overhanging pill on FlightCard, navy gradient TripSummary header
- [ ] Timeline: gradient trip bars + coral TODAY line + working tooltip + 4 stat tiles
- [ ] Settings: 2×2 card grid, coral danger zone
- [ ] Audit: color-coded action pills (mint created / sky updated / coral deleted)
- [ ] `npm run build` passes with 0 type errors
- [ ] `npm test` passes (all tests green)
- [ ] `npm run lint` passes

### Technical notes
- Tailwind v4: no `tailwind.config.ts` — all tokens in `globals.css :root`, exposed via `@theme inline {}`
- `DashboardClient.tsx` (`'use client'`) owns `showModal` state; passed down to both `DashboardHero` (CTA) and `PastTrips` (modal)
- `getAirportInfo()` from `src/lib/airportCountry.ts` — usable in client components (local lookup)
- 8-gradient COVERS palette keyed by `id.charCodeAt(0) % 8` — shared by TripCard, PastTrips, YearStrip

### Files Created / Modified
```
src/app/globals.css                              (modified — full token set)
src/app/layout.tsx                               (modified — three fonts)
src/components/Nav.tsx                           (modified — Sojourn nav)
src/components/landing/LandingPage.tsx           (rewritten — dark navy)
src/app/login/page.tsx                           (modified — two-column)
src/app/forgot-password/page.tsx                 (modified — white card)
src/app/reset-password/page.tsx                  (modified — white card)
src/app/page.tsx                                 (modified — DashboardClient)
src/components/dashboard/DashboardClient.tsx     (new — modal state wrapper)
src/components/dashboard/DashboardHero.tsx       (new — navy gradient hero)
src/components/dashboard/StatRow.tsx             (new — 4-tile stat grid)
src/components/dashboard/YearStrip.tsx           (new — 12-month trip bar)
src/components/dashboard/TripCard.tsx            (modified — gradient cover)
src/components/dashboard/UpcomingTrips.tsx       (modified — clean grid)
src/components/dashboard/PastTrips.tsx           (modified — dense list)
src/components/dashboard/AddPastTripModal.tsx    (modified — lavender header)
src/components/dashboard/EmptyState.tsx          (modified — dashed border)
src/app/search/page.tsx                          (pending)
src/components/search/SearchForm.tsx             (pending)
src/components/search/FlightResultsPanel.tsx     (pending)
src/components/search/FlightCard.tsx             (pending)
src/components/search/TripSummary.tsx            (pending)
src/app/timeline/page.tsx                        (pending)
src/components/timeline/TripTimeline.tsx         (pending)
src/components/timeline/Tooltip.tsx              (pending)
src/app/settings/page.tsx                        (pending)
src/app/audit/page.tsx                           (pending)
```

### Dependencies
- Story 17 (Landing Page) — base app must exist before visual rebrand

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
            │       │                       │       ├── Story 7.5 (Manual Past Trip Entry)
            │       │                       │       └── Story 12 (Timeline View)
            │       │                       └── Story 8 (Audit Log)
            │       │                               └── Story 9 (Polish)
            │       │                                       └── Story 10 (Deploy)
            └── Story 11 (Password Reset) ← depends on Story 2 only

Story 13 (Role Rename & Schema) ← depends on Story 1
    └── Story 14 (Multi-Account UI) ← depends on Story 13
            └── Story 15 (Annual Days Abroad Counter) ← depends on Story 14
                    └── Story 16 (Multi-city Flight Search) ← depends on Story 15
                            └── Story 17 (Sojourn Landing Page) ← depends on Story 16
```

---

## Total Estimated Stories: 18
