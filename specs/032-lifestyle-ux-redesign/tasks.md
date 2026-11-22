# Tasks: Lifestyle UX redesign

## Build
- [x] T1 Tab rename + legacy redirects + `settings` view (`healthHub.ts`, tests)
- [x] T2 Pure helpers `lifestyleUi.ts` + tests (meters, chips, effort, prefill, week dots, phases, recents, ranges)
- [x] T3 UI primitives in `src/components/health/ui/`
- [x] T4 Today loader/view, chips sheet, compact check-in, next best action, today's plan
- [x] T5 Food loader/view, log sheet, recents, date switcher, entry rows → detail sheet
- [x] T6 Train overview (week strip, Start, disclosures) + Hevy-style player
- [x] T7 Progress summary tiles, trend charts with ranges, collapsed reviews, health checks
- [x] T8 Plan overview + list rows + settings sub-page
- [x] T9 "+" FAB sheet on every tab, new tab bar, page header
- [x] T10 Dev preview + middleware bypass (non-production), Playwright screenshots 375 / 1280, fixes (chip row
      overflow, cardio dots, waist form collapsed)
- [x] T11 Quality gate (build, test, lint), CLAUDE.md pointer

## Feature inventory (each verified reachable after the redesign)
Today
- [x] Morning check-in: weight (kg/lb), bed/wake, supplements, edit → compact row (Today; + → Weight opens it)
- [x] Next-morning joint check (pain, swelling, red flags) → Today card when due
- [x] Fortnightly calorie adjustment accept/decline → Today + Progress card (reason in ⓘ)
- [x] Mid-point review / milestone / waist reminders → Today notice rows → Progress
- [x] Travel mode banner, eating-out rules, day-boundary timezone control → Today travel row ⓘ
- [x] Joint "stop" alert → Today + Train
- [x] Recommendations (ranked) → next best action + "N more"
- [x] Session recommendation + Start (travel flag kept) → Today plan row, Train
- [x] Remaining kcal / protein / sat fat (target + ceiling) → meters; carbs/fat/fibre bars, ±15% band, starch servings
      left → Food "Day details"
- [x] Component progress incl. weekly + starter-week "not due" → chips
- [x] Weight 7-day average, sleep summary, water-weight note → Progress tiles / weight ⓘ
- [x] Meals per slot (logged / kcal) and entry edit → Food timeline
Food
- [x] Quick log: text, photos (camera, upload, paste/drop), barcode, eating out, no butter/oil, time, meal slot,
      Enter by hand, estimate, ordering tips, item editor, save
- [x] Item editor: name, grams, portion presets, assumption chips (remove / add back), values, components, source,
      confidence, treat, remember, add item, Open Food Facts search, barcode
- [x] Entry: view, edit text/photos/time/slot/flags, re-calculate, save, delete → entry sheet
- [x] Past days (date picker, ‹ ›), day check-in / training / joint summary → Food
- [x] Cardio & steps (types, avoid list confirm, HR flag, intervals unlock, delete, steps) → Food / Train disclosure,
      Today plan rows
- [x] NEW recent & favourites one-tap re-log; chip suggestions one-tap log
Train
- [x] Week schedule with statuses (done/partial/skipped/moved/missed/before start) → week strip (+ titles)
- [x] Phase / week / light & deload / rep range / effort / technique / spacing rules → chip + ⓘ
- [x] Joint warning + physio clearance → alert card
- [x] Unlocks + physio approval toggle, excluded movements → "Joint & unlocks"
- [x] Recent sessions (open, delete) → disclosure
- [x] Exercise history page (chart + table) → disclosure links, player ⓘ "History"
- [x] Offline queue banner + sync → overview + player
- [x] Player: prescriptions, last time, load/reps/hold, add set, effort/failure, last-set-to-failure, drop set,
      supersets, rest timer, travel variants + video, unlock exercises, joint safety, draft restore/discard,
      backdated sessions, pain score, notes, done / partial / skip with reason, offline save
Progress
- [x] Weight trend chart, change/week, % body weight, since start, programme range, adjustment history
- [x] Waist entry/delete, bands, due, change; labs entry/delete/escalations; milestones toggle; progress photos
- [x] Weekly reviews (live + stored, last week auto-stored); sleep summary; P2 "database update" notice
Plan
- [x] Programme name, dates, week label, phase, timezone, description, disclaimer
- [x] Targets with formulas and adjusted-by-check note → tiles + ⓘ
- [x] Components, meal slots, rules, eating out, sessions, phases, exclusions, cardio, steps, sleep, supplements,
      milestones, outcomes → details disclosures
- [x] Edit & versions, programme switcher, import (upload/review drafts), meal plan + shopping list, clinician export,
      data export/delete → list rows / sub-pages
- [x] Settings (units, reminders, push) + AI key → Settings sub-page (`?tab=plan&view=settings`)
Hub
- [x] Consent gate, enrolment wizard, migration / error notices unchanged
- [x] Old links `?tab=log|training|programme` redirect; reminder links use new names
