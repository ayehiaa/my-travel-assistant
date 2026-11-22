# Tasks: 029 Health & Daily Routines

## Phase P1a — Daily loop

### Data + access
- [x] T1 Migration `supabase/migrations/20261122_health_p1a.sql` (tables, owner-only RLS, bucket, CHECKs) + `supabase/apply_health_p1a.sql` (pre-checks, verify); tested on local PostgreSQL 16 (apply ×2, RLS cross-user checks)
- [x] T2 `FeatureKey` + `'health'`, `FEATURE_INFO`, `accessBadge`; admin toggle + "Health enabled" / last log date; invitation checkbox + e-mail bullet; CHECK-violation handling (admin PATCH, invite, signup)
- [x] T3 Audit actions `health_consent_given`, `health_programme_activated` (type, pills, CHECK); hidden from assistants
- [x] T4 Nav link (Health add-on only); `/api/portfolio/ai-key` accepts Health users

### Pure logic (tested)
- [x] T5 `programmeSchema.ts` — full §3.1 definition schema (+ tests)
- [x] T6 `seedProgramme.ts` — 12-week template incl. sessions/exercises/blocks (+ tests: every §3.1 area, no excluded movement)
- [x] T7 `targets.ts` — profile, TDEE, targets with formulas, overrides (+ tests reproduce the seed numbers)
- [x] T8 `time.ts` — timezone dates, weeks, zoned instants (+ tests)
- [x] T9 `checkin.ts` — 7-day average, trend, rate, creatine note, sleep duration + consistency (+ tests)
- [x] T10 `nutrition.ts` — schemas, totals, remaining budget, ±15%, slots, components (+ tests)
- [x] T11 `rules.ts` — rules engine + ranking (+ tests per rule)
- [x] T12 `foodLibrary.ts`, `foodEstimate.ts`, `openFoodFacts.ts`, `exif.ts`, `healthHub.ts` (+ tests)

### Server + API
- [x] T13 `healthServer.ts`, `healthPhotos.ts`, `openFoodFactsClient.ts`; `callClaude` image blocks; `health_food` model role
- [x] T14 Routes: consent, enrol, checkin, food/estimate, food, food/[id] (PATCH/DELETE), foods/search

### UI
- [x] T15 `/health` page: migration / consent / enrolment / tabs states
- [x] T16 Consent gate, enrolment wizard (profile → targets with formulas → start date)
- [x] T17 Today: check-in card, remaining budget, target bars (sat fat target + ceiling), components (weekly x of y), recommendations (max 3), meal-slot timeline, quick log (text + camera)
- [x] T18 Log: day view, edit/delete entries, date picker; item editor (portions, values, OFF search, remember)
- [x] T19 Progress: 7-day average chart (portfolio LineChart), rate/week, sleep
- [x] T20 Programme: read-only programme + targets with formulas + AI key card; Training placeholder

### Docs / gate
- [x] T21 plan.md decisions, CLAUDE.md "Current Feature Plan", `.specify/feature.json`
- [x] Q1 `npm run build`, `npm test`, `npm run lint`

### Rule coverage (spec §11) — see `RULE_COVERAGE` in `src/lib/health/rules.ts`
| §6.1 type | Seed rule | Phase | Test |
|---|---|---|---|
| Daily ceiling / target | sat fat 15 g / 18 g; kcal; protein; fibre | P1a | rules.test.ts |
| Component (day) | stanols, beta-glucan, soy, nuts, pulses | P1a | rules.test.ts |
| Component (week) | oily fish 2×/week | P1a | rules.test.ts |
| Timing | stanols with a meal; caffeine after 14:00; last meal ≥2 h before bed | P1a | rules.test.ts |
| Per-meal structure | one starch per meal; protein every occasion | P1a | rules.test.ts |
| Budget trade-off | treat uses sat-fat spare, pay by dropping starch | P1a | rules.test.ts |
| Tracking | "don't track" morning temperature (never offered as an input) | P1a | — |
| Timing (training coffee), schedule, progression, safety | — | P1b | — |
| Adjustment | fortnightly ±150 kcal | P2 | — |

## Phase P1b — Training

### Data
- [x] T22 Migration `supabase/migrations/20261122b_health_p1b.sql` (workouts, sets, joint checks, professional approvals; owner-only RLS + parent checks) + `supabase/apply_health_p1b.sql` (P1a pre-check, verify); tested on local PostgreSQL 16 (pre-check, apply ×2, constraint, RLS cross-user)

### Pure logic (tested)
- [x] T23 `training.ts` — week/block, effective prescription (B1 / light wk4 / B2 table sets + failure / light wk8 60% / B3 4 sets, compound/isolation, drop set / wk12 deload + retest) (+ tests)
- [x] T24 `training.ts` — progression (+2/+4 kg, holds +15 s to cap, bands, bodyweight, stall → add set, suppression) (+ tests)
- [x] T25 `training.ts` — schedule (A→B→C, spacing, missed, week cut short → C first), order warning, coffee timing (+ tests)
- [x] T26 `training.ts` — excluded movements, travel names, unlocks, workout input validation, player helpers (+ tests)
- [x] T27 `painRules.ts` — check outcome, joint status, pain-rule streak, exercise safety, next-morning due, inputs (+ tests)
- [x] T28 `rules.ts` — training context: joint safety findings + pre-training coffee (+ tests)

