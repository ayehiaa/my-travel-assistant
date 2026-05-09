# Handoff: Sojourn Visual Rebrand

## Overview

A bold, playful visual rebrand of the existing **My Travel Assistant** app — renamed **Sojourn**.

The functional surface (Dashboard, Search, Timeline, Settings, Audit, Login, Landing, multi-city, manual past trips, assistants, reference date) **already exists in the repo**. This handoff is **almost entirely a visual rebrand pass**, with two small functional tweaks on the dashboard stats.

## About the Design Files

The files in this bundle are **design references** — HTML / JSX prototypes built outside the production codebase to communicate the target look and feel. **They are not production code to copy directly.**

The task is to **recreate this visual language inside the existing Next.js + Tailwind codebase**, using its file structure (`src/app/...`, `src/components/...`), its existing routing, its existing API calls, and its existing data shapes. Do not introduce React Babel runtimes, do not duplicate components — modify the real ones in place.

If a design choice in the prototype conflicts with how the production app actually behaves, **the production behavior wins** — change the visuals, not the logic.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, radii, shadows, motion, and copy are all locked in the prototype. Implement pixel-close — match the design tokens listed below exactly.

---

## Functional Changes (the only logic edits)

These are NOT visual; do them as part of this rebrand:

### Dashboard stats row — replace one stat, reformat another

The dashboard renders a 4-up stat row. Change the third and fourth tiles:

| Old | New |
| --- | --- |
| Stat: **"Days abroad · 2026"** with raw number (e.g. `42`) | Show as **`{N}/90`** (e.g. `42/90`) with subtitle **"max 90 per rolling year"**. Same data source. |
| Stat: **"Manual entries"** counting `source = 'manual'` trips | Stat: **"Journeys this year"** — count of trips (any source) whose first leg's `departure_at` is in the current calendar year. Subtitle: **"upcoming + completed"**. |

The icon for "Journeys this year" can stay the existing icon or use a clock/journey glyph — tile color/tone unchanged.

---

## Screens / Views

The prototype covers every screen the production app already has. For each one, the implementation is "match the prototype's visual language inside the existing component file."

### 1. Public Landing (`src/components/landing/LandingPage.tsx`)

**Purpose:** Marketing entry point for unauthenticated users.

**Layout:**
- Dark navy background with two soft radial glows (yellow top-right, coral bottom-left)
- Top nav (brand · 3 anchor links · Sign in + Start free)
- Hero: 60/40 split. Left = headline + subhead + dual CTA + trust line. Right = 3 floating tilted trip cards + a dark "Annual days abroad 73/90" meter card
- Stat strip (4 large numbers) with subtle dark backdrop
- "How Sojourn works" — 3 columns of glass-style cards numbered 01/02/03
- Assistants section — text on left, a card on right showing one Main row delegating to two Assistant rows
- 90-day rule explainer — 3 columns of glass cards
- Bright yellow→coral gradient CTA block ("Plan your next trip without the maths")
- Footer — brand, links, credit

**Copy:** Use the prototype's exact copy. The brand voice is calm/sober ("a travel planner that respects the 90-day rule" / "the calmer way to plan flights").

**Reference file:** `landing.jsx`

### 2. Login (`src/app/login/page.tsx`)

**Layout:** Two-column. Left = navy gradient hero with the brand mark, big two-line headline (white with **yellow accent words**: "Track every **day** you spent **abroad.**"), and 4 dashed-border tilted "passport-stamp" pills. Right = white panel with form + Google button.

The brand mark on the left should link to the landing page.

**Reference:** `audit-login.jsx`

### 3. Top Nav (`src/components/Nav.tsx`)

**Layout:** Solid `--blue-700` bar with:
- Brand mark (yellow rotated-tile "S" + wordmark "Sojourn") on the left
- Pill-shaped tab group center: Dashboard · Plan a trip · Timeline · Audit log · Settings *(Settings only when role === main)*
- Right side:
  - **Main account:** small text "Ziad · Main" + avatar circle
  - **Assistant account:** "VIEWING" label + select dropdown listing principals + "on behalf of {firstName}" italic + avatar

**Reference:** `app.jsx` → `Nav` component.

### 4. Dashboard (`src/app/page.tsx` + dashboard components)

