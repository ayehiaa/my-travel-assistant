# Product Requirements Document — My Travel Assistant

**Version**: 1.9  
**Date**: 2026-05-08  
**Owner**: Ziad Elsayed  

---

## 1. Overview

**Sojourn** is a multi-account web application that allows authorised users to search for flights, build round-trip or multi-city itineraries, and maintain a persistent log of upcoming and past trips. Each **main account** has a fully isolated trip history — they see only their own trips. **Assistant accounts** can be linked to one or more main accounts and manage trips on their behalf. British Airways is the preferred airline and always shown first in results, but all airlines are searchable. A key feature is the automatic calculation of days spent outside the UK per trip, excluding both the departure and return days. All actions are attributed to the user who performed them for full auditability. Unauthenticated visitors see a public marketing landing page at `/` before signing in.

---

## 2. Goals

- Quickly find the best flights for a given round trip, with British Airways prioritised
- Maintain a fully isolated trip history per main account, accessible from any device
- Allow assistant accounts to manage trips on behalf of one or more main accounts
- Track days spent outside the UK per trip (for personal residency/tax awareness)
- Track total days outside the UK within a user-defined annual window for 90-day rule compliance
- Know who created or modified any trip at any point in time, including assistant attribution

---

## 3. Non-Goals

- Booking or payment processing
- Group/multi-passenger trips
- Mobile app (web only)
- Self-service user registration (accounts are created by the owner only)

---

## 4. Users & Roles

The app supports a small, closed set of named users. There is no public registration — accounts are created manually via Supabase Auth dashboard or a seeding script.

| Role | Description |
|---|---|
| **Main** | Sees only their own trips. Full CRUD on their own trips. Can manage which assistant accounts are linked to them via the `/settings` page. |
| **Assistant** | Linked to one or more main accounts. Can search, save, edit, and delete trips on behalf of any linked main account. Uses an account switcher in the nav to choose which main account's context they're operating in. |

**Linking rules:**
- A main account can have multiple linked assistants
- An assistant can be linked to multiple main accounts
- Main accounts add assistants by entering an existing assistant's email on the `/settings` page
- Assistant accounts must already exist in the system before they can be linked

Each user has their own **email + password** credentials managed via Supabase Auth.

---

## 5. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router, TypeScript) |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth — email/password + Google OAuth (owner only) |
| Flight Data | Amadeus for Developers REST API |
| Deployment | Vercel |

---

## 6. Authentication & Authorisation