### Server + API
- [x] T29 `trainingServer.ts` loaders + `loadTrainingContext`; `evaluateDay` training signals (best effort, today only)
- [x] T30 Routes: `POST /api/health/workouts`, `DELETE /api/health/workouts/[id]`, `POST /api/health/joint-checks`, `POST /api/health/approvals`

### UI
- [x] T31 Training tab overview (banner, joint status + clearance, today, week schedule, unlocks + physio approval, recent sessions, history links)
- [x] T32 Session player (prescriptions, notes, video, last time, per-set load/reps/seconds, RIR 0–4 + failure, rest timer, supersets, drop-set prompt, travel mode, pain score, done/partial/skip with reason, local draft)
- [x] T33 Exercise history (table + top-set chart)
- [x] T34 Today: next-morning joint check card + "Today's training" card; Log: the day's sessions + joint scores

### Docs / gate
- [x] T35 plan.md P1b decisions, CLAUDE.md "Current Feature Plan"
- [x] Q2 `npm run build`, `npm test`, `npm run lint`

### Rule coverage update (P1b)
| §6.1 type | Seed rule | Test |
|---|---|---|
| Timing (training) | pre-training coffee before 14:00; skip it for evening sessions | rules.test.ts, training.test.ts |
| Schedule | ≥1 day between lifts; A→B→C; C first if short; missed sessions roll forward | training.test.ts |
| Progression | top of range → +2/+4 kg; stall ×2 → add a set; holds +15 s; bands; block sets/reps; light weeks; deload | training.test.ts |
| Safety | pain ≤3 & settled; >3 / next-day soreness / swelling → reduce; red flags → disabled until clearance; excluded movements; sit-to-stand / step-up unlocks | painRules.test.ts, training.test.ts |

## Phase P2 — Feedback loop

### Fix first
- [x] T36 Block 2 knee progression: `blockProgressions` in the exercise schema + seed (wall sits → 60 s cap, band TKE → "Use a stronger band"), only with the pain rule passed; today's cap drives progression; `upgradeSeedDefinition` for existing copies (+ tests in training.test.ts, seedProgramme.test.ts)

### Data
- [x] T37 Migration `supabase/migrations/20261122c_health_p2.sql` (11 tables, owner-only RLS + parent checks, audit CHECK full list) + `supabase/apply_health_p2.sql` (P1a + P1b pre-checks, verify); tested on local PostgreSQL 16 (pre-checks, apply ×2, RLS cross-user)
- [x] T38 Audit actions `health_adjustment_accepted` / `health_adjustment_declined` (type, pills, health filter)

### Pure logic (tested)
- [x] T39 `units.ts` — kg/lb, cm/in, mmol/L ↔ mg/dL (chol / TG)
- [x] T40 `cardio.ts` — types (allowed / avoid), HR zone flag, weekly minutes, steps status, intervals unlock; `painRules.recoveryOk`
- [x] T41 `adjustment.ts` — fortnight periods, ≥5 weigh-ins per week, bands (boundaries → no change), creatine caveat, apply (protein kept, carbs absorb, floor), mid-point review
- [x] T42 `measurements.ts` — waist bands + reminder, lipid input/conversion/non-HDL, escalation after week 12, milestones (state, expected vs actual)
- [x] T43 `weeklyReview.ts` — adherence stats + deterministic top-3 focus
- [x] T44 `travel.ts` — trip ranges, per-day timezone resolution, restaurant tips + prompt note
- [x] T45 `healthSettings.ts`, `reminders.ts` (schedule, quiet hours, due window, wording, email/push render), `pushConfig.ts`, `photoCleanup.ts`

### Server + API + jobs
- [x] T46 `p2Server.ts`, `reviewServer.ts`, `reminderDelivery.ts`, `healthServer.effectiveTimezone`
- [x] T47 Routes: activity, progress-data, progress-photos, adjustments, settings, day-timezones, push; food/estimate restaurant mode
- [x] T48 Inngest: `health-reminders-cron` + `health-reminders-user`, `health-photo-cleanup`; registered in `/api/inngest`
- [x] T49 PWA manifest, `public/sw.js`, icon; middleware public paths; `web-push@3.6.7` pinned

### UI
- [x] T50 Today: travel mode card + day timezone control, adjustment proposal, "This week" (mid-point / milestone / waist), cardio & steps, restaurant mode in Log food, weight units
- [x] T51 Training: cardio card, travel pre-selection in the player; Log: cardio & steps for the day
- [x] T52 Progress: proposal / insufficient data, adjustment history, waist, labs, milestones, progress photos, weekly reviews
- [x] T53 Programme: Health settings panel (units, reminders, quiet hours, training time, review day/time, push)