**Layout sections, top to bottom:**
1. **Hero band** — navy gradient with two radial color blobs. 60/40 split. Left = eyebrow ("90-day rule · window ends 5 Apr 2026"), big two-line headline ("Hello, **Ziad** / where to next?"), short subhead, two CTAs ("+ Plan a new trip" yellow, "+ Log a past trip" ghost-on-dark). Right = glass card showing huge `73/90` annual days, gradient meter, used %/remaining.
2. **Stat row** — 4 cards (Upcoming trips / Countries 2026 / Days abroad 2026 / Journeys this year). Each card has a tinted icon block, label, big display-font value, small delta line. **(Apply the functional changes from above.)**
3. **Year strip** — single card with 12-month grid; trip pills colored by their cover gradient, stacked across rows; "NOW" coral marker line.
4. **Upcoming trips grid** — 3-up cards. See TripCard spec below.
5. **Past trips list** — dense single-card list with tinted color swatch, route chain, country, dates, flight numbers, saved-by, days count.

**Reference:** `dashboard.jsx`

#### TripCard spec (used both upcoming + past)

- **Cover** (140px tall): one of 8 preset linear-gradients, label pill top-left (round-trip tag, OR `3-city` blue pill for multi, OR `Manual` lavender pill), `{N}d abroad` yellow pill top-right, country flag + city name in display font white-with-shadow bottom-left.
- **Body:** Route chain as `LHR → DUS → CDG → LHR` in display font 22px (arrows are muted color). Date range row + country. Dashed top-border, then per-leg list (`OUT` / `RTN` / `L1`/`L2`/`L3` mono badge + flight number + when). For manual trips, replace flight list with italic "Manually added · flight details not recorded". Footer line: "Added by X · Edited by Y" + "Manage →" right-aligned blue.

#### Add-Past-Trip Modal

Modal opens from "+ Log a past trip" hero CTA and "+ Add past trip" past-list header. Lavender gradient header strip; from/to selects, two date pickers (max=today, return min=depart); when valid, a yellow-tinted summary strip shows `LHR → CAI → LHR` and "X days outside UK"; Save / Cancel in a paper-tinted footer.

**Reference:** `dashboard.jsx` → `AddPastTripModal`

### 5. Search (`src/app/search/page.tsx` + `SearchForm.tsx` + results)

**Hero band:** navy gradient with "Where are you going?" / subhead.

**Trip-type tabs:** white-on-translucent pill segmented control inside the hero — `Round trip` / `Multi-city · up to 3 legs`.

**Round-trip bar:** white card with **3px solid yellow border**, 5 columns: From / To / Depart / Return (with `Xd` sub-label) / yellow Search button. Dotted vertical separators between fields. Below the bar: two morning/evening pill toggles for outbound and return.

**Multi-city stack:** white card same yellow border, vertical stack of leg rows. Each row has a blue "Leg N" pill, From → To selects with arrow, Date, inline morning/evening pills, an × button to remove (only on legs 2+). When fewer than 3 legs, a dashed-blue "+ Add leg" button on the left of the bottom action row; otherwise show "Maximum 3 legs" muted. Right side of action row = yellow "Search all legs →".

**Auto-fill rule:** when the user sets a leg's `to`, the next leg's `from` autofills with that destination.

**Results:** N-column grid (2 for round-trip, 2–3 for multi-city). Each column shows the leg eyebrow ("Leg 1 · LHR → DUS") in a leg-specific accent color (blue / coral / lavender), then a list of `FlightCard`s. **British Airways flights surface first** with a tiny `BA Priority` chip next to airline name. Selected card gets a thicker blue border, blue-tinted glow, and a "✓ Selected" pill that overhangs the top border.

**Trip Summary** (review card after a flight is picked for every leg): big navy gradient header with route chain in display font (yellow → arrows), small cities subline, yellow days-pill on the right showing N days + "Annual will become {used + N} / 90". Below: one column per leg with label / when / flight number + airline / mini route. Footer: total price + saved-by line + yellow "Save to my trips ✓".

**Reference:** `search.jsx`

### 6. Timeline (`src/app/timeline/page.tsx`)

**Page head:** eyebrow line ("12-month view · Nov 2025 → Oct 2026") + big "Timeline" h1 + secondary actions ("Export ical" ghost, "+ New trip" yellow).

**4-up stat row:** Upcoming / Past / Countries / Annual days `{used}/{max}` with reference-date subtitle.

**Main canvas (white card):**
- Header row: title + legend (Upcoming · Past · Today)
- Month axis row at top, dashed grid lines underneath
- Trip bars laid into rows by overlap-avoidance: leftmost free row, else new row. Bar height 40px, rounded 10px, painted with the trip's gradient. Inside each bar: country flag, route chain mono, days pill on the right `Nd`. Past trips at 82% opacity. Manual trips marked with a tiny corner dot.
- Vertical coral "TODAY" line spanning the full canvas.
- Hover: dark tooltip popping above the bar showing flag + city/country, full date range, days outside UK, route chain.

