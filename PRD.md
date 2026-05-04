# Product Requirements Document — My Travel Assistant

**Version**: 1.4  
**Date**: 2026-05-04  
**Owner**: Ziad Elsayed  

---

## 1. Overview

My Travel Assistant is a personal web application that allows authorised users to search for flights, select outbound and return flights for a round trip, and maintain a persistent log of upcoming and past trips. British Airways is the preferred airline and always shown first in results, but all airlines are searchable. A key feature is the automatic calculation of days spent outside the UK per trip, excluding both the departure and return days. All actions are attributed to the user who performed them for full auditability.

---

## 2. Goals

- Quickly find the best flights for a given round trip, with British Airways prioritised
- Maintain a shared trip history accessible from any device by authorised users
- Track days spent outside the UK per trip (for personal residency/tax awareness)
- Know who created or modified any trip at any point in time

---

## 3. Non-Goals

- Booking or payment processing
- Group/multi-passenger trips
- Open-jaw or multi-city itineraries
- Mobile app (web only)
- Self-service user registration (accounts are created by the owner only)

---

## 4. Users & Roles

The app supports a small, closed set of named users. There is no public registration — accounts are created manually by the owner via Supabase Auth dashboard or a seeding script.

| Role | Description |
|---|---|
| **Owner** | Full access. Can search, save, edit, and delete any trip. Can view the full audit log. |
| **Assistant** | Can search flights, save new trips, and view all trips. Cannot delete trips. Can view the audit log. |

Each user has their own **email + password** credentials managed via Supabase Auth. The owner additionally has Google OAuth as a login option.

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
- Owner can also log in via **Google OAuth**
- Sessions managed via Supabase Auth helpers for Next.js
- User roles stored in a `user_roles` table in Supabase, keyed by `user_id`
- Row-level security (RLS) policies enforce role permissions at the database level
- Middleware checks role on every protected route and blocks unauthorised actions
- Both Owner and Assistant can reset their password via a secure email link
  - `/forgot-password` — user enters their email; Supabase sends a time-limited reset link
  - `/reset-password` — user sets a new password after clicking the link; minimum 8 characters
  - Both routes are public (no session required)
  - Password reset events are not written to the app audit log (covered by Supabase's own auth logs)

---

## 7. Core Features

### 7.1 Flight Search Form

The search form collects the following inputs:

| Field | Type | Notes |
|---|---|---|
| Departure city / airport | Text / autocomplete | IATA code lookup |
| Destination city / airport | Text / autocomplete | IATA code lookup |
| Departure date | Date picker | Outbound flight date |
| Return date | Date picker | Return flight date |
| Outbound time preference | Toggle | Morning or Evening |
| Return time preference | Toggle | Morning or Evening |

**Time slot definitions:**
- Morning: 06:00 – 13:00 (local departure time)
- Evening: 13:00 – 23:59 (local departure time)

**Trip type**: Round trip only. Departure airport = return airport (same UK airport both ways).

On submit, the form triggers two parallel Amadeus flight offer searches: one for the outbound leg and one for the return leg.

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

A "Save Trip" button persists the trip to Supabase. The `created_by` field is automatically set to the currently authenticated user.

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

Trips can be deleted from the dashboard by the **Owner only**.

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

### 7.7 Audit Log

Every create, update, and delete action on a trip is recorded in an `audit_log` table.

The audit log is viewable by both Owner and Assistant via a dedicated `/audit` page.

**Each audit log entry shows:**
- Timestamp
- User who performed the action (name + email)
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
| role | varchar | `owner` or `assistant` |
| display_name | varchar | Human-readable name shown in UI and audit log |
| created_at | timestamptz | Auto |

### `trips` table

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| departure_airport | varchar(3) | IATA code |
| destination_airport | varchar(3) | IATA code |
| source | varchar(10) | `search` or `manual`, default `search` |
| outbound_airline | varchar(100) | Nullable — null for manual trips |
| outbound_flight_number | varchar(10) | Nullable — null for manual trips |
| outbound_departure_at | timestamptz | Full datetime |
| outbound_arrival_at | timestamptz | Nullable — null for manual trips |
| return_airline | varchar(100) | Nullable — null for manual trips |
| return_flight_number | varchar(10) | Nullable — null for manual trips |
| return_departure_at | timestamptz | Full datetime |
| return_arrival_at | timestamptz | Nullable — null for manual trips |
| days_outside_uk | integer | Pre-calculated |
| created_by | uuid | Foreign key → auth.users |
| last_modified_by | uuid | Foreign key → auth.users |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto-updated on change |

### `audit_log` table

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| performed_by | uuid | Foreign key → auth.users |
| action | varchar | `created`, `updated`, `deleted` |
| trip_id | uuid | Foreign key → trips (nullable if deleted) |
| trip_snapshot | jsonb | Full trip state at time of action |
| changed_fields | jsonb | `{ field: { before, after } }` for updates |
| created_at | timestamptz | Auto |

Row-level security (RLS) is enabled on all tables. The `audit_log` is readable by all authenticated users but writable only by the service role (server-side only).

---

## 9. API Routes

| Route | Method | Description |
|---|---|---|
| `/api/flights/search` | POST | Calls SerpAPI, returns top 3 outbound + top 3 return flights (BA prioritised) |
| `/api/trips` | GET | Fetch all trips |
| `/api/trips` | POST | Save a new trip (`source: search` or `source: manual`); sets `created_by` from session |
| `/api/trips/[id]` | DELETE | Delete a trip — Owner only |
| `/api/audit` | GET | Fetch audit log entries |

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

| Route | Description |
|---|---|
| `/` | Dashboard — upcoming & past trips |
| `/search` | Flight search form + results |
| `/audit` | Audit log — all user actions |
| `/login` | Email/password login (+ Google OAuth for owner) |
| `/forgot-password` | Request a password reset email (public) |
| `/reset-password` | Set a new password after clicking the reset link (public) |

---

## 12. UI/UX Notes

- Clean, minimal design — this is a personal utility tool
- Mobile-responsive layout (Tailwind responsive classes)
- Flight cards have a clear selected/unselected state
- British Airways flights display a prominent **BA badge** and always appear first in the list
- The days outside UK count is visually prominent in the trip summary and dashboard cards
- Trip cards show "Added by [name]" and "Last edited by [name]" attribution
- The delete button is hidden for users with the Assistant role
- Loading states shown during Amadeus API calls (skeleton or spinner)
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

---

## 14. Out of Scope (Future Considerations)

- Email/calendar reminders for upcoming trips
- Cumulative days outside UK across all trips (yearly total)
- Group/multi-passenger trips
- Open-jaw or multi-city itineraries
- Fare class / cabin selection
- Export to CSV/PDF
- Additional user roles beyond Owner and Assistant
- Airline preference filtering (beyond BA priority)
