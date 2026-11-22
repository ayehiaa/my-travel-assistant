# Feature Specification: Lifestyle UX redesign

**Feature dir**: `specs/032-lifestyle-ux-redesign` · **Created**: 2026-11-22 · **Status**: Implemented
**Input**: Owner: "the whole user experience and interface for the lifestyle pages is very wordy and complicated".
Builds on `specs/029-health-routines` (P1a–P3.2, incl. the starter week). Presentation and navigation only.

## User scenarios

1. **Today at a glance (P1)** — Opening Lifestyle shows calories left, protein, sat fat (with limit marker), daily
   food-goal chips, the morning check-in as one row, ONE next best action and today's plan (session → Start, cardio →
   Log, steps input). Everything else is behind ⓘ, disclosures or another tab.
2. **Log food in < 90 s (P1)** — "+" (every tab) or "Log food" opens a sheet: text box, Photo / Upload / Barcode,
   Eating out + No butter/oil chips, meal + time, sticky Estimate → editable list → sticky Save. Recent meals and
   favourites re-log with one tap; a goal chip suggests saved foods that close the gap (one tap to log).
3. **Hevy-style workout (P1)** — Set | Previous | kg | reps | ✓ rows prefilled from last time; one tap ✓ completes the
   set and starts the rest timer (−15 / +15 / Skip, vibration + notification). Effort (Easy / Medium / Hard /
   Failure) after ✓. Pain score + notes in the finish sheet; travel mode and skip in ⋯.
4. **Progress summary first (P2)** — this week's tiles (weight, waist, food goals, training, cardio, steps, protein,
   sleep) with status colour + word, then weight / waist charts with 1M / 3M / All, then reviews and health checks.
5. **Plan in plain words (P2)** — targets, the week, phase, end date; list rows to Meal plan, Edit, Import, Settings,
   Export & data; programme details in disclosures.

## Requirements

- FR-1 Tabs Today · Food · Train · Progress · Plan (`?tab=today|food|train|progress|plan`); old `log`, `training`,
  `programme` redirect to the new names keeping the rest of the query. Route stays `/health`; menu label "Lifestyle".
- FR-2 Floating "+" on every tab (not in the workout player) → Food · Photo · Upload · Barcode · Recent · Weight ·
  Workout · Cardio.
- FR-3 Copy: headings ≤ 3 words, helper text ≤ 1 short line, explanations in ⓘ / disclosures; no jargon in primary UI
  (RIR → effort, block → Phase N, week 0 → Starter week).
- FR-4 One primary action per screen; secondary actions in ⋯ or disclosures.
- FR-5 Semantic colour always paired with an icon/word: green on track, amber close / over target, red over limit.
- FR-6 Mobile-first: bottom tab bar, ≥ 44 px targets, sticky bottom actions in sheets and the player, no horizontal
  overflow at 375 px.
- FR-7 No behaviour / API / schema changes; every existing feature stays reachable (inventory in `tasks.md`).
- FR-8 Dev-only preview `/dev/lifestyle-preview` with fixtures: 404 in production; middleware lets it through only
  when `NODE_ENV !== 'production'`.

## Success criteria

- Today primary UI ≈ 60 % fewer words (see `plan.md` estimate). Screenshots in `screenshots/` (375×812, 1280×800).
- `npm run build`, `npm test`, `npm run lint` pass.

## Decisions made autonomously

1. Effort picker maps to the stored RIR: Easy = 3 (shows for RIR ≥ 3), Medium = 2, Hard = 1 (shows for 0–1),
   Failure = `toFailure`. RIR 0 and 4 can no longer be entered exactly; progression only needs "RIR recorded or
   failure", so suggestions are unchanged.
2. ✓ on an empty reps / seconds field uses the target top (placeholder) — one tap like Hevy. Sets are prefilled from
   the same set last time; load uses the existing suggested start load.
3. One-tap re-log (recents, favourites, goal-chip suggestions) posts to the existing `POST /api/health/food` with the
   item values as stored; time = now (or 12:00 for a past day), meal = the slot for that time.
4. Food tab can log for the day being viewed (the API already accepted past dates; previously only Today logged).
5. Bars are SVG rects with percentage `width` attributes (no inline styles). Body scroll lock in the sheet sets
   `document.body.style.overflow` from JS (not a JSX style).
6. Rest-timer notification: permission is asked inside the first ✓ tap; shown only when the page is hidden.
7. Plan gets a `settings` sub-view (reminders, units, AI key); reminder deep links now use the new tab names.
8. "All" chart range = since programme start (max one year, at least 3 months).
9. Weekly components in the starter week show "not due" chips (P3.2 behaviour kept); week chip shows "Starter week",
   the full P3.2 label is in the ⓘ.