- All pages are protected — unauthenticated users are redirected to `/login`
- Login page supports **email + password** for all users
- Sessions managed via Supabase Auth helpers for Next.js
- User roles stored in a `user_roles` table in Supabase, keyed by `user_id`
- Row-level security (RLS) policies enforce data isolation at the database level — main accounts can only access their own trips; assistants can only access trips belonging to their linked main accounts
- The active main account context for assistants is stored in an `active_main_account` cookie, set on first login and updated via the account switcher
- Middleware guards `/settings` — assistants are redirected to `/` if they attempt to access it
- Both Main and Assistant accounts can reset their password via a secure email link
  - `/forgot-password` — user enters their email; Supabase sends a time-limited reset link
  - `/reset-password` — user sets a new password after clicking the link; minimum 8 characters
  - Both routes are public (no session required)
  - Password reset events are not written to the app audit log (covered by Supabase's own auth logs)

---

## 7. Core Features

### 7.1 Flight Search Form

A **trip-type tab switcher** at the top of the form selects between:
- **Round trip** — single outbound and return leg (existing behaviour)
- **Multi-city** — 1 to 3 legs, each with independent origin, destination, date, and time slot

**Round-trip fields (per leg):**

| Field | Type | Notes |
|---|---|---|
| Departure city / airport | Text / autocomplete | IATA code lookup |
| Destination city / airport | Text / autocomplete | IATA code lookup |
| Departure date | Date picker | Outbound flight date |
| Return date | Date picker | Return flight date |
| Outbound time preference | Toggle | Morning or Evening |
| Return time preference | Toggle | Morning or Evening |

**Multi-city:** A vertical stack of leg rows. Each leg has: origin autocomplete, destination autocomplete, date picker, time slot toggle, and (from leg 2 onward) an × removal button. An "Add leg" button appears when fewer than 3 legs exist. Leg N's origin auto-fills from leg N−1's destination; the 3rd leg's destination auto-fills from leg 0's origin.

**Time slot definitions:**
- Morning: 06:00 – 13:00 (local departure time)
- Evening: 13:00 – 23:59 (local departure time)

On submit, the form fires one SerpAPI search per leg in parallel.

---

### 7.2 Flight Results

Each search returns the **top 3 results** per direction. Results are ranked by the following priority:

1. **British Airways flights first** — BA results always appear at the top regardless of other ranking criteria
2. **Fewest stops** — direct flights before flights with layovers
3. **Fastest total duration** — tiebreaker within the same stop count

Results are filtered to only show flights departing within the selected time slot.

**Each flight card displays:**
- Airline name and logo
- Flight number (e.g. BA107, EK001)
- Departure time → Arrival time
- Total flight duration
- Number of stops (e.g. "Direct" or "1 stop")
- Price (per person, one-way)
- A **"BA" badge** on British Airways flights for visual prominence

The outbound and return results are shown side-by-side (or stacked on smaller screens). The user selects one outbound flight and one return flight before proceeding.

---

### 7.3 Trip Summary & Save

After selecting both flights, a trip summary panel is shown:

**Trip Summary contains:**
- Outbound flight: airline, flight number, departure date & time, arrival date & time
- Return flight: airline, flight number, departure date & time, arrival date & time
- Departure city → Destination city
- **Days outside UK** (see calculation below)

A "Save Trip" button persists the trip to Supabase. The `created_by` field is set to the authenticated user; `owner_id` is set to the active main account (for assistants, this is the currently selected main account from the switcher).

---

### 7.4 Days Outside UK Calculation

```
days_outside_uk = return_date - departure_date - 1
```

- The departure day is **not counted** (user is in UK for part of the day)
- The return day is **not counted** (user returns to UK)
- Only full days spent abroad count

**Example**: Depart May 5, Return May 10 → **4 days** outside UK (May 6, 7, 8, 9)

---

### 7.5 Trip Dashboard

The main dashboard is split into two sections:

**Upcoming Trips**
- Trips where the departure date is today or in the future
- Sorted by departure date ascending

**Past Trips**
- Trips where the departure date is in the past
- Sorted by departure date descending (most recent first)

Each trip card in the dashboard shows:
- Airline name + flight number for outbound and return
- Destination city
- Departure date → Return date
- Outbound flight number and time
- Return flight number and time
- Days outside UK
- Created by (name of the user who saved the trip)
- Last modified by (name of the user who last edited the trip, if different)

Trips can be deleted from the dashboard by the **main account** and any of their **linked assistants**.

---

### 7.6 Manual Past Trip Entry

Users can log a past trip directly from the dashboard without going through the flight search flow. This is useful for trips that were booked outside the app or taken before the app existed.

A **"+ Add past trip"** button in the Past Trips section opens a modal with the following fields:

| Field | Type | Notes |
|---|---|---|
| Origin airport | Autocomplete | IATA code lookup (same component as search form) |
| Destination airport | Autocomplete | IATA code lookup |
| Departure date | Date picker | Must be in the past (before today) |
| Return date | Date picker | Must be after departure date and no later than today |

**Behaviour:**
- Flight details (airline, flight number, times) are not required — the card displays "Manually added" in place of flight info
- Days outside UK is calculated automatically from the two dates
- The trip is saved via `POST /api/trips` with `source: "manual"` and audited the same as search-derived trips
- The `trips` table schema was updated (migration `002_add_manual_trips.sql`) to make flight detail columns nullable and add a `source` column (`search` | `manual`, default `search`)

---

### 7.8 Annual Days Abroad Counter

Main accounts can set a **reference date** in Settings. The app then counts all days spent outside the UK in the 12-month window ending on that date and displays the total on the Timeline page.

**Reference window**: `[referenceDate − 1 year, referenceDate]` (inclusive).

**Boundary trip handling**: The actual days-abroad range is computed first (`departure + 1` → `return − 1`), then intersected with the window. Window boundary dates are plain calendar dates — if the user was already abroad on `windowStart`, that day is counted. Example: trip 8 Jul → 17 Jul with window starting 12 Jul → days abroad = 9–16 Jul, intersect with window = 12–16 Jul → **5 days**.

**Settings page**: A "90-day calculation" card below the Linked Assistants card shows a date input and Save button. Main accounts only. Stored as `reference_date date` (nullable) on `user_roles`.

**Timeline stat card**: Replaces the raw "Days abroad" card with "Annual days abroad till [date]". If no reference date is set, shows a prompt linking to Settings. Assistants see this card read-only when viewing a main account's timeline.

**Query scope**: All trips overlapping the reference window are fetched for the count — this is independent of the ±6-month chart window.

---

### 7.9 Multi-city Trips

Users can search for itineraries with up to **3 legs** using the multi-city trip type. Each leg is an independent one-way flight search. The results panel shows a vertical stack of per-leg flight columns; the user selects one flight per leg before proceeding to the trip summary.

The trip summary displays the full city chain (e.g. `London → Düsseldorf → Paris → London`) and one flight card per leg. Days outside UK is calculated from the first leg's departure to the last leg's departure.

**Database:** Each leg is stored as a row in the `trip_legs` table (see §8). The `trips.trip_type` column distinguishes `round_trip` from `multi_city`. All existing round trips were backfilled into `trip_legs` as part of migration `005_multi_city.sql`, and the flat departure/return columns were dropped from `trips`.

**Dashboard:** Trip cards show the full route chain derived from all legs. Outbound / Return labels are used for round trips; Leg 1 / Leg 2 / Leg 3 for multi-city.

**Timeline:** The bar's left edge is the first leg's departure; the right edge is the last leg's departure. The tooltip shows the full route chain.

---

### 7.7 Audit Log

Every create, update, and delete action on a trip is recorded in an `audit_log` table.

The audit log is viewable by both Main and Assistant accounts via a dedicated `/audit` page, scoped to the active main account's trips only.

**Each audit log entry shows:**
- Timestamp
- User who performed the action — displayed as "by [name]" or "by [assistant] on behalf of [main]" when an assistant acted
- Action type (created / updated / deleted)
- Trip affected (destination, departure date)
- Fields changed (for updates — before and after values)

The audit log is append-only. No entries can be deleted.

---

## 8. Data Model

### `user_roles` table

| Column | Type | Notes |
|---|---|---|
| user_id | uuid | Foreign key → auth.users, primary key |
| role | varchar | `main` or `assistant` |
| display_name | varchar | Human-readable name shown in UI and audit log |
| reference_date | date | Nullable — end date of the annual 90-day calculation window (main accounts only) |
| created_at | timestamptz | Auto |

### `account_links` table

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| main_user_id | uuid | Foreign key → auth.users — the main account |
| assistant_user_id | uuid | Foreign key → auth.users — the linked assistant |
| created_by | uuid | Foreign key → auth.users — who created the link |
| created_at | timestamptz | Auto |
| — | unique | `(main_user_id, assistant_user_id)` pair must be unique |

### `trips` table

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| owner_id | uuid | Foreign key → auth.users — the main account this trip belongs to |
| trip_type | varchar(20) | `round_trip` or `multi_city` |
| source | varchar(10) | `search` or `manual`, default `search` |
| days_outside_uk | integer | Pre-calculated |
| created_by | uuid | Foreign key → auth.users — who saved the trip |
| last_modified_by | uuid | Foreign key → auth.users |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto-updated on change |

Flat departure/return columns were removed in migration `005_multi_city.sql`. All flight leg data is stored in `trip_legs`.

### `trip_legs` table

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| trip_id | uuid | Foreign key → trips |
| leg_order | integer | 0-based position within the trip |
| from_airport | varchar(3) | IATA code |
| to_airport | varchar(3) | IATA code |
| departure_at | timestamptz | Departure datetime |
| arrival_at | timestamptz | Nullable — null for manual trips |
| airline | varchar(100) | Nullable — null for manual trips |
| flight_number | varchar(10) | Nullable — null for manual trips |
| created_at | timestamptz | Auto |

Legs are ordered by `leg_order`. Round trips have 2 legs (outbound + return); multi-city trips have 2–3 legs.

### `audit_log` table

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| performed_by | uuid | Foreign key → auth.users — the user who performed the action (main or assistant) |
| on_behalf_of | uuid | Foreign key → auth.users — the main account being acted upon; null when a main account acts directly (nullable) |
| action | varchar | `created`, `updated`, `deleted` |
| trip_id | uuid | Foreign key → trips (nullable if deleted) |
| trip_snapshot | jsonb | Full trip state at time of action |
| changed_fields | jsonb | `{ field: { before, after } }` for updates |
| created_at | timestamptz | Auto |

Row-level security (RLS) is enabled on all tables. The `audit_log` is readable by authenticated users (scoped to the active main account's trips) but writable only by the service role (server-side only).

---

## 9. API Routes

| Route | Method | Description |
|---|---|---|
| `/api/flights/search` | POST | Calls SerpAPI; for round trips returns `{ tripType, outbound, return }`; for multi-city fires parallel calls per leg and returns `{ tripType, legs: FlightOffer[][] }` |
| `/api/trips` | GET | Fetch trips with `trip_legs(*)` joined, scoped to active main account |
| `/api/trips` | POST | Save a new trip; body includes `{ trip_type, legs: [...] }`; inserts trip row then `trip_legs` rows; rolls back if leg insert fails |
| `/api/trips/[id]` | DELETE | Delete a trip — main account or linked assistant |
| `/api/audit` | GET | Fetch audit log entries scoped to active main account's trips |
| `/api/account-links` | GET | List assistants linked to the current main account |
| `/api/account-links` | POST | Link an assistant by email to the current main account |
| `/api/account-links?id=<id>` | DELETE | Remove an assistant link |
| `/api/settings/reference-date` | PATCH | Update reference date for the current main account |

All write operations trigger an audit log entry server-side using the Supabase service role key.

---

## 10. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SERPAPI_KEY=
```

---

## 11. Pages & Routing

| Route | Access | Description |
|---|---|---|
| `/` | Public (unauthenticated) / Both (authenticated) | Landing page (Sojourn marketing page) for unauthenticated visitors; Dashboard for authenticated users |
| `/search` | Both | Flight search form + results (round trip or multi-city) |
| `/timeline` | Both | Gantt-style trip timeline — 6 months back to 6 months ahead |
| `/audit` | Both | Audit log — scoped to active main account's trips |
| `/settings` | Main only | Manage linked assistant accounts |
| `/login` | Public | Email/password login |
| `/forgot-password` | Public | Request a password reset email |
| `/reset-password` | Public | Set a new password after clicking the reset link |

---

## 12. UI/UX Notes

- Clean, minimal design — this is a personal utility tool
- Mobile-responsive layout (Tailwind responsive classes)
- Flight cards have a clear selected/unselected state
- British Airways flights display a prominent **BA badge** and always appear first in the list
- The days outside UK count is visually prominent in the trip summary and dashboard cards
- Trip cards show "Added by [name]" and "Last edited by [name]" attribution
- Assistant accounts see an account switcher dropdown in the nav to switch between linked main accounts
- The Settings nav link is visible to main accounts only
- Loading states shown during API calls (skeleton or spinner)
- Error states shown if no flights are found for the selected criteria

---

## 13. Build Order

1. **Project setup** — Supabase project, schema + RLS + audit log, environment variables
2. **Auth** — login page (email/password + Google OAuth), middleware, role enforcement
3. **Flight search** — SerpAPI integration, `/api/flights/search` route with BA prioritisation, search form UI
4. **Results UI** — flight cards with airline branding, BA badge, selection state, top 3 per direction
5. **Trip summary + save** — summary panel, days calculation, save to Supabase with attribution
6. **Dashboard** — upcoming/past trips sections, trip cards with attribution, delete (owner only)
7. **Manual past trip entry** — "Add past trip" modal on dashboard, `source` column + nullable flight fields migration
8. **Audit log** — server-side logging on all write operations, `/audit` page
9. **Polish** — loading states, error handling, responsive layout
10. **Deployment** — Vercel + environment variables
11. **Password reset** — forgot-password + reset-password pages via Supabase email link
12. **Trip timeline** — `/timeline` Gantt view, 6 months back to 6 months ahead, flag emoji, today marker
13. **Role rename & schema** — rename `owner` → `main`, add `owner_id` to trips, `account_links` table, `on_behalf_of` to audit log, rewrite RLS
14. **Multi-account UI** — account switcher, `/settings` page, scoped queries, assistant attribution in audit log
15. **Annual days abroad counter** — reference date setting, windowed calculation with boundary clipping, timeline stat card
16. **Multi-city flight search** — trip-type tab switcher, per-leg search, `trip_legs` schema, unified dashboard/timeline display
17. **Sojourn landing page** — public marketing page at `/` for unauthenticated visitors; app rebranded as Sojourn

---

## 14. Out of Scope (Future Considerations)

- Email/calendar reminders for upcoming trips
- ~~Cumulative days outside UK across all trips (yearly total)~~ — implemented in Story 15
- ~~Open-jaw or multi-city itineraries~~ — implemented in Story 16
- Group/multi-passenger trips
- Fare class / cabin selection
- Export to CSV/PDF
- Additional user roles beyond Main and Assistant
- Airline preference filtering (beyond BA priority)