**Reference:** `timeline.jsx`

### 7. Settings (`src/app/settings/page.tsx`)

**Page head:** eyebrow "Account" + "Settings" h1.

**2-column card grid:**
- **Your account** card — avatar + name + email + "Main account" pill + "Edit profile" ghost button.
- **Annual days-abroad reference** card — date input on the left with helper copy, navy-gradient readout on the right with big window-end date, gradient meter, used / remaining.
- **Linked assistants** card (full width) — heading + "+ Invite assistant" yellow CTA. When inviting, a dashed-blue inline row shows email input + Cancel + Send invite. List rows: large avatar, name + "Invite sent" pending pill if applicable, email, linked-on date, "Unlink" ghost button.
- **Danger zone** card (full width, coral-tinted) — Delete account row with red "Delete account" button.

**Reference:** `settings.jsx`

### 8. Audit (`src/app/audit/page.tsx`)

Existing-style table: When / Who (avatar + name + role) / Event / Action pill (created mint, updated sky, deleted coral). Just restyle to match the new tokens; no functional change.

**Reference:** `audit-login.jsx` → `Audit`

---

## Interactions & Behavior

- **Hover on TripCard:** translateY(-3px) + larger shadow.
- **Hover on flight card:** translateY(-1px) + blue border-color.
- **Selected flight:** persistent `box-shadow: 0 0 0 3px var(--blue-100)` + "✓ Selected" pill.
- **Trip-type tab switch:** wipes the search state and seeds default legs (the prototype seeds JFK round-trip / DUS-CDG multi-city; in production keep whatever defaults you already have).
- **Multi-city auto-fill:** changing `to` on leg N sets `from` on leg N+1 (only N+1 — don't cascade).
- **Add-Past-Trip modal:** validates depart < return, both ≤ today; live "X days outside UK" preview.
- **Today line on timeline:** computed from `new Date()`, not a constant.
- **Modal animations:** `modalIn` 0.18s ease (fade) + `modalRise` 0.22s ease (12px slide up).
- **All transforms / transitions stay short** (120–180ms).

## State Management

No new state shapes. The production app already has:
- Trips with `trip_type` (round_trip / multi_city), `legs[]`, `source` (search / manual), `created_by`, `last_modified_by`.
- Settings with `referenceDate`.
- AccountLinks with main → assistants relations.

Everything in this rebrand reads from those existing models.

---

## Design Tokens

Drop these into `src/app/globals.css` as CSS custom properties (or extend Tailwind theme — your call). The prototype's `styles.css` is the source of truth.

### Colors
```
--blue-900: #0a1f4d   /* deep ink, hero gradient end */
--blue-700: #003b95   /* primary brand, nav background, buttons */
--blue-500: #1a73d6   /* hover/accent blue */
--blue-100: #e6f0ff   /* tint, focus rings */
--blue-50:  #f3f7ff

--yellow:        #ffb400   /* CTA fill, accent words */
--yellow-soft:   #fff5d6
--coral:         #ff6f5e
--coral-soft:    #ffe5e1
--mint:          #2bc28a
--mint-soft:     #d6f5e8
--peach:         #ff9a6c
--peach-soft:    #ffe8d9
--lavender:      #8b6fdb
--lavender-soft: #ece4ff
--sky:           #4cc4f5
--sky-soft:      #d9f2ff
--rose:          #ec4ea0
--rose-soft:     #ffe1ef

--ink:    #0a1f4d   /* body text on light */
--ink-2:  #2a3759
--ink-3:  #5b6481   /* muted */
--ink-4:  #8b94ad   /* hint */
--rule:        #e3e6f0
--rule-soft:   #eef0f7
--paper:    #ffffff
--paper-2:  #f6f8fc
--paper-3:  #eef2f9
```

### Trip-cover gradient palette (8 presets used round-robin)
```
1: linear-gradient(135deg, #ff6f5e, #ffb400)   coral → yellow
2: linear-gradient(135deg, #4cc4f5, #1a73d6)   sky → blue
3: linear-gradient(135deg, #2bc28a, #1a8fc2)   mint → teal
4: linear-gradient(135deg, #8b6fdb, #ec4ea0)   lavender → rose
5: linear-gradient(135deg, #ff9a6c, #ff6f5e)   peach → coral
6: linear-gradient(135deg, #ffb400, #ff9a6c)   yellow → peach
7: linear-gradient(135deg, #1a73d6, #8b6fdb)   blue → lavender
8: linear-gradient(135deg, #ec4ea0, #8b6fdb)   rose → lavender
```

### Spacing / radii / shadow
```
--r-sm: 8px
--r:    14px
--r-lg: 20px
--r-xl: 28px

--shadow-sm: 0 1px 2px rgba(10,31,77,.06), 0 1px 3px rgba(10,31,77,.04)
--shadow:    0 4px 12px rgba(10,31,77,.08), 0 1px 3px rgba(10,31,77,.04)
--shadow-lg: 0 18px 40px -12px rgba(10,31,77,.18), 0 6px 12px rgba(10,31,77,.06)

--gap: 18px
```

### Typography

Replace Geist with these (load via `next/font` in `app/layout.tsx`):
```
--display: 'Bricolage Grotesque', 'Plus Jakarta Sans', system-ui, sans-serif
--sans:    'Plus Jakarta Sans', system-ui, sans-serif
--mono:    'JetBrains Mono', ui-monospace, monospace
```

Display font is used on ALL h1/h2/h3, all headline numerics (stats, days pill, prices, flight times, route chains), and brand mark. Sans for body. Mono for flight numbers, dates in audit, leg badges, route chains in timeline bars, and "passport-stamp" labels on login.

### Type scale
```
h1: clamp(40px, 5vw, 64px) / weight 700 / letter-spacing -0.025em
h2: clamp(28px, 3vw, 36px) / weight 700 / letter-spacing -0.02em
h3: 22px / 700 / -0.01em
hero h1: clamp(36px, 4.4vw, 56px)
landing hero h1: clamp(48px, 6vw, 84px)
eyebrow: 12px / 700 / 0.08em / uppercase / ink-3
body: 15px / 400 / line-height 1.5
small: 13px
```

### Buttons
- `.btn-cta` → yellow background, navy ink, weight 700, **2px solid `#d99500` bottom shadow** (gives the chunky pressable feel).
- `.btn-primary` → `--blue-700` background, white text.
- `.btn-ghost` → white background, ink text, 1px `--rule` border.
- `.btn-ghost-on-dark` → translucent white background, white text, white border.
- `.btn-danger` → coral, white text.
- All buttons: `transform: translateY(-1px)` on hover.

---

## Assets

- **Fonts** — Bricolage Grotesque, Plus Jakarta Sans, JetBrains Mono. Add via `next/font/google` in `src/app/layout.tsx`. Drop the Geist imports.
- **Country flags** — emoji (no asset files); already keyed by airport code in `airports`.
- **No images** — every visual surface is solid color or CSS gradient.
- **Icons** — heroicons or lucide is fine; the prototype uses single-glyph placeholders (`✈`, `🌍`, `∑`, `◷`). Pick the closest equivalents in your icon library.

---

## Files in this bundle

These are the prototype source files. **They are reference only.** Read them; do not copy them into the repo.

- `Travel Planner.html` — entry shell that loads everything else
- `styles.css` — **all design tokens + every component's CSS**. This is your visual source of truth. Port to Tailwind utilities or keep as a stylesheet — your call.
- `app.jsx` — app shell + Nav (with main/assistant role split + principal switcher)
- `dashboard.jsx` — Dashboard, TripCard, PastRow, YearTrack, AddPastTripModal
- `search.jsx` — Search, RoundTripBar, MultiCityStack, ResultsGrid, FlightCard, TripSummary
- `timeline.jsx` — Timeline page + Gantt canvas
- `settings.jsx` — Settings page (profile, reference date, assistants, danger zone)
- `landing.jsx` — Public marketing page
- `audit-login.jsx` — Audit table + Login screen
- `data.js` — mock data (use as a shape reference; production data already exists)

---

## Implementation order (recommended)

1. Tokens + fonts in `globals.css` and `tailwind.config.*`. Run dev, confirm builds.
2. Buttons + cards + form fields (primitive components).
3. Nav.
4. Landing + Login (most surface to look at quickly).
5. Dashboard (incl. the two stat tweaks).
6. Search (largest component).
7. Timeline.
8. Settings.
9. Audit.
10. Polish pass — animations, hover states, empty states, responsive (`@media (max-width: 980px)` block in `styles.css`).

Commit between each step. `npm run build` between each step.

---

## What NOT to change

- API routes (`src/app/api/**`)
- Supabase queries / server actions
- Auth flow logic
- Trip / leg / settings / account-link data shapes
- Audit-log writing
- Feature gating (assistants only see what they're delegated to)

This is **visuals + the two dashboard stat tweaks**. Anything else is out of scope for this PR.