### Docs / gate
- [x] T54 plan.md P2 decisions, CLAUDE.md "Current Feature Plan"
- [x] Q3 `npm run build`, `npm test`, `npm run lint`

### Rule coverage update (P2)
| §6.1 type | Seed rule | Test |
|---|---|---|
| Adjustment | fortnightly 7-day averages (≥5 weigh-ins/week): <0.4 kg → −150; 0.4–1.2 → none; >1.2 → +150; creatine caveat | adjustment.test.ts |
| Component (week) / cardio | Zone 2 4 × 30 min, HR 104–122, avoid list, intervals from week 5 with recovery OK | cardio.test.ts, painRules.test.ts |
| Daily movement | 8,000–10,000 steps | cardio.test.ts |
| Tracking | waist fortnightly + bands; lipids week 1 / 12 + LDL escalation; milestones | measurements.test.ts |
| Progression (knee, Block 2) | wall sit ≤ 60 s and stronger band only with the pain rule passed | training.test.ts |

---

## Phase P3 — Convenience

### Data
- [x] T55 Migration `supabase/migrations/20261122d_health_p3.sql` (programme versions columns, 3 tables, set sync columns, owner-only RLS, audit CHECK full list) + `supabase/apply_health_p3.sql` (P1a/P1b/P2 pre-checks, verify); tested on local PostgreSQL 16 (pre-checks, apply ×2, CHECKs, RLS cross-user)
- [x] T56 Audit actions `health_programme_imported` / `health_programme_updated` / `health_data_exported` / `health_data_deleted` (type, pills, health filter)

### Pure logic (tested)
- [x] T57 `programmeImport.ts` — sections, normalisation, per-section status, parse, assemble, replace, diff, templates, upload paths
- [x] T58 `programmeEdit.ts` — retarget after edit (adjustments kept), targets for switch
- [x] T59 `mealPlan.ts` — week plan, swaps within a slot, ingredient dictionary + parsing, aggregation by aisle, share text, AI split parsing
- [x] T60 `clinicianExport.ts` + `clinicianPdf.ts` — report assembly, CSV, PDF (pdf-lib 1.17.1)
- [x] T61 `offlineQueue.ts` — queue ops, LWW merge per set index, grouping, server merge, idempotent replay
- [x] T62 `barcode.ts` — GS1 validation, OFF barcode mapping, portions, scaling
- [x] T63 `dataRights.ts` — table list (checked against migrations), confirmation, export document

### Server + API
- [x] T64 `callClaude` PDF document blocks; AI roles `health_import`, `health_ingredients`
- [x] T65 `p3Server.ts`, `workoutWrite.ts` (shared with POST /workouts), `dataRightsServer.ts`, `lookupBarcode`
- [x] T66 Routes: programme/import (+ upload-url, [id], [id]/save), programme (versions / edit / restore), programme/switch
- [x] T67 Routes: meal-plan, meal-plan/ingredients, export/clinician, foods/barcode, workouts/sync, data/export, data/delete
- [x] T68 Photo cleanup job also removes import uploads older than an hour

### UI
- [x] T69 Programme tab sub-views + nav; generic `SectionValueEditor`
- [x] T70 Import upload + step-by-step review (status chips, AI notes, confirm per section, save / save & start)
- [x] T71 Edit by section, version history with diff summaries + restore, programme switcher
- [x] T72 Meal plan week view with swaps, shopping list (aisles, ticks, copy/share, AI split); Today link
- [x] T73 Clinician export form; Your data (export JSON, typed delete); link from Health settings
- [x] T74 Barcode scanner (BarcodeDetector + manual entry) in Log food and the item editor
- [x] T75 Offline set queue in the session player + "Offline — n sets queued" banner with auto-sync (player + Training tab)

### Docs / gate
- [x] T76 plan.md P3 decisions, CLAUDE.md "Current Feature Plan"
- [x] Q4 `npm run build`, `npm test`, `npm run lint`

### Acceptance coverage (P3)
| Story | Acceptance | Where |
|---|---|---|
| US1.2 | draft with extracted / needs review / not found; nothing activates until every section is confirmed | programmeImport.test.ts, import/[id]/save |
| US1.4 | edit any field later; versioned with what changed and when | programmeImport.test.ts (diff), programme PATCH, Version history |
| US13 | week rotation with swaps within a slot; shopping list from the planned week | mealPlan.test.ts, Meal plan view |
| US14 | PDF/CSV of weight & waist trend, labs, adherence, training for a date range | clinicianExport.test.ts, export/clinician |
| §9 | set logging works with intermittent connectivity (queue and sync) | offlineQueue.test.ts, workouts/sync |
| §8 | export (JSON + photo links) and hard delete in Settings | dataRights.test.ts, data/export, data/delete |
