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
